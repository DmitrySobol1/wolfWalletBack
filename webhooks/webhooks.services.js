import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import axios from 'axios';

import crypto from 'crypto';

import VerifiedPayoutsModel from '../models/verifiedPayouts.js';
import UserModel from '../models/user.js';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';

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
  } catch (error) {
    console.error(
      'Ошибка в webhooks.services.js в функции sendTlgMessage |',
      error
    );
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
    console.log('Обрабатываю:', payload);

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
  } catch (error) {
    console.error(
      'Ошибка в webhooks.services.js в функции processWebhookPayout |',
      error
    );
    return;
  }
}

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

    // const statusLowerLetter = payload.status.toLowerCase();

    // const updatedItem = await RqstStockMarketOrderModel.findOneAndUpdate(
    //   { batch_withdrawal_id: payload.batch_withdrawal_id },
    //   { $set: { status: statusLowerLetter } }
    // );

    // if (!updatedItem) {
    //   throw new Error('не изменилось значение в БД RqstStockMarketOrderModel');
    // }

    console.log('Статус=', status);

    if (status === 'finished') {
      const foundItem = await RqstStockMarketOrderModel.findOne({
        batch_withdrawal_id: batch_id,
      });

      console.log('проверка foundItem=', foundItem)
      console.log('проверка2 foundItem.isOperated=', foundItem.isOperated)

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
  } catch (error) {
    console.error(
      'Ошибка в webhooks.services.js в функции processWebhookStock',
      error
    );
    return;
  }
}
