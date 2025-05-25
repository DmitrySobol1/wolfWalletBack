import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import ComissionToPayoutModel from './models/comissionToPayout.js';
import RqstTrtFromUserToMainModel from './models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from './models/verifiedPayouts.js';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import speakeasy from 'speakeasy';
import axios from 'axios';

import { Convert } from 'easy-currencies';

// import https from 'https';
// const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

app.use(express.json());
app.use(cors());

app.get('/api', (req, res) => {
  res.send('hello man 88');
});

// вход пользователя в аппку
app.post('/api/enter', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    //создание юзера
    if (!user) {
      await createNewUser(req.body.tlgid);
      const userData = { result: 'showOnboarding' };
      // return res.json({ result: 'showOnboarding' });
      return res.json({ userData });
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showWalletPage';
    return res.json({ userData });

       // return res.json({ result: 'showFirstScreen' });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});



app.get('/api/gettest', async (req, res) => {
  try {
  res.send('GET done from server');
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});


app.get('/api/gettest2', (req, res) => {
  res.send('hello man 88');
});


app.post('/api/posttest', async (req, res) => {
  try {
  res.send('POST done from server');
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});







async function createNewUser(tlgid) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
      isOnboarded: false,
      isMemberEdChannel: null,
      jb_email: null,
      isLevelTested: false,
      level: null,
      nowpaymentid: 0,
      valute: 'eur',
      language: 'en',
    });

    const user = await doc.save();
  } catch (err) {
    console.log(err);
  }
}

// получение баланса пользователя
app.post('/api/get_user_balance', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;
    const language = userData.language;

    
    const valute = userData.valute;

    if (userData.nowpaymentid === 0) {
      return res.json({ balance: 0 });
    }

    let cryptoPrices = await getCryptoPrices();

    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    const userBalance = response.data.result.balances;

    // Преобразовываем объект в массив объектов
    const arrayOfUserBalance = Object.entries(userBalance).map(
      ([key, value]) => ({
        currency: key, // кладем ключ внутрь объекта
        ...value, // распаковываем остальные свойства
      })
    );

    const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance.map((item) => {
      // находим подходящий объект из cryptoPrices
      const matchingPrice = cryptoPrices.find(
        (price) => item.currency.toLowerCase() === price.symbol.toLowerCase()
      );

      // возвращаем новый объект с необходимой информацией
      return {
        currency: item.currency,
        amount: item.amount,
        price_usd: matchingPrice?.price_usd ?? null, // если нет подходящей цены, ставим null
      };
    });

    const userBalanceInUsd = arrayOfUserBalanceWithUsdPrice.reduce(
      (accumulator, item) => {
        return accumulator + item.amount * item.price_usd;
      },
      0
    );

    // получение курса доллара в валюте клиента
    if (valute === 'usd') {
      const roundedBalance = parseFloat(userBalanceInUsd.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '$',
        language: language,
      });
    } else if (valute === 'eur') {
      const balance = await Convert(userBalanceInUsd).from('USD').to('EUR');
      const roundedBalance = parseFloat(balance.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '€',
        language: language,
      });
    } else if (valute === 'rub') {
      const balance = await Convert(userBalanceInUsd).from('USD').to('RUB');
      const roundedBalance = parseFloat(balance.toFixed(2));
      return res.json({
        balance: roundedBalance,
        valute: valute,
        symbol: '₽',
        language: language,
      });
    }

    return res.json({ userBalanceInUsd: userBalanceInUsd });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// получение данных о стоимости крипты
async function getCryptoPrices() {
  const response = await axios.get('https://api.coinlore.net/api/tickers/');

  return response.data.data;
}

// получение из nowpayments монет, одобренных в ЛК
app.get('/api/get_available_coins', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.nowpayments.io/v1/merchant/coins',
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    return res.json(response.data);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// смена валюты в БД
app.post('/api/change_valute', async (req, res) => {
  await UserModel.findOneAndUpdate(
    { tlgid: req.body.tlgid },
    { $set: { valute: req.body.valute } }
  );

  return res.json('OK');
});

// смена языка в БД
app.post('/api/change_language', async (req, res) => {
  await UserModel.findOneAndUpdate(
    { tlgid: req.body.tlgid },
    { $set: { language: req.body.language } }
  );

  return res.json('OK');
});

// получение информации, чтобы вернуть адресс и мин сумму пополнения, создать ЛК юзера в NP ?
app.post('/api/get_info_for_payinadress', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const token = await getTokenFromNowPayment();

    if (userData.nowpaymentid === 0) {
      const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);

      //записать nowpaymentid в БД
      const updatedUser = await UserModel.findOneAndUpdate(
        { tlgid: req.body.tlgid },
        { $set: { nowpaymentid: nowpaymentid } },
        { new: true } // Вернуть обновленную запись
      );

      const { ...userData } = updatedUser._doc;
    }

    const minAmount = await getMinAmountForDeposit(req.body.coin);

    const payAdress = await createPayAdress(
      token,
      req.body.coin,
      minAmount,
      userData.nowpaymentid
    );

    const objToFront = {
      minAmount,
      payAdress,
    };

    return res.json(objToFront);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

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



async function getMinAmountForDeposit(coin) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/min-amount?currency_from=${coin}&fiat_equivalent=usd&is_fixed_rate=false&is_fee_paid_by_user=False`,
    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );

  return response.data.min_amount;
}

async function createUserInNowPayment(token, tlgid) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!tlgid || (typeof tlgid !== 'string' && typeof tlgid !== 'number')) {
      throw new Error('Invalid tlgid format');
    }

    // 2. Формирование тела запроса (уточните правильную структуру в API-документации)
    const requestData = {
      name: String(tlgid),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/balance',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.id) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    return response.data.result.id;
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
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

    // 2. Формирование тела запроса (уточните правильную структуру в API-документации)
    const requestData = {
      currency: coin,
      amount: Number(minAmount),
      sub_partner_id: String(nowpaymentid),
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
      ipn_callback_url: 'https://...url',
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

    return response.data.result.pay_address;
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

// получение баланса юзера, для вывода в "пополнить"
app.get('/api/get_balance_for_pay_out', async (req, res) => {
  try {
    // const tlgid = req.query.tlgid

    const user = await UserModel.findOne({ tlgid: req.query.tlgid });

    if (user) {
      const nowpaymentid = user._doc.nowpaymentid;
      const response = await axios.get(
        `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,

        {
          headers: {
            'x-api-key': process.env.NOWPAYMENTSAPI,
          },
        }
      );

      return res.json(response.data);
    } else {
      console.log('такого нет');
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

// проверка валидности адреса кошелька
app.post('/api/validate_adress', async (req, res) => {
  try {
    const validateResult = await validateAdress(req.body.adress, req.body.coin);

    if (validateResult === 'OK') {
      return res.json(validateResult);
    } else {
      return res.json('not ok');
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

async function validateAdress(adress, coin) {
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

//сохранить новую комиссию за вывод
app.post('/api/save_new_comission', async (req, res) => {
  const doc = new ComissionToPayoutModel({
    qty: 1,
    coin: 'btc',
  });

  const comission = await doc.save();
});

// получить сумму комиссий
app.get('/api/get_comission', async (req, res) => {
  try {
    const comission = await ComissionToPayoutModel.findOne({
      coin: req.query.coin,
    });

    console.log('com=', comission);
    return res.json({ comission });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//создать запрос на вывод монет (перевод с юзер счета на мастер счет)
app.post('/api/rqst_to_payout', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    if (!user) {
      return res.status(404).send('Пользователь не найден');
    }

    const nowpaymentid = user._doc.nowpaymentid;

    const requestData = {
      currency: String(req.body.coin),
      amount: Number(req.body.toSend),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/write-off',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data.result.status === 'PROCESSING') {
      const transactionId = response.data.result.id;

      console.log('transactionId=', response.data.result);

      const createRqst = await createRqstTrtFromuserToMain(
        transactionId,
        req.body.coin,
        req.body.toSend,
        nowpaymentid,
        req.body.adress
      );

      if (createRqst === 'created') {
        console.log('createRqst=', createRqst);
        return res.json({ status: 'OK' });
      }
    }
  } catch (error) {
    console.error('Error in createRqstTrtFromuserToMain', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }

  
});

async function createRqstTrtFromuserToMain(
  transactionId,
  coin,
  qty,
  userIdAtNP,
  adress
) {
  try {
    const rqst = new RqstTrtFromUserToMainModel({
      transactionId: transactionId,
      coin: coin,
      qty: qty,
      status: 'new',
      userIdAtNP: userIdAtNP,
      adress: adress,
    });

    const user = await rqst.save();
    return 'created';
  } catch (err) {
    console.log(err);
  }
}

// СТАРТ ===============================================================

// app.get('/test', (req, res) => {
//   async function executeCheckTask() {
//     console.log('Начинаю cron...');

//     const records = await RqstTrtFromUserToMainModel.find({
//       status: 'new',
//     }).exec();

//     console.log('step 1 | records=', records);

//     const token = await getBearerToken();

//     console.log('step 2 | token=', token);

//     for (const item of records) {
//       const requestData = {
//         ipn_callback_url: 'https://nowpayments.io',
//         withdrawals: [
//           {
//             address: item.adress,
//             currency: item.coin,
//             amount: item.qty,
//             ipn_callback_url: 'https://nowpayments.io',
//           },
//         ],
//       };

//       const createPayoutResult = await createpayout(requestData, token);

//       const batch_withdrawal_id = createPayoutResult.id;
//       const payout_id = createPayoutResult.withdrawals[0].id;

//       console.log('step 3 | withdrawal_id=', batch_withdrawal_id);

//       const code2fa = await create2FAcode();
//       console.log('step 4 | code2fa=', code2fa);

//       const verify = await verifyPayout(batch_withdrawal_id, code2fa, token);
//       console.log('step 5 | verify=', verify);

//       if (verify === 'OK') {
//         const status = 'creating';

//         await createVerifiedPayout(
//           payout_id,
//           batch_withdrawal_id,
//           item.coin,
//           item.qty,
//           status,
//           item.userIdAtNP,
//           item.adress
//         );
//         console.log('step 6 | new obj created');

//         await RqstTrtFromUserToMainModel.findOneAndUpdate(
//           { transactionId: item.transactionId },
//           { $set: { status: 'operated' } }
//           // { new: true } // Вернуть обновленную запись
//         );
//       }

//       return res.json({ success: true });
//     }
//   }

//   executeCheckTask();
// });

// // ДОП ФУНКЦИИ ДЛЯ CRON ФУНКЦИИ ==================================

// //получить bearer token
// async function getBearerToken() {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/auth',
//     {
//       email: process.env.NOWPAYMENTSEMAIL,
//       password: process.env.NOWPAYMENTSPASSWD,
//     },
//     {
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   return response.data.token;
// }

// //создать payout
// async function createpayout(requestData, token) {
//   const response = await axios.post(
//     'https://api.nowpayments.io/v1/payout',
//     requestData,
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   // return response.data.id;
//   return response.data;
// }

// //создать 2FA код
// async function create2FAcode() {
//   try {
//     const secret_key = process.env.TWOFACODE;

//     const code = speakeasy.totp({
//       secret: secret_key,
//       encoding: 'base32',
//     });

//     return code;
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: 'Ошибка при создании кода.' });
//   }
// }

// //верифицировать payout
// async function verifyPayout(withdrawal_id, code2fa, token) {
//   const response = await axios.post(
//     `https://api.nowpayments.io/v1/payout/${withdrawal_id}/verify`,
//     {
//       verification_code: code2fa,
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'x-api-key': process.env.NOWPAYMENTSAPI,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   return response.data;
// }

// // создать новый объект в verified payouts
// async function createVerifiedPayout(
//   payout_id,
//   batch_withdrawal_id,
//   coin,
//   qty,
//   status,
//   userIdAtNP,
//   adress
// ) {
//   try {
//     const rqst = new VerifiedPayoutsModel({
//       payout_id,
//       batch_withdrawal_id,
//       coin,
//       qty,
//       status,
//       userIdAtNP,
//       adress,
//     });

//     const user = await rqst.save();
//     return 'created';
//   } catch (err) {
//     console.log(err);
//   }
// }

// ====================================================================

app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server has been started');
});
