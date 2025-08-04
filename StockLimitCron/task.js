// Для тестов:
// 1) поместить файл env в эту папку
// 2) расскоменти две строки 'TEST'
// 3) закомменти 2 строки 'PROD'
// 4) расскоменти EXECUTE

// TEST
import dotenv from 'dotenv';
dotenv.config();

// EXECUTE
executeCheckTask();

// PROD
// import dotenv from 'dotenv';
// dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';
import StockAdressesModel from '../models/stockAdresses.js';

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
} from '../stockKukoin/kukoin.services.js';

import RqstStockLimitOrderModel from '../models/rqstStockMarketOrder.js';
import StockAdressesModel from '../models/stockAdresses.js';

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

          // const { ...userData } = user._doc;
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
                amount: item.amountSentToStock,
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

          if (getPriceResult.statusFn && getPriceResult.statusFn == 'ok') {
            console.log(pair, ' price=', getPriceResult.price);

            for (const item of items) {
              if (item.type == 'sell') {
                if (getPriceResult.price >= item.price) {
                  console.log(
                    `ПРОДАЖА: мин цена для продажи у клиента ${item.price} | совершаем продажу order id= ${item.id}`
                  );

                  // совершить продажу по цене биржи

                  // const prePlaceOrderResponse = await prePlaceOrder(
                  //   item.coin1short,
                  //   item.coin2short,
                  //   item.type,
                  //   item.amountBeReceivedByStock,
                  //   item.id
                  // );

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
                if (getPriceResult.price <= item.price) {
                  console.log(
                    `ПОКУПКА: макс цена для покупки у клиента ${item.price} | совершаем покупку order id= ${item.id}`
                  );

                  // совершить покупку по цене биржи

                  //  await prePlaceOrder(
                  //   item.coin1short,
                  //   item.coin2short,
                  //   item.type,
                  //   item.amountBeReceivedByStock,
                  //   item.id
                  // );

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

          // amountToSendToNp = Number(
          //   parseFloat(amountToSendToNp).toFixed(precision)
          // );
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

        // const getNpAdressResult = await getNpAdress(
        //   item.userNP,
        //   coinToSendToNpFull,
        //   amountToSendToNp
        // );

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

        // const adresssValue = getNpAdressResult.adress;
        // const idValue = getNpAdressResult.uid;

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
              'market',
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

//получить инфо о платеже
// async function getTransfer(token, transferID) {
//   const response = await axios.get(
//     `https://api.nowpayments.io/v1/sub-partner/transfers/?id=${transferID}`,

//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//     }
//   );
//   return response.data.result;
// }

//получить инфо о пополнении баланса Юзера
// async function getPaymentStatus(paymentID) {
//   const response = await axios.get(
//     `https://api.nowpayments.io/v1/payment/${paymentID}`,

//     {
//       headers: {
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//       },
//     }
//   );

//   return { result: 'ok', payStatus: response.data.payment_status };
// }

// async function depositFromMasterToClient(coinTo, amountTo, userNP, token) {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/sub-partner/deposit',
//     { currency: coinTo, amount: amountTo, sub_partner_id: userNP },
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'Content-Type': 'application/json',
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//       },
//     }
//   );
//   //   return {result: response.data.result, id:response.data.result} ;

//   if (response.data.result.status === 'PROCESSING') {
//     // console.log('из функции createConversion  WAITING', response.data.result.status)
//     return { status: 'ok', id: response.data.result.id };
//   } else {
//     // console.log('из функции createConversion  error', response.data.result)
//     return { status: 'error' };
//   }
// }

// Get Deposit Address - получить адрес для перевода
// async function getDepositAdres(sendingCoin, chain) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     //get adresses
//     const requestPath = `/api/v3/deposit-addresses?currency=${sendingCoin}&chain=${chain}`;
//     const method = 'GET';

//     const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
//       headers: signer.headers(requestPath, method),
//     });

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     }

//     if (response.data.data.length > 0) {
//       console.log('from function= есть адрес');
//       // console.log('all=',response.data);
//       // console.log('choosed=',response.data.data[1].address);
//       // // return response.data.data[0].address;
//       return response.data.data[1].address;
//     } else {
//       console.log('from function= нет адреса, запусти создание');

//       //create
//       const requestPath = '/api/v3/deposit-address/create';
//       const method = 'POST';

//       const currencyValue = sendingCoin.toUpperCase();
//       const chainValue = sendingCoin.toLowerCase();

//       const orderBody = {
//         currency: currencyValue,
//         chain: chainValue,
//         to: 'trade',
//       };

//       const response = await axios.post(
//         `https://api.kucoin.com${requestPath}`,
//         orderBody,

//         {
//           headers: signer.headers(requestPath, method, orderBody),
//         }
//       );

//       if (response.data.code == '200000') {
//         console.log('from function | add new adress=', response.data);
//         return response.data.data.address;
//       }
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }

// async function validateAdressFunc(adress, coin) {
//   try {
//     const requestData = {
//       address: String(adress),
//       currency: String(coin),
//     };

//     // 3. Выполнение запроса с обработкой ошибок
//     const response = await axios.post(
//       'https://api.nowpayments.io/v1/payout/validate-address',
//       requestData,
//       {
//         headers: {
//           'x-api-key': process.env.NOWPAYMENTSAPI,
//           'Content-Type': 'application/json',
//         },
//         timeout: 10000, // 10 секунд таймаут
//       }
//     );

//     if (response.data == 'OK') {
//       console.log(response.data);
//       return response.data;
//     }
//   } catch (error) {
//     console.error('Error in validateAdress', {
//       error: error.response?.data || error.message,
//       status: error.response?.status,
//     });
//     throw new Error(`Error adress: ${error.message}`);
//   }
// }

//получить network fee за вывод монеты
// async function getNetworkFees(coin, amount) {
//   try {
//     const response = await axios.get(
//       `https://api.nowpayments.io/v1/payout/fee?currency=${coin}&amount=${amount}`,
//       {
//         headers: {
//           'x-api-key': process.env.NOWPAYMENTSAPI,
//         },
//       }
//     );

//     let networkFees = false;

//     if (response.data) {
//       networkFees = response.data.fee;
//     }

//     return networkFees;
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       message: 'ошибка сервера',
//     });
//   }
// }

//получить bearer token
// async function getBearerToken() {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/auth',
//     {
//       email: process.env.NOWPAYMENTSEMAIL,
//       password: process.env.NOWPAYMENTSPASSWD,
//     },
//     {
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   return response.data.token;
// }

//создать payout
// async function createpayout(requestData, token) {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/payout',
//     requestData,
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   // return response.data.id;
//   return response.data;
// }

//верифицировать payout
// async function verifyPayout(withdrawal_id, code2fa, token) {
//   const response = await axios.post(
//     `https://api.nowpayments.io/v1/payout/${withdrawal_id}/verify`,
//     {
//       verification_code: code2fa,
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   return response.data;
// }

//разместить order на бирже - OLD
// async function placeOrder(coin1, coin2, type, amount) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     //получить цену с учетом минимального шага сети
//     const requestPathForSize = '/api/v2/symbols';
//     const methodForSize = 'GET';
//     console.log(
//       'url=',
//       `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`
//     );
//     const getSize = await axios.get(
//       `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`,
//       {
//         headers: signer.headers(requestPathForSize, methodForSize),
//       }
//     );

//     console.log('getSize', getSize.data);

//     const baseIncrement = parseFloat(getSize.data.data.baseIncrement);
//     console.log('Минимальный шаг объёма:', baseIncrement);

//     const amountWithStep = (
//       Math.floor(amount / baseIncrement) * baseIncrement
//     ).toFixed(6);
//     console.log('новая цена:', amountWithStep);
//     console.log('amount=', amount);

//     const requestPath = '/api/v1/hf/orders';
//     const method = 'POST';

//     const orderBody = {
//       type: 'market',
//       symbol: `${coin1}-${coin2}`,
//       side: type,
//       size: amountWithStep,
//       clientOid: clientOid,
//       remark: 'order remarks',
//     };

//     console.log('orderBody=', orderBody);

//     const response = await axios.post(
//       `https://api.kucoin.com${requestPath}`,
//       orderBody,
//       {
//         headers: signer.headers(requestPath, method, orderBody),
//       }
//     );

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       console.log(response.data);
//       return {
//         orderId: response.data.data.orderId,
//         status: 'ok',
//         amountWithStep: amountWithStep,
//       };
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message || err);
// //     res.status(500).json({
// //       message: 'Ошибка сервера',
// //       error: err?.response?.data || err.message,
// //     });
// //   }
// // }

// //проверить, выполнен ли ORDER на бирже
// async function checkOrderExecution(
//   order_id,
//   coin1,
//   coin2,
//   coin1full,
//   coin2full,
//   coin1chain,
//   coin2chain
// ) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     // const symbolValue=

//     //get adresses
//     const requestPath = `/api/v1/hf/orders/${order_id}/?symbol=${coin1}-${coin2}`;
//     const method = 'GET';

//     const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
//       headers: signer.headers(requestPath, method),
//     });

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       if (
//         response.data.data.inOrderBook == false &&
//         response.data.data.active == false
//       ) {
//         console.log('from fn');
//         console.log(response.data);

//         // когда сделка не совершена
//         if (response.data.data.size == response.data.data.cancelledSize) {
//           return;
//         }

//         if (response.data.data.side == 'buy') {
//           const amount = response.data.data.dealSize;
//           const coin = coin1;
//           const coinFull = coin1full;
//           const chain = coin1chain;
//           return { amount, coin, coinFull, chain };
//         }

//         if (response.data.data.side == 'sell') {
//           const amount =
//             Number(response.data.data.dealFunds) -
//             Number(response.data.data.fee);
//           const coin = coin2;
//           const coinFull = coin2full;
//           const chain = coin2chain;
//           return { amount, coin, coinFull, chain };
//         }
//       }
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }

// // получить адрес для перевода с биржи на NP
// async function getNpAdress(userNP, coin, amount) {
//   try {
//     const token = await getTokenFromNowPayment();

//     const payAdress = await createPayAdress(token, coin, amount, userNP);

//     return payAdress;
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       message: 'ошибка сервера',
//     });
//   }
// }

// async function getTokenFromNowPayment() {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/auth',
//     {
//       email: process.env.NOWPAYMENTSEMAIL,
//       password: process.env.NOWPAYMENTSPASSWD,
//     },
//     {
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     }
//   );

//   return response.data.token;
// }

// async function createPayAdress(token, coin, minAmount, nowpaymentid) {
//   try {
//     // 1. Валидация входных параметров
//     if (!token || typeof token !== 'string') {
//       throw new Error('Invalid or missing authentication token');
//     }

//     if (!coin || typeof coin !== 'string') {
//       throw new Error('Invalid coin format');
//     }

//     if (!minAmount || (typeof coin !== 'number' && typeof coin !== 'string')) {
//       throw new Error('Invalid minAmount format');
//     }

//     if (
//       !nowpaymentid ||
//       (typeof nowpaymentid !== 'number' && typeof nowpaymentid !== 'string')
//     ) {
//       throw new Error('Invalid nowpaymentid format');
//     }

//     // 2. Формирование тела запроса
//     const requestData = {
//       currency: coin,
//       amount: Number(minAmount),
//       sub_partner_id: String(nowpaymentid),
//       is_fixed_rate: false,
//       is_fee_paid_by_user: false,
//       ipn_callback_url: process.env.WEBHOOKADRESS_FROMSTOCKTOUSER_LIMIT,
//     };

//     // 3. Выполнение запроса с обработкой ошибок
//     const response = await axios.post(
//       'https://api.nowpayments.io/v1/sub-partner/payment',
//       requestData,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           'x-api-key': process.env.NOWPAYMENTSAPI,
//           'Content-Type': 'application/json',
//         },
//         timeout: 10000, // 10 секунд таймаут
//       }
//     );

//     // 4. Проверка структуры ответа
//     if (!response.data?.result?.pay_address) {
//       throw new Error('Invalid response structure from NowPayments API');
//     }

//     //FIXME: писать в эту БД или другую???
//     // await createNewRqstPayIn(response.data.result, tlgid, nowpaymentid);
//     // console.log('for one more ID',response.data )
//     return {
//       adress: response.data.result.pay_address,
//       uid: response.data.result.payment_id,
//     };
//   } catch (error) {
//     console.error('Error in createUserInNowPayment:', {
//       error: error.response?.data || error.message,
//       status: error.response?.status,
//     });
//     throw new Error(`Failed to create user: ${error.message}`);
//   }
// }

// //отправить с биржи монеты в NP
// async function makeWithdrawFromStockToNp(amount, coin, adress, chain) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     //get adresses
//     const requestPath = '/api/v3/withdrawals';
//     const method = 'POST';

//     const currencyValue = coin.toUpperCase();
//     const chainValue = chain.toLowerCase();

//     const orderBody = {
//       currency: currencyValue,
//       toAddress: adress,
//       amount: amount,
//       withdrawType: 'ADDRESS',
//       chain: chainValue,
//       isInner: false,
//       remark: 'this is Remark',
//     };

//     console.log('orderBody=', orderBody);

//     const response = await axios.post(
//       `https://api.kucoin.com${requestPath}`,
//       orderBody,
//       {
//         headers: signer.headers(requestPath, method, orderBody),
//       }
//     );

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       console.log('fr withdraw fn ', response.data);
//       return response.data.data.withdrawalId;
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message, err?.response?.data || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }

// // получить число для округления
// async function getWithdrawalInfo(coin, chain) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     const currencyValue = coin.toUpperCase();
//     const chainValue = chain.toLowerCase();

//     //get adresses
//     const requestPath = `/api/v1/withdrawals/quotas?currency=${currencyValue}&chain=${chainValue}`;
//     const method = 'GET';

//     const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
//       headers: signer.headers(requestPath, method),
//     });

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       console.log('fr withdraw fn ', response.data);
//       return { precision: response.data.data.precision, statusFn: 'ok' };
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message, err?.response?.data || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }

// //трансфер с Trade на Main аккаунт внутри биржи
// async function transferInStock(coin, amount) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     //get adresses
//     const requestPath = '/api/v3/accounts/universal-transfer';
//     const method = 'POST';

//     const orderBody = {
//       clientOid: clientOid,
//       type: 'INTERNAL',
//       currency: coin,
//       amount: amount,
//       fromAccountType: 'TRADE',
//       toAccountType: 'MAIN',
//     };

//     console.log('orderBody=', orderBody);

//     const response = await axios.post(
//       `https://api.kucoin.com${requestPath}`,
//       orderBody,
//       {
//         headers: signer.headers(requestPath, method, orderBody),
//       }
//     );

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       console.log('средства отправлены с Trade на Main ');
//       return { statusFn: 'ok' };
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message, err?.response?.data || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }

// // получение стоимости валютной пары
// async function getPrice(pair) {
//   try {
//     const response = await axios.get(
//       `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${pair}`
//     );

//     if (!response) {
//       return { statusFn: 'notOk' };
//     }

//     return { statusFn: 'ok', price: response.data.data.price };
//   } catch (err) {
//     console.log(err);
//     res.json({
//       message: 'ошибка сервера',
//     });
//   }
// }

// async function prePlaceOrder(
//   coin1short,
//   coin2short,
//   type,
//   amountBeReceivedByStock,
//   id
// ) {
//   const placeOrderFunction = await placeOrder(
//     coin1short,
//     coin2short,
//     type,
//     amountBeReceivedByStock
//   );

//   if (placeOrderFunction.status === 'ok') {
//     await RqstStockLimitOrderModel.findOneAndUpdate(
//       { _id: id },
//       {
//         $set: {
//           order_id: placeOrderFunction.orderId,
//           status: 'orderPlaced',
//           amountAccordingBaseIncrement: placeOrderFunction.amountWithStep,
//         },
//       },
//       { new: true }
//     );

//     console.log('ордер размещен на бирже');
//   }
// }

// //разместить order на бирже
// async function placeOrder(coin1, coin2, type, amount) {
//   try {
//     class KcSigner {
//       constructor(apiKey, apiSecret, apiPassphrase) {
//         this.apiKey = apiKey || '';
//         this.apiSecret = apiSecret || '';
//         this.apiPassphrase = apiPassphrase || '';

//         if (apiPassphrase && apiSecret) {
//           this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
//         }

//         if (!apiKey || !apiSecret || !apiPassphrase) {
//           console.warn('API credentials are missing. Access will likely fail.');
//         }
//       }

//       sign(plain, key) {
//         return crypto.createHmac('sha256', key).update(plain).digest('base64');
//       }

//       headers(requestPath, method = 'POST', body = '') {
//         const timestamp = Date.now().toString();
//         const bodyString =
//           typeof body === 'object' ? JSON.stringify(body) : body;
//         const prehash =
//           timestamp + method.toUpperCase() + requestPath + bodyString;
//         const signature = this.sign(prehash, this.apiSecret);

//         return {
//           'KC-API-KEY': this.apiKey,
//           'KC-API-PASSPHRASE': this.apiPassphrase,
//           'KC-API-TIMESTAMP': timestamp,
//           'KC-API-SIGN': signature,
//           'KC-API-KEY-VERSION': '3',
//           'Content-Type': 'application/json',
//         };
//       }
//     }

//     // Load API credentials from environment
//     const key = process.env.KUCOIN_KEY || '';
//     const secret = process.env.KUCOIN_SECRET || '';
//     const passphrase = process.env.KUCOIN_PASSPHRASE || '';

//     const signer = new KcSigner(key, secret, passphrase);

//     // Generate a unique client order ID
//     const clientOid = crypto.randomUUID();

//     //получить цену с учетом минимального шага сети
//     const requestPathForSize = '/api/v2/symbols';
//     const methodForSize = 'GET';
//     console.log(
//       'url=',
//       `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`
//     );
//     const getSize = await axios.get(
//       `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`,
//       {
//         headers: signer.headers(requestPathForSize, methodForSize),
//       }
//     );

//     console.log('getSize', getSize.data);

//     const baseIncrement = parseFloat(getSize.data.data.baseIncrement);
//     console.log('Минимальный шаг объёма:', baseIncrement);

//     const amountWithStep = (
//       Math.floor(amount / baseIncrement) * baseIncrement
//     ).toFixed(6);
//     console.log('новая цена:', amountWithStep);
//     console.log('amount=', amount);

//     const requestPath = '/api/v1/hf/orders';
//     const method = 'POST';

//     const orderBody = {
//       type: 'market',
//       symbol: `${coin1}-${coin2}`,
//       side: type,
//       size: amountWithStep,
//       clientOid: clientOid,
//       remark: 'order remarks',
//     };

//     console.log('orderBody=', orderBody);

//     const response = await axios.post(
//       `https://api.kucoin.com${requestPath}`,
//       orderBody,
//       {
//         headers: signer.headers(requestPath, method, orderBody),
//       }
//     );

//     // Optional: check KuCoin API response code
//     if (response.data.code !== '200000') {
//       console.error('Ошибка от KuCoin:', response.data);
//       return res.status(400).json({ error: response.data });
//     } else {
//       console.log(response.data);
//       return {
//         orderId: response.data.data.orderId,
//         status: 'ok',
//         amountWithStep: amountWithStep,
//       };
//     }
//   } catch (err) {
//     console.error('Ошибка сервера:', err.message || err);
//     res.status(500).json({
//       message: 'Ошибка сервера',
//       error: err?.response?.data || err.message,
//     });
//   }
// }
