// Для тестов:
// 1) поместить файл env в эту папку
// 2) расскоменти две строки 'TEST'
// 3) закомменти 2 строки 'PROD'
// 4) расскоменти EXECUTE

// TEST
// import dotenv from 'dotenv';
// dotenv.config();

// EXECUTE
// executeCheckTask();

// PROD
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';

import StockAdressesModel from '../models/stockAdresses.js';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';

import {
  getTokenFromNowPayment,
  getTransfer,
  validateAdress,
  createpayout,
  verifyPayout,
  getPaymentStatus,
  getPayoutFee,
  createPayAdress,
} from '../nowPayment/nowPayment.services.js';

import {
  placeOrder,
  checkOrderExecution,
  getWithdrawalInfo,
  makeWithdrawFromStockToNp,
  transferInStock,
  getPrice
} from '../stockKukoin/kukoin.services.js';


import { getOurComissionLimit } from '../modelsOperations/models.services.js';

import { sendTlgMessage } from '../webhooks/webhooks.services.js';


import speakeasy from 'speakeasy';



mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));



export async function executeCheckTask() {
  try {
    console.log('Начинаю cron5: по лимитному ордеру');

    const recordsNew = await RqstStockLimitOrderModel.find({
      status: {
        $in: [
          'new',
          'CoinReceivedByStock',
          'orderPlaced',
          'stockTrtFromTradeToMain',
          'stockSentCoinToNp',
        ],
      },
    }).exec();

    console.log('step 1 | records=', recordsNew);

    if (recordsNew.length == 0) {
      console.log('записей не найдено');
      return;
    }

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('не получен токен от функции getTokenFromNowPayment');
    }

    console.log('step 2 | token=', token);

    for (const item of recordsNew) {
      
      if (item.status == 'new') {
        const payStatus = await getTransfer(token, item.id_clientToMaster);

        if (!payStatus) {
          throw new Error('не получен ответ от функции getTransfer');
        }

        if (payStatus[0].status.toLowerCase() == 'finished') {
          let sendingCoin = '';
          let sendingChain = '';
          let sendingCoinFull = '';

          //монета для перевода
          if (item.type === 'buy') {
            sendingCoin = item.coin2short;
            sendingCoinFull = item.coin2full;
            sendingChain = item.coin2chain;
          }

          if (item.type === 'sell') {
            sendingCoin = item.coin1short;
            sendingCoinFull = item.coin1full.toLocaleLowerCase();
            sendingChain = item.coin1chain;
          }

          //перевести на Биржу с Мастер счета

          //TODO:АКТУАЛЬНО! Получаю адрес из своей БД, а не по апи с биржи
          const addressFinding = await StockAdressesModel.findOne({
            coinShort: sendingCoin,
            coinChain: sendingChain,
          });

          if (!addressFinding) {
            throw new Error('не получен ответ от БД StockAdressesModel ');
          }

          const depositAdres = addressFinding?.adress;

          console.log('step 3 | адрес для перевода=', depositAdres);

          // валидировать адрес
          const validateAdressResponse = await validateAdress(
            depositAdres,
            sendingCoinFull
          );

          if (!validateAdressResponse) {
            throw new Error('не получен ответ от функции validateAdress');
          }

          if (validateAdressResponse != 'OK') {
            console.log('step 4 | адрес не валидный');
            throw new Error('адрес не валидный, в функции validateAdress');
          }

          console.log('step4 | адрес валидный');

          //получить network fees
          const networkFeesFunctionResponse = await getPayoutFee(
            sendingCoinFull,
            item.amount
          );

          if (!networkFeesFunctionResponse) {
            throw new Error('не получен ответ от функции getPayoutFee');
          }

          if (networkFeesFunctionResponse == false) {
            console.log('step5 | не получили инфо про комиссию');
            //FIXME: добавить выход из кода
          }

          const networkFeesResponse = networkFeesFunctionResponse.data.fee;

          console.log('step5 | network fees=', networkFeesResponse);

          // получить нашу комиссию по Лимиту
          const ourComissionResponse = await getOurComissionLimit();

          if (!ourComissionResponse) {
            throw new Error('не получен ответ от функции getOurComissionLimit');
          }

          let ourComission = 0;

          if (
            !isNaN(ourComissionResponse.ourComission) &&
            ourComissionResponse.ourComission !== null
          ) {
            ourComission = Number(ourComissionResponse.ourComission) / 100;
          }

          // сумма для перевода на биржу
          const amountSentToStockValue =
            Number(item.amount) - Number(item.amount) * Number(ourComission);

          // .. сумма, которая дойдет до Биржи
          const amountBeReceivedByStock =
            Number(amountSentToStockValue) - Number(networkFeesResponse);

          console.log('step5.3 | initial num=', item.amount);
          console.log('step5.3 | our comission=', ourComission);
          console.log(
            'step5.3 | amountSentToStockValue=',
            amountSentToStockValue
          );

          const modelOperationResponse =
            await RqstStockLimitOrderModel.findOneAndUpdate(
              { _id: item._id },
              {
                $set: {
                  amountSentToStock: amountSentToStockValue,
                  amountBeReceivedByStock: amountBeReceivedByStock,
                },
              },
              { new: true }
            );

          if (!modelOperationResponse) {
            throw new Error('не получен ответ от бд RqstStockLimitOrderModel');
          }

          console.log(
            'step6 | сумма для отправки на биржу (за минусом net fees)',
            amountSentToStockValue
          );

          //создать запрос на вывод

          const requestData = {
            ipn_callback_url: process.env.WEBHOOKADRESS_FORSTOCK_LIMIT,
            withdrawals: [
              {
                address: depositAdres,
                currency: sendingCoinFull,
                amount: amountSentToStockValue,
                ipn_callback_url: process.env.WEBHOOKADRESS_FORSTOCK_LIMIT,
              },
            ],
          };

          const createPayoutResult = await createpayout(requestData, token);

          if (!createPayoutResult) {
            throw new Error('не получен ответ от функции createpayout');
          }

          const batch_withdrawal_id = createPayoutResult.id;

          const payout_id = createPayoutResult.withdrawals?.[0]?.id;
          if (payout_id == undefined) {
            console.log('ошибка с payout_id ');
            throw new Error('Payout ID not found in withdrawals!');
          }

          // const payout_id = createPayoutResult.withdrawals[0].id;
          console.log('step 7 | withdrawal_id=', batch_withdrawal_id);

          const code2fa = await create2FAcode();
          if (!code2fa) {
            throw new Error('не получен ответ от функции create2FAcode');
          }

          console.log('step 8 | code2fa=', code2fa);

          const verify = await verifyPayout(
            batch_withdrawal_id,
            code2fa,
            token
          );

          if (!verify) {
            throw new Error('не получен ответ от функции verifyPayout');
          }

          console.log('step 9 | verify=', verify);

          if (verify === 'OK') {
            const modelOperation =
              await RqstStockLimitOrderModel.findOneAndUpdate(
                { _id: item._id },
                {
                  $set: {
                    status: 'coinSentToStock',
                    payout_id: payout_id,
                    batch_withdrawal_id: batch_withdrawal_id,
                  },
                },
                { new: true }
              );

            if (!modelOperation) {
              throw new Error(
                'не прошли изменения в бд RqstStockLimitOrderModel'
              );
            }
          }

          console.log('step 10 | монеты отправлены на биржу');
        }
      }

      
      
      if (item.status == 'CoinReceivedByStock') {
        console.log(
          'запуск статуса CoinReceivedByStock - поиск заявок для лимитного ордера'
        );

        // поиск активных лимит ордеров
        const activeRqsts = await RqstStockLimitOrderModel.find({
          status: 'CoinReceivedByStock',
        }).exec();

        if (!activeRqsts) {
          throw new Error('нет ответа от бд RqstStockLimitOrderModel ');
        }

        if (activeRqsts.length === 0) {
          console.log('Нет активных заявок');
          return;
        }

        // console.log(activeRqsts);
        console.log('всего активных ордеров=', activeRqsts.length);

        const groupedData = Object.groupBy(activeRqsts, (item) => item.pair);
        // console.log(groupedData);

        const keys = Object.keys(groupedData);

        for (const pair of keys) {
          const items = groupedData[pair];
          
          const getPriceResult = await getPrice(pair);

          // if (getPriceResult.statusFn && getPriceResult.statusFn == 'ok') {

            if (!getPriceResult) {
              throw new Error('нет ответа от функции getPrice');
            }

            const stockPrice = getPriceResult.data.data.price
            
            console.log(pair, ' price=', stockPrice);

            

            for (const item of items) {
              if (item.type == 'sell') {
                if (stockPrice >= item.price) {
                  console.log(
                    `ПРОДАЖА: мин цена для продажи у клиента ${item.price} | совершаем продажу order id= ${item.id}`
                  );

                  

                  const placeOrderFunction = await placeOrder(
                    item.coin1short,
                    item.coin2short,
                    item.type,
                    item.amountBeReceivedByStock
                  );

                  if (!placeOrderFunction) {
                    throw new Error('ошибка в функции placeOrder');
                  }

                  if (placeOrderFunction.status === 'ok') {
                    const modelResponse =
                      await RqstStockLimitOrderModel.findOneAndUpdate(
                        { _id: item._id },
                        {
                          $set: {
                            order_id: placeOrderFunction.orderId,
                            status: 'orderPlaced',
                            amountAccordingBaseIncrement:
                              placeOrderFunction.amountWithStep,
                          },
                        },
                        { new: true }
                      );

                    if (!modelResponse) {
                      throw new Error(
                        'не записаны изменения в бд RqstStockLimitOrderModel'
                      );
                    }

                    console.log(
                      'step 11 | from code order_id=',
                      placeOrderFunction
                    );
                  }
                } else {
                  console.log(
                    `ПРОДАЖА: мин цена для продажи у клиента ${item.price} | НЕ совершаем продажу`
                  );
                }
              }

              if (item.type == 'buy') {
                if (stockPrice <= item.price) {
                  console.log(
                    `ПОКУПКА: макс цена для покупки у клиента ${item.price} | совершаем покупку order id= ${item.id}`
                  );


                  const placeOrderFunction = await placeOrder(
                    item.coin1short,
                    item.coin2short,
                    item.type,
                    item.amountBeReceivedByStock
                  );

                  if (!placeOrderFunction) {
                    throw new Error('ошибка в функции placeOrder');
                  }

                  if (placeOrderFunction.status === 'ok') {
                    const modelResponse =
                      await RqstStockLimitOrderModel.findOneAndUpdate(
                        { _id: item._id },
                        {
                          $set: {
                            order_id: placeOrderFunction.orderId,
                            status: 'orderPlaced',
                            amountAccordingBaseIncrement:
                              placeOrderFunction.amountWithStep,
                          },
                        },
                        { new: true }
                      );

                    if (!modelResponse) {
                      throw new Error(
                        'не записаны изменения в бд RqstStockLimitOrderModel'
                      );
                    }

                    console.log(
                      'step 11 | from code order_id=',
                      placeOrderFunction
                    );
                  }
                } else {
                  console.log(
                    `ПОКУПКА: макс цена для покупки у клиента ${item.price} | НЕ совершаем покупку`
                  );
                }
              }
            }
        }
      }

      if (item.status == 'orderPlaced') {
        console.log('начинаю обработку статус=orderPlaced');

        const checkOrderExecutionResult = await checkOrderExecution(
          item.order_id,
          item.coin1short,
          item.coin2short,
          item.coin1full,
          item.coin2full,
          item.coin1chain,
          item.coin2chain
        );

        if (!checkOrderExecutionResult) {
          throw new Error('ошибка в функции checkOrderExecution');
        }

        let amountToSendToNp = checkOrderExecutionResult.amount;
        const coinToSendToNp = checkOrderExecutionResult.coin;
        const coinToSendToNpFull = checkOrderExecutionResult.coinFull;
        const chainToSendToNp = checkOrderExecutionResult.chain;

        console.log(
          'step 12 | from code | amountToSendToNp = ',
          amountToSendToNp
        );
        console.log('step 12 | from code | coinToSendToNp = ', coinToSendToNp);
        console.log(
          'step 12 | from code | coinToSendToNpFull = ',
          coinToSendToNpFull
        );
        console.log(
          'step 12 | from code | chainToSendToNp = ',
          chainToSendToNp
        );

        // получить число для округления
        const getWithdrawalInfoResult = await getWithdrawalInfo(
          coinToSendToNp,
          chainToSendToNp
        );

        if (
          !getWithdrawalInfoResult ||
          getWithdrawalInfoResult.statusFn != 'ok'
        ) {
          throw new Error('ошибка в функции getWithdrawalInfo');
        }

        const precision = Number(getWithdrawalInfoResult.precision);

        if (!isNaN(amountToSendToNp)) {
          console.log(
            'amountToSendToNp до округления вниз =',
            amountToSendToNp
          );

          // .. округление вниз
          const factor = Math.pow(10, precision);
          amountToSendToNp =
            Math.floor(parseFloat(amountToSendToNp) * factor) / factor;

          console.log(
            'amountToSendToNp после округления вниз =',
            amountToSendToNp
          );

         
        } else {
          console.error('amountToSendToNp is not a number:', amountToSendToNp);
        }

        const tranferInStockresult = await transferInStock(
          coinToSendToNp,
          amountToSendToNp
        );

        if (!tranferInStockresult) {
          throw new Error('ошибка в функции transferInStock');
        }

        console.log(
          'step 12.2  | результат трансфера с Trade Main=',
          tranferInStockresult
        );

        const modelResp = await RqstStockLimitOrderModel.findOneAndUpdate(
          { _id: item._id },
          {
            $set: {
              status: 'stockTrtFromTradeToMain',
              amountSentBackToNp: amountToSendToNp,
            },
          },
          { new: true }
        );

        if (!modelResp) {
          throw new Error('инфо не обновилось в бд RqstStockLimitOrderModel');
        }

        console.log('step 13 | TRT с Trade на Main на Бирже выполнен');
      }

      if (item.status == 'stockTrtFromTradeToMain') {
        console.log('начинаю обработку статус=stockTrtFromTradeToMain');

        const checkOrderExecutionResult = await checkOrderExecution(
          item.order_id,
          item.coin1short,
          item.coin2short,
          item.coin1full,
          item.coin2full,
          item.coin1chain,
          item.coin2chain
        );

        if (!checkOrderExecutionResult) {
          throw new Error('ошибка в функции checkOrderExecution');
        }

        let amountToSendToNp = item.amountSentBackToNp;

        const coinToSendToNp = checkOrderExecutionResult.coin;
        const coinToSendToNpFull = checkOrderExecutionResult.coinFull;
        const chainToSendToNp = checkOrderExecutionResult.chain;


        const token = await getTokenFromNowPayment();

        if (!token) {
          throw new Error('нет ответа от функции getTokenFromNowPayment');
        }

        const getNpAdressResult = await createPayAdress(
          token,
          coinToSendToNpFull,
          amountToSendToNp,
          item.userNP,
          'marketOrLimit'
        );

        if (!getNpAdressResult) {
          throw new Error('нет ответа от функции createPayAdress');
        }


        const adresssValue = getNpAdressResult.pay_address;
        const idValue = getNpAdressResult.payment_id;

        const modelResp = await RqstStockLimitOrderModel.findOneAndUpdate(
          { _id: item._id },
          { $set: { trtCoinFromStockToNP_np_id: idValue } },
          { new: true }
        );

        if (!modelResp) {
          throw new Error('не записалосб в бд RqstStockLimitOrderModel');
        }

        console.log('step 14 | pay adress=', adresssValue);
        console.log(
          'step 15 | внутренний id NP что бы отследить перевод с биржи',
          idValue
        );

        const makeWithdrawFromStockToNpResult = await makeWithdrawFromStockToNp(
          amountToSendToNp,
          coinToSendToNp,
          adresssValue,
          chainToSendToNp
        );

        if (!makeWithdrawFromStockToNpResult) {
          throw new Error('нет ответа от функции makeWithdrawFromStockToNp');
        }

        const modelResp2 = await RqstStockLimitOrderModel.findOneAndUpdate(
          { _id: item._id },
          {
            $set: {
              trtCoinFromStockToNP_stock_id: makeWithdrawFromStockToNpResult,
              status: 'stockSentCoinToNp',
              amountSentBackToNp: amountToSendToNp,
            },
          },
          { new: true }
        );

        if (!modelResp2) {
          throw new Error('не записалось в бд RqstStockLimitOrderModel');
        }

        console.log(
          'step 16 | перевод с биржи на NP отправлен, id=',
          makeWithdrawFromStockToNpResult
        );
      }

      if (item.status == 'stockSentCoinToNp') {
        console.log('step 17 | старт проверки, пришли ли бабки юзеру с биржи');

        const payStatusFunction = await getPaymentStatus(
          item.trtCoinFromStockToNP_np_id
        );

        if (!payStatusFunction) {
          throw new Error('нет ответа от функции getPaymentStatus');
        }

        if (payStatusFunction.result == 'ok') {
          console.log('payStatusFunction', payStatusFunction);

          if (
            payStatusFunction.payStatus.toLowerCase() == 'partially_paid' ||
            payStatusFunction.payStatus.toLowerCase() == 'finished'
          ) {
            console.log('step 18 | бабки пришли');
            console.log('payStatusFunction', payStatusFunction);

            console.log('отправить юзеру сообщение');

            const sendingMsgResponse = await sendTlgMessage(
              item.tlgid,
              item.language,
              'limit',
              ''
            );

            if (sendingMsgResponse.status != 'ok') {
              throw new Error('не отправлено сообщение юзеру в Тлг');
            }

            const modelResp3 = await RqstStockLimitOrderModel.findOneAndUpdate(
              { _id: item._id },
              {
                $set: {
                  status: 'done',
                },
              },
              { new: true }
            );

            if (!modelResp3) {
              throw new Error('не записалось в бд RqstStockLimitOrderModel');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Ошибка в CRON > StockLimit task.js |', error);
    return;
  }
}

//создать 2FA код
async function create2FAcode() {
  try {
    const secret_key = process.env.TWOFACODE;

    const code = speakeasy.totp({
      secret: secret_key,
      encoding: 'base32',
    });

    return code;
  } catch (error) {
    console.error(
      'Ошибка в функции create2FAcode > StockLimitCron task.js |',
      error
    );
    return;
  }
}

