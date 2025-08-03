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
import RqstExchangeModel from '../models/rqstExchange.js';



import {
  getTokenFromNowPayment,
  getTransfer,
  createConversion,
  getConversionStatus,
  depositFromMasterToClient
} from '../nowPayment/nowPayment.services.js';

import { sendTlgMessage } from '../webhooks/webhooks.services.js'

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));


export async function executeCheckTask() {
  try {
  
  console.log('Начинаю cron3: проверка прошел ли платеж с Клиент на Мастер...');

  const recordsNew = await RqstExchangeModel.find({
    status: { $in: ['new', 'exchangewaiting', 'trtMasterToClientWaiting'] },
  }).exec();

  console.log('step 1 | records=', recordsNew);

  if (recordsNew.length == 0) {
    console.log('записей не найдено');
    return;
  }

  // const token = await getBearerToken();

      const token = await getTokenFromNowPayment();
        if (!token) {
        throw new Error('не получен токен от функции getTokenFromNowPayment');
      }

  console.log('step 2 | token=', token);

  for (const item of recordsNew) {

    if (item.status == 'new') {
      const payStatus = await getTransfer(token, item.id_clientToMaster);

        if (!payStatus) {
        throw new Error('не получен токен от функции getTransfer');
      }
      

      if (payStatus[0].status.toLowerCase() == 'finished') {

        //провести обмен
        const conversionId = await createConversion(
          token,
          item.amountFrom,
          item.coinFrom,
          item.coinTo
        );

        if (!conversionId) {
          throw new Error('не получен токен от функции createConversion');
        }

        if (conversionId.status === 'ok') {
          const updates = {
            status: 'exchangewaiting',
            id_exchange: conversionId.id,
          };

          const updatedItem = await RqstExchangeModel.findOneAndUpdate(
            { _id: item._id },
            { $set: updates },
            { new: true }
          );

          if (!updatedItem) {
            throw new Error('не сохранилось значение в БД RqstExchangeModel ');
          }

          console.log('step 3 | успех', updatedItem);
        } 
          
      }
    }

    if (item.status == 'exchangewaiting') {
      
      const conversionStatus = await getConversionStatus(
        token,
        item.id_exchange
      );

      if (!conversionStatus) {
        throw new Error('не получен токен от функции getConversionStatus');
      }


      if (conversionStatus.status.toLowerCase() == 'finished') {

        //перевести с Мастер на Клиенту монету, в которую произошел обмен
        const depositId = await depositFromMasterToClient(
          item.coinTo,
          item.amountTo,
          String(item.userNP),
          token
        );

        if (!depositId) {
        throw new Error('не получен токен от функции depositFromMasterToClient');
      }

        if (depositId.status === 'ok') {
          const updates = {
            status: 'trtMasterToClientWaiting',
            id_masterToClient: depositId.id,
          };

          const updatedItem = await RqstExchangeModel.findOneAndUpdate(
            { _id: item._id },
            { $set: updates },
            { new: true }
          );

          if (!updatedItem) {
            throw new Error('не сохранилось значение в БД RqstExchangeModel ');
          }

          console.log('step 4 | успех', updatedItem);
        } 
      }
    }

    if (item.status == 'trtMasterToClientWaiting') {
      
      const payStatus = await getTransfer(token, item.id_masterToClient);

      if (!payStatus) {
        throw new Error('не получен токен от функции getTransfer');
      }

      if (payStatus[0].status.toLowerCase() == 'finished') {

        //отправить оповещение юзеру
        const textExchangeInfo = `${item.amountFrom} ${item.coinFrom} >> ${item.amountTo} ${item.coinTo}`;


        const sendingMsgResponse = await sendTlgMessage(item.tlgid, item.language, 'exchange', textExchangeInfo);

        if (sendingMsgResponse.status != 'ok') {
         throw new Error('не отправлено сообщение юзеру в Тлг');
        }

        const updatedItem = await RqstExchangeModel.findOneAndUpdate(
          { _id: item._id },
          { $set: { status: 'done' } },
          { new: true }
        );

         if (!updatedItem) {
            throw new Error('не сохранилось значение в БД RqstExchangeModel ');
          }

        console.log('step 5 | успех', updatedItem);
      }
    }

    return { success: true };
  }
}
  catch (error) {
    console.error('Ошибка в CRON > ExchangeCron task.js |', error);
    return;
  }
}

