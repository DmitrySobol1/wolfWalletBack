// import dotenv from 'dotenv';
// dotenv.config();

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';
import RqstTrtFromUserToMainModel from '../models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from '../models/verifiedPayouts.js';

import cors from 'cors';

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

// TODO: убрат в проде команду
// executeCheckTask()

// TODO: убрать файл env из этой папки перед заливкой на сервер
// TODO: нужно ли убирать из этого файла const app и прочее?

export async function executeCheckTask() {
  console.log('Начинаю cron1: transfer на мастер счет...');

  const records = await RqstTrtFromUserToMainModel.find({
    status: 'new',
  }).exec();

  console.log('step 1 | records=', records);

  if (records.length == 0) {
    console.log('записей не найдено');
    return;
  }

  const token = await getBearerToken();

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

    const batch_withdrawal_id = createPayoutResult.id;
    const payout_id = createPayoutResult.withdrawals[0].id;

    console.log('step 3 | withdrawal_id=', batch_withdrawal_id);

    const code2fa = await create2FAcode();
    console.log('step 4 | code2fa=', code2fa);

    const verify = await verifyPayout(batch_withdrawal_id, code2fa, token);
    console.log('step 5 | verify=', verify);

    if (verify === 'OK') {
      const status = 'creating';

      await createVerifiedPayout(
        payout_id,
        batch_withdrawal_id,
        item.coin,
        item.sum,
        status,
        item.userIdAtNP,
        item.adress,
        item.networkFees,
        item.ourComission,
        item.qtyToSend,
        item.qtyForApiRqst
      );
      console.log('step 6 | new obj created');

      await RqstTrtFromUserToMainModel.findOneAndUpdate(
        { transactionId: item.transactionId },
        { $set: { status: 'operated' } }
        // { new: true } // Вернуть обновленную запись
      );
    }

    // return res.json({ success: true });
    return { success: true };
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



// создать новый объект в verified payouts
async function createVerifiedPayout(
  payout_id,
  batch_withdrawal_id,
  coin,
  sum,
  status,
  userIdAtNP,
  adress,
  networkFees,
  ourComission,
  qtyToSend,
  qtyForApiRqst
) {
  try {
    const rqst = new VerifiedPayoutsModel({
      payout_id,
      batch_withdrawal_id,
      coin,
      sum,
      status,
      userIdAtNP,
      adress,
      networkFees,
      ourComission,
      qtyToSend,
      qtyForApiRqst
    });

    const user = await rqst.save();
    return 'created';
  } catch (err) {
    console.log(err);
  }
}
