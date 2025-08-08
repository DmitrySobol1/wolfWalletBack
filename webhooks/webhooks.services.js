import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import axios from 'axios';

import { logger } from '../middlewares/error-logger.js'

import crypto from 'crypto';

import VerifiedPayoutsModel from '../models/verifiedPayouts.js';
import UserModel from '../models/user.js';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';
import RqstPayInModel from '../models/rqstPayIn.js'

import { TEXTS } from '../texts.js';

export async function sendTlgMessage(tlgid, language, type, textQtyCoins) {
  try {
    const { title, text } = TEXTS[type]?.[language];
    const fullText = text + textQtyCoins;
    const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
    const params = `?chat_id=${tlgid}&text=${title}%0A${fullText}`;
    const url = baseurl + params;

    const response = await axios.get(url);

    if (!response) {
      throw new Error('сообщение в Telegram не отправлено');
    }

    console.log(response.data); // выводим результат
    return { status: 'ok' };
  } catch (err) {
    
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции sendTlgMessage',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

export function verifyNowPaymentsSignature(
  payload,
  receivedSignature,
  secretKey
) {
  if (!receivedSignature || !secretKey) return false;

  const hmac = crypto.createHmac('sha512', secretKey);
  hmac.update(JSON.stringify(safeSort(payload)));
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(expectedSignature)
  );
}

function safeSort(obj) {
  const seen = new WeakSet();
  const sort = (obj) => {
    if (obj !== Object(obj)) return obj;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    return Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = sort(obj[key]);
        return result;
      }, {});
  };
  return sort(obj);
}

// функция обработки вывод средств (payout)
export async function processWebhookPayout(payload) {
  try {
    console.log('Обрабатываю payout wh:', payload);

    const statusLowerLetter = payload.status.toLowerCase();

    // меняем статус прохождения платежа в БД
    const updatedItem = await VerifiedPayoutsModel.findOneAndUpdate(
      { batch_withdrawal_id: payload.batch_withdrawal_id },
      { $set: { status: statusLowerLetter } }
    );

    if (!updatedItem) {
      throw new Error('не изменилось значение в БД VerifiedPayoutsModel');
    }

    console.log('Статус = ', statusLowerLetter);

    // если статус ==finished и сообщение еще не отправлено, то шлем юзеру сообщение
    if (statusLowerLetter === 'finished' && updatedItem.isSentMsg == false) {
      const foundUser = await UserModel.findOne({
        nowpaymentid: updatedItem.userIdAtNP,
      });

      if (!foundUser) {
        throw new Error('не найден юзер в БД UserModel ');
      }

      // меняем статус, что сообщение отправили
      const updatedItem2 = await VerifiedPayoutsModel.findOneAndUpdate(
        { batch_withdrawal_id: payload.batch_withdrawal_id },
        { $set: { isSentMsg: true } }
      );

      if (!updatedItem2) {
        throw new Error(
          'не изменилось значение в БД VerifiedPayoutsModel в поле isSentMsg'
        );
      }

      const { language, tlgid } = foundUser;
      //   const { currency, amount, fee } = payload;
      const { qtyToSend, coin } = updatedItem2;

      const type = 'payout';
      //   const textQtyCoins = Number((Number(amount) - Number(fee)).toFixed(6));
      const textToSendUser = qtyToSend + ' ' + coin.toUpperCase();

      const tlgResponse = await sendTlgMessage(
        tlgid,
        language,
        type,
        textToSendUser
      );

      if (tlgResponse.status != 'ok') {
        throw new Error('ошибка в функции sendTlgMessage ');
      }
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции processWebhookPayout',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}




// // функция обработки ввода средств (payin)
export async function processWebhookPayin(payload) {
  try {


   console.log('Обрабатываю:', payload);

    const status = payload.payment_status?.toLowerCase();
    const paymentId = payload.payment_id;
    const amount = payload.outcome_amount
    const currency = payload.price_currency

    console.log('Статус=', status);

    if (status === 'finished') {
     
      const foundItem = await RqstPayInModel.findOne({
        payment_id: paymentId,
      });

      if (!foundItem) {
        throw new Error('не нашел в БД RqstPayInModel');
      }


      // FIXME: добавить параметр isOperated 
      if (foundItem.isOperated == false) {
       
        const updatedItem = await RqstPayInModel.findOneAndUpdate(
          { payment_id: paymentId },
          { $set: { payment_status: 'finished', 
                    isOperated: true,
                    amount_received: amount
                  } }
        );

        if (!updatedItem) {
          throw new Error(
            'не изменилось значение в БД RqstStockMarketOrderModel'
          );
        }

        const tlgid = updatedItem.tlgid;

         const userFromUserBase = await UserModel.findOne({
          tlgid: tlgid,
        });

        const language = userFromUserBase.language;
        const type = 'payin';
        const coin = currency;
        const sumToReceived = amount;
        const textToSendUser = sumToReceived + ' ' + coin.toUpperCase();
        console.log('переход к функции сенд мсг');
        sendTlgMessage(tlgid, language, type, textToSendUser);

        console.log(
          'из функции обработки вебхука: пришел хук finished, значение isOperated поменял'
        );
        return;
      }

      console.log(
        'ответ из функции обработки вебхука: пришел повторный хук finished, ничего не менял!'
      );
    } 

  
  //   console.log('Обрабатываю payin wh:', payload);

  //   const status = payload.status.toLowerCase();


  // //поменять статус в БД
  // const updatedItem = await RqstPayInModel.findOneAndUpdate(
  //   { payment_id: payload.payment_id },
  //   {
  //     $set: {
  //       payment_status: payload.payment_status.toLowerCase(),
  //       amount_received: payload.outcome_amount,
  //     },
  //   }
  // );

  // console.log('Статус payin=', status);

  // if (status === 'finished') {
  //   const userFromRqstBase = await RqstPayInModel.findOne({
  //     payment_id: payload.payment_id,
  //   });
  //   const tlgid = userFromRqstBase.tlgid;

  //   const userFromUserBase = await UserModel.findOne({
  //     tlgid: tlgid,
  //   });

  //   const language = userFromUserBase.language;
  //   const type = 'payin';
  //   const coin = payload.price_currency;
  //   const sumToReceived = payload.outcome_amount;
  //   const textToSendUser = sumToReceived + ' ' + coin.toUpperCase();
  //   console.log('переход к функции сенд мсг');
  //   sendTlgMessage(tlgid, language, type, textToSendUser);
  // }
} catch (err) {
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции processWebhookPayIn',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}















// для обработки "хука прихода денег на биржу" (при маркет ордере) 
export async function processWebhookStock(payload) { 
  try {
    console.log('Обрабатываю:', payload);

    const status = payload.status?.toLowerCase();
    const batch_id = payload.batch_withdrawal_id;

    if (!status || !batch_id) {
      throw new Error(
        'Некорректный payload: отсутствует status или batch_withdrawal_id'
      );
    }

    console.log('Статус из FN process=', status);

    if (status === 'finished') {
      const foundItem = await RqstStockMarketOrderModel.findOne({
        batch_withdrawal_id: batch_id,
      });

      if (!foundItem) {
        throw new Error('не нашел в БД RqstStockMarketOrderModel');
      }

      if (foundItem.isOperated == false) {
        const updatedItem = await RqstStockMarketOrderModel.findOneAndUpdate(
          { batch_withdrawal_id: batch_id },
          { $set: { status: 'CoinReceivedByStock', isOperated: true } }
        );

        if (!updatedItem) {
          throw new Error(
            'не изменилось значение в БД RqstStockMarketOrderModel'
          );
        }

        console.log(
          'из функции обработки вебхука: пришел хук finished, значение isOperated поменял'
        );
        return;
      }

      console.log(
        'ответ из функции обработки вебхука: пришел повторный хук finished, ничего не менял!'
      );
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции processWebhookStock',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

// для обработки "хука прихода денег на биржу" (при лимит ордере) 
export async function processWebhookStockLimit(payload) {
  try {
    console.log('Обрабатываю:', payload);

    const status = payload.status?.toLowerCase();
    const batch_id = payload.batch_withdrawal_id;


    console.log('Статус=', status);

    if (status === 'finished') {
      const foundItem = await RqstStockLimitOrderModel.findOne({
        batch_withdrawal_id: batch_id,
      });

      if (!foundItem) {
        throw new Error('не нашел в БД RqstStockLimitOrderModel');
      }

      if (foundItem.isOperated == false) {


        const updatedItem = await RqstStockLimitOrderModel.findOneAndUpdate(
          { batch_withdrawal_id: batch_id },
          { $set: { status: 'CoinReceivedByStock', isOperated: true } }
        );

        if (!updatedItem) {
          throw new Error(
            'не изменилось значение в БД RqstStockMarketOrderModel'
          );
        }

        console.log(
          'из функции обработки вебхука: пришел хук finished, значение isOperated поменял'
        );
        return;
      }

      console.log(
        'ответ из функции обработки вебхука: пришел повторный хук finished, ничего не менял!'
      );
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции processWebhookStockLimit',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}




// для обработки "хука возврата денег с биржи" (при отмене лимитного ордера) 
export async function processWebhookStockLimitCancell(payload) {
  try {
    console.log('Обрабатываю:', payload);

    const status = payload.payment_status?.toLowerCase();
    const payment_id = payload.payment_id;


    console.log('Статус=', status);

    if (status === 'partially_paid') {
      
      const foundItem = await RqstStockLimitOrderModel.findOne({
        trtCoinFromStockToNP_np_id: payment_id,
      });

      if (!foundItem) {
        throw new Error('не нашел в БД RqstStockLimitOrderModel');
      }

      if (foundItem.isMessageSent == false) {

      const { language, tlgid } = foundItem;
      const type = 'cancellLimit';
      const textToSendUser = ''

      const tlgResponse = await sendTlgMessage(
        tlgid,
        language,
        type,
        textToSendUser
      );

      if (tlgResponse.status != 'ok') {
        throw new Error('ошибка в функции sendTlgMessage ');
      }


      const updatedItem = await RqstStockLimitOrderModel.findOneAndUpdate(
          { trtCoinFromStockToNP_np_id:  payment_id },
          { $set: { status: 'cnl_finished', isMessageSent: true } }
      );

        if (!updatedItem) {
          throw new Error(
            'не изменилось значение в БД RqstStockMarketOrderModel'
          );
        }

        console.log(
          'из функции обработки вебхука: пришел хук partially_paid, значение isMessageSent поменял'
        );
        return;
      }

      console.log(
        'ответ из функции обработки вебхука: пришел повторный хук partially_paid, ничего не менял!'
      );
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в webhooks.services.js в функции processWebhookStockLimitCancell',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}