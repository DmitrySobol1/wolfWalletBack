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
import RqstTrtFromUserToMainModel from '../models/rqstTrtFromUserToMain.js';

import {
  getTokenFromNowPayment,
  createpayout,
  verifyPayout,
} from '../nowPayment/nowPayment.services.js';

import { createVerifiedPayout } from '../modelsOperations/models.services.js';

import speakeasy from 'speakeasy';

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

export async function executeCheckTask() {
  try {
    console.log('Начинаю cron1: transfer на мастер счет...');

    const records = await RqstTrtFromUserToMainModel.find({
      status: 'new',
    }).exec();

    console.log('step 1 | records=', records);

    if (records.length == 0) {
      console.log('записей не найдено');
      return;
    }

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('не получен токен от функции getBearerToken');
    }

    console.log('step 2 | token=', token);

    for (const item of records) {
      const requestData = {
        ipn_callback_url: process.env.WEBHOOKADRESS,
        withdrawals: [
          {
            address: item.adress,
            currency: item.coin,
            amount: item.qtyForApiRqst,
            ipn_callback_url: process.env.WEBHOOKADRESS,
          },
        ],
      };

      const createPayoutResult = await createpayout(requestData, token);

      if (!createPayoutResult) {
        throw new Error('не получен ответ от функции createpayout');
      }

      const batch_withdrawal_id = createPayoutResult.id;
      const payout_id = createPayoutResult.withdrawals[0].id;

      console.log('step 3 | withdrawal_id=', batch_withdrawal_id);

      const code2fa = await create2FAcode();
      if (!code2fa) {
        throw new Error('не получен код от функции create2FAcode');
      }
      console.log('step 4 | code2fa=', code2fa);

      const verify = await verifyPayout(batch_withdrawal_id, code2fa, token);
      if (!verify) {
        throw new Error('нет ответ от функции verifyPayout');
      }
      console.log('step 5 | verify=', verify);

      if (verify === 'OK') {

        const data = {
          payout_id,
          batch_withdrawal_id,
          coin: item.coin,
          sum: item.sum,
          status: 'creating',
          userIdAtNP: item.fromUserNP,
          adress: item.adress,
          networkFees: item.networkFees,
          ourComission: item.ourComission,
          qtyToSend: item.qtyToSend,
          qtyForApiRqst: item.qtyForApiRqst,
        };

        const resp = await createVerifiedPayout(data);
        if (!resp) {
          throw new Error('нет ответа от функции createVerifiedPayout');
        }

        if (resp.status == 'created') {
          console.log('step 6 | new obj at VerifiedPayoutsModel created');

          const saving = await RqstTrtFromUserToMainModel.findOneAndUpdate(
            { transactionId: item.transactionId },
            { $set: { status: 'operated' } }
            // { new: true } // Вернуть обновленную запись
          );

          if (!saving) {
            throw new Error(
              'не поменялось значение у записи в RqstTrtFromUserToMainModel '
            );
          }


          return { success: true };
        } else {
          throw new Error('не сохранился объект в БД VerifiedPayoutsModel ');
        }
      }
    }
  } catch (error) {
    console.error('Ошибка в CRON > checkTransferStatusCron cron.js |', error);
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

    if (!code) {
      throw new Error('не сработала функция speakeasy ');
    }

    return code;
  } catch (error) {
    console.error('Ошибка в функции create2FAcode |', error);
    return;
  }
}
