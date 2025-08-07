// Для тестов:
// 1) поместить файл env в эту папку
// 2) расскоменти две строки 'TEST'
// 3) закомменти 2 строки 'PROD'
// 4) расскоменти EXECUTE

// TEST
// import dotenv from 'dotenv';
// dotenv.config();

// EXECUTE
// executeCheckTask2();

// PROD
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import UserModel from '../models/user.js';

import {
  getTokenFromNowPayment,
  getTransfer,
} from '../nowPayment/nowPayment.services.js';

import { sendTlgMessage } from '../webhooks/webhooks.services.js';

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK 2'))
  .catch((err) => console.log('db error:', err));

export async function executeCheckTask2() {
  try {
    console.log('Начинаю cron2: tranfer to other user...');

    const records = await RqstTransferToOtherUserModel.find({
      statusAll: 'new',
    }).exec();

    console.log('step 1 | records=', records);

    if (records.length == 0) {
      console.log('записей не найдено');
      return;
    }

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('не получен токен от функции getTokenFromNowPayment');
    }
    console.log('step 2 | token=', token);

    for (const item of records) {
      let updates = {};

      if (item.statusComission == 'new') {
        const payStatus = await getTransfer(
          token,
          item.transactionId_comission
        );
        if (!payStatus) {
          throw new Error('не получен токен от функции getTransfer');
        }

        if (payStatus[0].status.toLowerCase() == 'finished') {
          updates.statusComission = 'finished';
        }
      }

      if (item.statusTransferToUser == 'new') {
        const payStatus = await getTransfer(
          token,
          item.transactionId_transferToUser
        );
        if (!payStatus) {
          throw new Error('не получен токен от функции getTransfer');
        }

        if (payStatus[0].status.toLowerCase() == 'finished') {
          updates.statusTransferToUser = 'finished';
        }
      }

      // Если были обновления — применяем их
      if (Object.keys(updates).length > 0) {
        const updatedItem = await RqstTransferToOtherUserModel.findOneAndUpdate(
          { _id: item._id },
          { $set: updates },
          { new: true }
        );

        // Проверяем условия после обновления
        if (
          updatedItem.statusComission == 'finished' &&
          updatedItem.statusTransferToUser == 'finished'
        ) {
          await RqstTransferToOtherUserModel.findOneAndUpdate(
            { _id: item._id },
            { $set: { statusAll: 'finished' } }
          );
          console.log('step 6 | status all changed');

          const sender = await UserModel.findOne({
            nowpaymentid: item.fromUserNP,
          });

          if (!sender) {
            throw new Error('не найден пользователь в UserModel ');
          }

          const tlgidSender = sender.tlgid;
          const languageSender = sender.language;
          const textQtyCoins = `${
            item.qtyToTransfer
          }  ${item.coin.toUpperCase()}`;

          const tlgResponseSender = await sendTlgMessage(
            tlgidSender,
            languageSender,
            'sender',
            textQtyCoins
          );

          if (tlgResponseSender.status != 'ok') {
            throw new Error('ошибка в функции sendTlgMessage ');
          }

          const receiver = await UserModel.findOne({
            nowpaymentid: item.toUserNP,
          });

          if (!receiver) {
            throw new Error('не найден пользователь в UserModel ');
          }

          const tlgidReceiver = receiver.tlgid;
          const languageReceiver = receiver.language;

          const tlgResponseReceiver = await sendTlgMessage(
            tlgidReceiver,
            languageReceiver,
            'receiver',
            textQtyCoins
          );
          if (tlgResponseReceiver.status != 'ok') {
            throw new Error('ошибка в функции sendTlgMessage ');
          }

          await RqstTransferToOtherUserModel.findOneAndUpdate(
            { _id: item._id },
            { $set: { toUserTlgid: tlgidReceiver } }
          );
        }
      }
    }
  } catch (err) {
    console.error('Ошибка в CRON > TransferToOtherUserCron task.js |', err);
     console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
    return;
  }
}

