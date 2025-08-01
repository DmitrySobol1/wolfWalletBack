import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import axios from 'axios';

import  VerifiedPayoutsModel  from '../models/verifiedPayouts.js';
import  UserModel  from '../models/user.js';





import { TEXTS } from '../texts.js';

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

    console.log('Статус=', statusLowerLetter);

    // если статус ==finished и сообщение еще не отправлено, то шлем юзеру сообщение
    if (statusLowerLetter === 'finished' && updatedItem.isSentMsg == false) {
      const foundUser = await UserModel.findOne({
        nowpaymentid: updatedItem.userIdAtNP,
      });

      if (!foundUser) {
        throw new Error('не найден юзер в БД UserModel ');
      }

      // меняем статус, что сообщение отправили
    const updatedItem = await VerifiedPayoutsModel.findOneAndUpdate(
      { batch_withdrawal_id: payload.batch_withdrawal_id },
      { $set: { isSentMsg: true } }
    );

      const { language, tlgid } = foundUser;
      const { currency, amount, fee } = payload;

      const type = 'payout';
      const textQtyCoins = Number((Number(amount) - Number(fee)).toFixed(6));
      const textToSendUser = textQtyCoins + ' ' + currency.toUpperCase();

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

async function sendTlgMessage(tlgid, language, type, textQtyCoins) {
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
