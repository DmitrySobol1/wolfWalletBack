// import dotenv from 'dotenv';
// dotenv.config();

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import UserModel from '../models/user.js';

import https from 'https';

// import cors from 'cors';

import { TEXTS } from './texts.js';

// import speakeasy from 'speakeasy';
import axios from 'axios';

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK 2'))
  .catch((err) => console.log('db error:', err));

// const app = express();

// app.use(express.json());
// app.use(cors());

// FIXME:: убрат в проде команду
// executeCheckTask2();

// FIXME: убрать файл env из этой папки перед заливкой на сервер
// TODO: нужно ли убирать из этого файла const app и прочее?

export async function executeCheckTask2() {
  console.log('Начинаю cron2: tranfer to other user...');

  const records = await RqstTransferToOtherUserModel.find({
    statusAll: 'new',
  }).exec();

  console.log('step 1 | records=', records);

  if (records.length == 0) {
    console.log('записей не найдено');
    return;
  }

  // console.log('step 2 | token=', token);

  for (const item of records) {
    const token = await getBearerToken();
    let updates = {};

    if (item.statusComission == 'new') {
      const payStatus = await getTransfer(token, item.transactionId_comission);
      if (payStatus[0].status.toLowerCase() == 'finished') {
        updates.statusComission = 'finished';
      }
    }

    if (item.statusTransferToUser == 'new') {
      const payStatus = await getTransfer(
        token,
        item.transactionId_transferToUser
      );
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
        const tlgidSender = sender.tlgid;
        const languageSender = sender.language;
        const textQtyCoins = `${
          item.qtyToTransfer
        }  ${item.coin.toUpperCase()}`;
        sendTlgMessage(tlgidSender, languageSender, 'sender', textQtyCoins);

        const receiver = await UserModel.findOne({
          nowpaymentid: item.toUserNP,
        });

        const tlgidReceiver = receiver.tlgid;
        const languageReceiver = receiver.language;

        sendTlgMessage(
          tlgidReceiver,
          languageReceiver,
          'receiver',
          textQtyCoins
        );

        await RqstTransferToOtherUserModel.findOneAndUpdate(
          { _id: item._id },
          { $set: { toUserTlgid: tlgidReceiver } }
        );
      }
    }
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


function sendTlgMessage(tlgid, language, role, textQtyCoins) {
  const { title, text } = TEXTS[role]?.[language];
  const fullText = text + textQtyCoins;

  
  const params = `?chat_id=${tlgid}&text=${title}%0A${fullText}`;
  const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

  const url = baseurl + params;

  https
    .get(url, (response) => {
      let data = '';

      
      response.on('end', () => {
        console.log(JSON.parse(data)); // Выводим результат
      });
    })
    .on('error', (err) => {
      console.error('Ошибка:', err);
    });
}
