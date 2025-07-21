//FIXME:
// для тестов
// import dotenv from 'dotenv';
// dotenv.config();

//FIXME:
//для прода
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

// TODO: убрат в проде команду
// executeCheckTask();

// TODO: убрать файл env из этой папки перед заливкой на сервер
// TODO: нужно ли убирать из этого файла const app и прочее?

import mongoose from 'mongoose';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';
import StockAdressesModel from '../models/stockAdresses.js';
import ComissionStockModel from '../models/comissionStockMarket.js';


import { TEXTS } from './texts.js';

import https from 'https';

import cors from 'cors';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

import axios from 'axios';

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

// const app = express();

// app.use(express.json());
// app.use(cors());

export async function executeCheckTask() {
  console.log('Начинаю cron4: проверка прошел ли платеж с Клиент на Мастер...');

  const recordsNew = await RqstStockMarketOrderModel.find({
    status: {
      $in: ['new', 'CoinReceivedByStock', 'orderPlaced', 'stockSentCoinToNp'],
    },
  }).exec();

  console.log('step 1 | records=', recordsNew);

  if (recordsNew.length == 0) {
    console.log('записей не найдено');
    return;
  }

  const token = await getBearerToken();

  console.log('step 2 | token=', token);

  for (const item of recordsNew) {
    if (item.status == 'new') {
      const payStatus = await getTransfer(token, item.id_clientToMaster);

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

        //TODO: НЕ АКТУАЛЬНО! Получаю адрес из своей БД, а не по апи с биржи
        //  Get Deposit Addres - получить адрес для перевода
        // const depositAdres = await getDepositAdres(sendingCoin,sendingChain);

        //TODO: АКТУАЛЬНО! Получаю адрес из своей БД
        const addressFinding = await StockAdressesModel.findOne({
          coinShort: sendingCoin,
          coinChain: sendingChain,
        });

        // const { ...userData } = user._doc;
        const depositAdres = addressFinding?.adress;

        console.log('step 3 | адрес для перевода=', depositAdres);

        // валидировать адрес
        const validateAdressResponse = await validateAdressFunc(
          depositAdres,
          sendingCoinFull
        );

        if (validateAdressResponse != 'OK') {
          console.log('step4 | адрес не валидный');
          //FIXME: добавить выход из кода
        }

        console.log('step4 | адрес валидный');

        //получить network fees
        const networkFeesResponse = await getNetworkFees(
          sendingCoinFull,
          item.amount
        );

        if (networkFeesResponse == false) {
          console.log('step5 | не получили инфо про комиссию');
          //FIXME: добавить выход из кода
        }

        // console.log('step5 | network fees=', networkFeesResponse);


        // получить нашу комиссию по Маркету
        const ourComissionResponse = await getOurComissionMarket();
        if (ourComissionResponse.statusFn != 'ok'){
          // FIXME: добваить вывод на фронт ошибки
        }  
        
        let ourComission = 0

        if (!isNaN(ourComissionResponse.ourComission) && ourComissionResponse.ourComission !== null){
            ourComission = Number(ourComissionResponse.ourComission) / 100
        }
        

        // сумма для перевода на биржу
        const amountSentToStockValue =
        Number(item.amount) -  Number(item.amount)*Number(ourComission);


        // .. сумма, которая дойдет до Биржи
        const amountBeReceivedByStock = Number(amountSentToStockValue) - Number(networkFeesResponse)
        
        
        console.log('step5.3 | initial num=', item.amount);
        // console.log('step5.3 | network fees=', networkFeesResponse);
        console.log('step5.3 | our comission=', ourComission);
        console.log('step5.3 | amountSentToStockValue=', amountSentToStockValue);


        await RqstStockMarketOrderModel.findOneAndUpdate(
          { _id: item._id },
          { $set: { amountSentToStock: amountSentToStockValue,
                     amountBeReceivedByStock: amountBeReceivedByStock
           } },
          { new: true }
        );

        console.log(
          'step6 | сумма для отправки на биржу (за минусом net fees)',
          amountSentToStockValue
        );

        //создать запрос на вывод

        const token = await getBearerToken();

        const requestData = {
          ipn_callback_url: process.env.WEBHOOKADRESS_FORSTOCK,
          withdrawals: [
            {
              address: depositAdres,
              currency: sendingCoinFull,
              amount: item.amountSentToStock,
              //FIXME: сделать еще один хук
              ipn_callback_url: process.env.WEBHOOKADRESS_FORSTOCK,
            },
          ],
        };

        const createPayoutResult = await createpayout(requestData, token);

        const batch_withdrawal_id = createPayoutResult.id;
        const payout_id = createPayoutResult.withdrawals[0].id;
        console.log('step 7 | withdrawal_id=', batch_withdrawal_id);

        const code2fa = await create2FAcode();
        console.log('step 8 | code2fa=', code2fa);

        const verify = await verifyPayout(batch_withdrawal_id, code2fa, token);
        console.log('step 9 | verify=', verify);

        if (verify === 'OK') {
          await RqstStockMarketOrderModel.findOneAndUpdate(
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
        }

        console.log('step 10 | монеты отправлены на биржу');
      }
    }

    if (item.status == 'CoinReceivedByStock') {
      console.log('запуск статуса CoinReceivedByStock ');



      const placeOrderFunction = await placeOrder(
        item.coin1short,
        item.coin2short,
        item.type,
        item.amountBeReceivedByStock
      );

      //FIXME: добавить, если пришла ошибка

      if (placeOrderFunction.status === 'ok') {
        await RqstStockMarketOrderModel.findOneAndUpdate(
          { _id: item._id },
          {
            $set: {
              order_id: placeOrderFunction.orderId,
              status: 'orderPlaced',
              amountAccordingBaseIncrement: placeOrderFunction.amountWithStep,
            },
          },
          { new: true }
        );

        console.log('step 11 | from code order_id=', placeOrderFunction);
      }
    }

    if (item.status == 'orderPlaced') {
      const checkOrderExecutionResult = await checkOrderExecution(
        item.order_id,
        item.coin1short,
        item.coin2short,
        item.coin1full,
        item.coin2full,
        item.coin1chain,
        item.coin2chain
      );

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
      console.log('step 12 | from code | chainToSendToNp = ', chainToSendToNp);

      // получить число для округления
      const getWithdrawalInfoResult = await getWithdrawalInfo(
        coinToSendToNp,
        chainToSendToNp
      );

      if (getWithdrawalInfoResult.statusFn != 'ok') {
        //FIXME: выпасть в ошибку
        // console.log ('Ошибка в getWithdrawalInfo ')
      }

      const precision = Number(getWithdrawalInfoResult.precision);

      if (!isNaN(amountToSendToNp)) {
        amountToSendToNp = Number(
          parseFloat(amountToSendToNp).toFixed(precision)
        );
      } else {
        console.error('amountToSendToNp is not a number:', amountToSendToNp);
      }

      // amountToSendToNp = Number(amountToSendToNp.toFixed(precision))

      // console.log('amountToSendToNp',amountToSendToNp)
      // console.log(typeof amountToSendToNp)

      // return

      //TODO: для быстрых тестов
      // const coinToSendToNp = 'TON'
      // amountToSendToNp = '0.4'

      const getNpAdressResult = await getNpAdress(
        item.userNP,
        coinToSendToNpFull,
        amountToSendToNp
      );
      const adresssValue = getNpAdressResult.adress;
      const idValue = getNpAdressResult.uid;

      await RqstStockMarketOrderModel.findOneAndUpdate(
        { _id: item._id },
        { $set: { trtCoinFromStockToNP_np_id: idValue } },
        { new: true }
      );

      console.log('step 13 | pay adress=', adresssValue);
      console.log(
        'step 14 | внутренний id NP что бы отследить перевод с биржи',
        idValue
      );

      const tranferInStockresult = await transferInStock(
        coinToSendToNp,
        amountToSendToNp
      );
      if (tranferInStockresult.statusFn != 'ok') {
        //FIXME: выпасть в ошибку
        // console.log ('Ошибка в getWithdrawalInfo ')
      }

      const makeWithdrawFromStockToNpResult = await makeWithdrawFromStockToNp(
        amountToSendToNp,
        coinToSendToNp,
        adresssValue,
        chainToSendToNp
      );

      await RqstStockMarketOrderModel.findOneAndUpdate(
        { _id: item._id },
        {
          $set: {
            trtCoinFromStockToNP_stock_id: makeWithdrawFromStockToNpResult,
            status: 'stockSentCoinToNp',
            amountSentBackToNp: amountToSendToNp
          },
        },
        { new: true }
      );

      console.log(
        'step 15 | перевод с биржи на NP отправлен, id=',
        makeWithdrawFromStockToNpResult
      );
    }

    if (item.status == 'stockSentCoinToNp') {
      console.log('step 16 | старт проверки, пришли ли бабки юзеру с биржи');

      const payStatusFunction = await getPaymentStatus(
        item.trtCoinFromStockToNP_np_id
      );

      if (payStatusFunction.result == 'ok') {
        console.log('payStatusFunction', payStatusFunction);



        if (payStatusFunction.payStatus.toLowerCase() == 'partially_paid' || payStatusFunction.payStatus.toLowerCase() == 'finished' ) {
          console.log('step 17 | бабки пришли');
          console.log('payStatusFunction', payStatusFunction);

          console.log('отправить юзеру сообщение');

                  
          const language = item.language;
          const { title} = TEXTS[language];


          // console.log('CHECK | lang=', language )
          // console.log('CHECK | MSG WILL BE SENT=', title )

          // const fullText = text + textQtyCoins;

          // const title = 'От биржи';
          // const fullText = 'операция на бирже прошла успешно';

          const chatId = item.tlgid;
          const botToken = process.env.BOT_TOKEN;

          if (!botToken) {
            console.error('Ошибка: переменная окружения BOT_TOKEN не задана');
            return;
          }

          // const message = `${title}\n${fullText}`;
          // const message = title;

          try {
            const response = await axios.post(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                chat_id: chatId,
                text: title,
              }
            );

            if (response.data?.ok) {
              console.log(
                '✅ Сообщение успешно отправлено:',
                response.data.result
              );

              await RqstStockMarketOrderModel.findOneAndUpdate(
                { _id: item._id },
                {
                  $set: {
                    status: 'done',
                  },
                },
                { new: true }
              );
            } else {
              console.error('❌ Telegram вернул ошибку:', response.data);
            }
          } catch (error) {
            console.error(
              '❌ Ошибка при отправке сообщения:',
              error?.response?.data || error.message
            );
          }
        }
      } 
    }

    return { success: true };
  }
}

//получить инфо о платеже
async function getTransfer(token, transferID) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/sub-partner/transfers/?id=${transferID}`,

    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data.result;
}

//получить инфо о пополнении баланса Юзера
async function getPaymentStatus(paymentID) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/payment/${paymentID}`,

    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );

  return { result: 'ok', payStatus: response.data.payment_status };
}

async function depositFromMasterToClient(coinTo, amountTo, userNP, token) {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/sub-partner/deposit',
    { currency: coinTo, amount: amountTo, sub_partner_id: userNP },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );
  //   return {result: response.data.result, id:response.data.result} ;

  if (response.data.result.status === 'PROCESSING') {
    // console.log('из функции createConversion  WAITING', response.data.result.status)
    return { status: 'ok', id: response.data.result.id };
  } else {
    // console.log('из функции createConversion  error', response.data.result)
    return { status: 'error' };
  }
}

// Get Deposit Address - получить адрес для перевода
async function getDepositAdres(sendingCoin, chain) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //get adresses
    const requestPath = `/api/v3/deposit-addresses?currency=${sendingCoin}&chain=${chain}`;
    const method = 'GET';

    const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
      headers: signer.headers(requestPath, method),
    });

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    }

    if (response.data.data.length > 0) {
      console.log('from function= есть адрес');
      // console.log('all=',response.data);
      // console.log('choosed=',response.data.data[1].address);
      // // return response.data.data[0].address;
      return response.data.data[1].address;
    } else {
      console.log('from function= нет адреса, запусти создание');

      //create
      const requestPath = '/api/v3/deposit-address/create';
      const method = 'POST';

      const currencyValue = sendingCoin.toUpperCase();
      const chainValue = sendingCoin.toLowerCase();

      const orderBody = {
        currency: currencyValue,
        chain: chainValue,
        to: 'trade',
      };

      const response = await axios.post(
        `https://api.kucoin.com${requestPath}`,
        orderBody,

        {
          headers: signer.headers(requestPath, method, orderBody),
        }
      );

      if (response.data.code == '200000') {
        console.log('from function | add new adress=', response.data);
        return response.data.data.address;
      }
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}

async function validateAdressFunc(adress, coin) {
  try {
    const requestData = {
      address: String(adress),
      currency: String(coin),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/payout/validate-address',
      requestData,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data == 'OK') {
      console.log(response.data);
      return response.data;
    }
  } catch (error) {
    console.error('Error in validateAdress', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }
}

//получить network fee за вывод монеты
async function getNetworkFees(coin, amount) {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout/fee?currency=${coin}&amount=${amount}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    let networkFees = false;

    if (response.data) {
      networkFees = response.data.fee;
    }

    return networkFees;
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
}

// получить нашу комиссию за сделку - Market
async function getOurComissionMarket() {
  try {
    
     const response = await ComissionStockModel.findOne({
          coin: 'ourComission'
        });

        const ourComission = response.qty;


    if (ourComission) {
      return ({ourComission:ourComission,statusFn:'ok'});
       
    } else {
        return ({statusFn:'notok'});
    }

    
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
}





//получить bearer token
async function getBearerToken() {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/auth',
    {
      email: process.env.NOWPAYMENTSEMAIL,
      password: process.env.NOWPAYMENTSPASSWD,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.token;
}

//создать payout
async function createpayout(requestData, token) {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/payout',
    requestData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': process.env.NOWPAYMENTSAPI,
        'Content-Type': 'application/json',
      },
    }
  );
  // return response.data.id;
  return response.data;
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
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при создании кода.' });
  }
}

//верифицировать payout
async function verifyPayout(withdrawal_id, code2fa, token) {
  const response = await axios.post(
    `https://api.nowpayments.io/v1/payout/${withdrawal_id}/verify`,
    {
      verification_code: code2fa,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': process.env.NOWPAYMENTSAPI,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

//разместить order на бирже
async function placeOrder(coin1, coin2, type, amount) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //получить цену с учетом минимального шага сети
    const requestPathForSize = '/api/v2/symbols';
    const methodForSize = 'GET';
    console.log(
      'url=',
      `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`
    );
    const getSize = await axios.get(
      `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`,
      {
        headers: signer.headers(requestPathForSize, methodForSize),
      }
    );

    console.log('getSize', getSize.data);

    const baseIncrement = parseFloat(getSize.data.data.baseIncrement);
    console.log('Минимальный шаг объёма:', baseIncrement);

    const amountWithStep = (
      Math.floor(amount / baseIncrement) * baseIncrement
    ).toFixed(6);
    console.log('новая цена:', amountWithStep);
    console.log('amount=', amount);

    const requestPath = '/api/v1/hf/orders';
    const method = 'POST';

    const orderBody = {
      type: 'market',
      symbol: `${coin1}-${coin2}`,
      side: type,
      size: amountWithStep,
      clientOid: clientOid,
      remark: 'order remarks',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      console.log(response.data);
      return {
        orderId: response.data.data.orderId,
        status: 'ok',
        amountWithStep: amountWithStep,
      };
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}

//проверить, выполнен ли ORDER на бирже
async function checkOrderExecution(
  order_id,
  coin1,
  coin2,
  coin1full,
  coin2full,
  coin1chain,
  coin2chain
) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    // const symbolValue=

    //get adresses
    const requestPath = `/api/v1/hf/orders/${order_id}/?symbol=${coin1}-${coin2}`;
    const method = 'GET';

    const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
      headers: signer.headers(requestPath, method),
    });

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      if (
        response.data.data.inOrderBook == false &&
        response.data.data.active == false
      ) {
        console.log('from fn');
        console.log(response.data);



        // когда сделка не совершена
        if (response.data.data.size == response.data.data.cancelledSize) {
          return
        }



        if (response.data.data.side == 'buy') {
          const amount = response.data.data.dealSize;
          const coin = coin1;
          const coinFull = coin1full;
          const chain = coin1chain;
          return { amount, coin, coinFull, chain };
        }

        if (response.data.data.side == 'sell') {
          const amount =
            Number(response.data.data.dealFunds) -
            Number(response.data.data.fee);
          const coin = coin2;
          const coinFull = coin2full;
          const chain = coin2chain;
          return { amount, coin, coinFull, chain };
        }
      }
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}

// получить адрес для перевода с биржи на NP
async function getNpAdress(userNP, coin, amount) {
  try {
    const token = await getTokenFromNowPayment();

    const payAdress = await createPayAdress(token, coin, amount, userNP);

    return payAdress;
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
}

async function getTokenFromNowPayment() {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/auth',
    {
      email: process.env.NOWPAYMENTSEMAIL,
      password: process.env.NOWPAYMENTSPASSWD,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.token;
}

async function createPayAdress(token, coin, minAmount, nowpaymentid) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!coin || typeof coin !== 'string') {
      throw new Error('Invalid coin format');
    }

    if (!minAmount || (typeof coin !== 'number' && typeof coin !== 'string')) {
      throw new Error('Invalid minAmount format');
    }

    if (
      !nowpaymentid ||
      (typeof nowpaymentid !== 'number' && typeof nowpaymentid !== 'string')
    ) {
      throw new Error('Invalid nowpaymentid format');
    }

    // 2. Формирование тела запроса
    const requestData = {
      currency: coin,
      amount: Number(minAmount),
      sub_partner_id: String(nowpaymentid),
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
      ipn_callback_url: process.env.WEBHOOKADRESS_FROMSTOCKTOUSER,
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/payment',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.pay_address) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    //FIXME: писать в эту БД или другую???
    // await createNewRqstPayIn(response.data.result, tlgid, nowpaymentid);
    // console.log('for one more ID',response.data )
    return {
      adress: response.data.result.pay_address,
      uid: response.data.result.payment_id,
    };
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

//отправить с биржи монеты в NP
async function makeWithdrawFromStockToNp(amount, coin, adress, chain) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //get adresses
    const requestPath = '/api/v3/withdrawals';
    const method = 'POST';

    const currencyValue = coin.toUpperCase();
    const chainValue = chain.toLowerCase();

    const orderBody = {
      currency: currencyValue,
      toAddress: adress,
      amount: amount,
      withdrawType: 'ADDRESS',
      chain: chainValue,
      isInner: false,
      remark: 'this is Remark',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      console.log('fr withdraw fn ', response.data);
      return response.data.data.withdrawalId;
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message, err?.response?.data || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}

// получить число для округления
async function getWithdrawalInfo(coin, chain) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    const currencyValue = coin.toUpperCase();
    const chainValue = chain.toLowerCase();

    //get adresses
    const requestPath = `/api/v1/withdrawals/quotas?currency=${currencyValue}&chain=${chainValue}`;
    const method = 'GET';

    const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
      headers: signer.headers(requestPath, method),
    });

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      console.log('fr withdraw fn ', response.data);
      return { precision: response.data.data.precision, statusFn: 'ok' };
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message, err?.response?.data || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}

//трансфер с Trade на Main аккаунт внутри биржи
async function transferInStock(coin, amount) {
  try {
    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //get adresses
    const requestPath = '/api/v3/accounts/universal-transfer';
    const method = 'POST';

    const orderBody = {
      clientOid: clientOid,
      type: 'INTERNAL',
      currency: coin,
      amount: amount,
      fromAccountType: 'TRADE',
      toAccountType: 'MAIN',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      console.log('средства отправлены с Trade на Main ');
      return { statusFn: 'ok' };
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message, err?.response?.data || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}
