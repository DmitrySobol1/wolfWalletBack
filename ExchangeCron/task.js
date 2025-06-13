// для тестов
// import dotenv from 'dotenv';
// dotenv.config();

//для прода
import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import mongoose from 'mongoose';
import RqstExchangeModel from '../models/rqstExchange.js';

import { TEXTS } from './texts.js';

import https from 'https';

import cors from 'cors';


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
// executeCheckTask();

// TODO: убрать файл env из этой папки перед заливкой на сервер
// TODO: нужно ли убирать из этого файла const app и прочее?

export async function executeCheckTask() {
  console.log('Начинаю cron3: проверка прошел ли платеж с Клиент на Масте...');

  const recordsNew = await RqstExchangeModel.find({
     status: { $in: ['new', 'exchangewaiting','trtMasterToClientWaiting'] }
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
        //провести обмен

        const conversionId = await createConversion(
          token,
          item.amountFrom,
          item.coinFrom,
          item.coinTo
        );

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

          console.log('step 3 | успех', updatedItem);
        } else {
          console.log('step 3 | ошибка');
          return res.json({ success: false });
        }
      }
    }

    if (item.status == 'exchangewaiting') {
        const conversionStatus = await getConversionStatus(token, item.id_exchange);
        
        if (conversionStatus.status.toLowerCase() == 'finished') {
            //перевести с Мастер на Клиенту монету, в которую произошел обмен

        const depositId = await depositFromMasterToClient(
          item.coinTo,
          item.amountTo,
          String(item.userNP),
          token
        );

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

          console.log('step 4 | успех', updatedItem);
        } else {
          console.log('step 4 | ошибка');
          return res.json({ success: false });
        }


        }
    
    }
    


if (item.status == 'trtMasterToClientWaiting') {
      const payStatus = await getTransfer(token, item.id_masterToClient);

      if (payStatus[0].status.toLowerCase() == 'finished') {
        //отправить оповещение юзеру

        const textExchangeInfo = `${item.amountFrom} ${item.coinFrom} >> ${item.amountTo} ${item.coinTo}`

        sendTlgMessage(item.tlgid, item.language, textExchangeInfo)

        const updatedItem = await RqstExchangeModel.findOneAndUpdate(
            { _id: item._id },
            { $set: {status: 'done'} },
            { new: true }
          );
        console.log('step 5 | успех', updatedItem);
      }
    }



    // const requestData = {
    //   ipn_callback_url: process.env.WEBHOOKADRESS,
    //   withdrawals: [
    //     {
    //       address: item.adress,
    //       currency: item.coin,
    //       amount: item.qtyForApiRqst,
    //       ipn_callback_url: process.env.WEBHOOKADRESS,
    //     },
    //   ],
    // };

    // const createPayoutResult = await createpayout(requestData, token);

    // const batch_withdrawal_id = createPayoutResult.id;
    // const payout_id = createPayoutResult.withdrawals[0].id;

    // console.log('step 3 | withdrawal_id=', batch_withdrawal_id);

    // const code2fa = await create2FAcode();
    // console.log('step 4 | code2fa=', code2fa);

    // const verify = await verifyPayout(batch_withdrawal_id, code2fa, token);
    // console.log('step 5 | verify=', verify);

    // if (verify === 'OK') {
    //   const status = 'creating';

    //   await createVerifiedPayout(
    //     payout_id,
    //     batch_withdrawal_id,
    //     item.coin,
    //     item.sum,
    //     status,
    //     item.userIdAtNP,
    //     item.adress,
    //     item.networkFees,
    //     item.ourComission,
    //     item.qtyToSend,
    //     item.qtyForApiRqst
    //   );
    //   console.log('step 6 | new obj created');

    //   await RqstTrtFromUserToMainModel.findOneAndUpdate(
    //     { transactionId: item.transactionId },
    //     { $set: { status: 'operated' } }
    //     // { new: true } // Вернуть обновленную запись
    //   );
    // }

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
      qtyForApiRqst,
    });

    const user = await rqst.save();
    return 'created';
  } catch (err) {
    console.log(err);
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

//сделать конверсию валют
async function createConversion(token, amount, coinFrom, coinTo) {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/conversion',
    { amount: amount, from_currency: coinFrom, to_currency: coinTo },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  //   return {result: response.data.result, id:response.data.result} ;

  if (response.data.result.status === 'WAITING') {
    // console.log('из функции createConversion  WAITING', response.data.result.status)
    return { status: 'ok', id: response.data.result.id };
  } else {
    // console.log('из функции createConversion  error', response.data.result)
    return { status: 'error' };
  }
}




//получить инфо о статусе корвертации
async function getConversionStatus(token, id) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/conversion/${id}`,

    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data.result;
}



async function depositFromMasterToClient(coinTo, amountTo, userNP,token) {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/sub-partner/deposit',
    { currency: coinTo, amount: amountTo, sub_partner_id: userNP },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTSAPI
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





function sendTlgMessage(tlgid, language, textExchangeInfo) {
  const { title } = TEXTS[language];
//   const fullText = text + textQtyCoins;

  
  const params = `?chat_id=${tlgid}&text=${title}%0A${textExchangeInfo}`;
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