import express from 'express';
import mongoose from 'mongoose';
import UserModel from './models/user.js';
import ComissionToPayoutModel from './models/comissionToPayout.js';
import RqstTrtFromUserToMainModel from './models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from './models/verifiedPayouts.js';
import RqstPayInModel from './models/rqstPayIn.js';
import crypto from 'crypto';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import speakeasy from 'speakeasy';
import axios from 'axios';

import { Convert } from 'easy-currencies';
import { TEXTS } from './texts.js';

import https from 'https';
const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

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
      userData.nowpaymentid,
      req.body.tlgid
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

async function createPayAdress(token, coin, minAmount, nowpaymentid, tlgid) {
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
      ipn_callback_url: 'https://wolf-wallet.ru/api/webhook_payin',
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

    await createNewRqstPayIn(response.data.result, tlgid, nowpaymentid);
    return response.data.result.pay_address;
  } catch (error) {
    console.error('Error in createUserInNowPayment:', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

//создать запись в БД о новом запросе на ввод
async function createNewRqstPayIn(params, tlgid, nowpaymentid) {
  try {
    const doc = new RqstPayInModel({
      payment_id: params.payment_id,
      payment_status: params.payment_status,
      pay_amount: params.pay_amount,
      price_currency: params.price_currency,
      userIdAtNP: nowpaymentid,
      amount_received: params.amount_received,
      tlgid: tlgid,
    });

    const rqst = await doc.save();
  } catch (err) {
    console.log(err);
  }
}

//TODO:
// получение баланса юзера, для вывода в "пополнить" и на странице wallet tab активы
app.get('/api/get_balance_for_pay_out', async (req, res) => {
  try {
    const tlgid = req.query.tlgid
    // const tlgid = req.body.tlgid;

    const user = await UserModel.findOne({ tlgid: tlgid });
    const valute = user.valute;

    // console.log('step 1');
    // console.log('user=', user);
    // console.log('valute', valute);
    // // return res.json('ok1');

    if (user) {
      const nowpaymentid = user._doc.nowpaymentid;

      // const response = await axios.get(
      //   `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,

      //   {
      //     headers: {
      //       'x-api-key': process.env.NOWPAYMENTSAPI,
      //     },
      //   }
      // );

      // =============

      let cryptoPrices = await getCryptoPrices();

      // console.log('step 2');
      // console.log('cryptoPrices', cryptoPrices);
      // // return res.json('ok2');

      const response = await axios.get(
        `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
        {
          headers: {
            'x-api-key': process.env.NOWPAYMENTSAPI,
          },
        }
      );

      const userBalance = response.data.result.balances;
      
      // console.log('step 3');
      // console.log('response=', response.data.result);
      // return res.json('ok3');

      // Преобразовываем объект в массив объектов
      const arrayOfUserBalance = Object.entries(userBalance).map(
        ([key, value]) => ({
          currency: key, // кладем ключ внутрь объекта
          ...value, // распаковываем остальные свойства
        })
      );

      console.log('step 4');
      console.log('arrayOfUserBalance=', arrayOfUserBalance);
      // return res.json('ok4');

      let fiatKoefficient = 1;
      let symbol = '$';
      if (valute === 'eur') {
        fiatKoefficient = await Convert(1).from('USD').to('EUR');
        symbol = '€';
      } else if (valute === 'rub') {
        fiatKoefficient = await Convert(1).from('USD').to('RUB');
        symbol = '₽';
      }

      const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance.map((item) => {
  const matchingPrice = cryptoPrices.find(
    (price) => item.currency.toLowerCase() === price.symbol.toLowerCase()
  );

  const amount = item.amount != null ? parseFloat(item.amount) : 0;
  const priceUsd = parseFloat(matchingPrice?.price_usd) || 0;
  const fiatK = parseFloat(fiatKoefficient) || 0;

  if (amount > 0) {
    const priceAllCoinInUsd = (amount * priceUsd).toFixed(2);
    const priceAllCoinInUserFiat = (priceAllCoinInUsd * fiatK).toFixed(2);

    return {
      currency: item.currency,
      amount: amount,
      price_usd: priceUsd,
      priceAllCoinInUsd: priceAllCoinInUsd,
      priceAllCoinInUserFiat: priceAllCoinInUserFiat,
      symbol: symbol,
    };
  }
  return null; // или return {};
}).filter(Boolean); // Удаляет null/undefined из массива;

      // console.log('step 5');
      // console.log('arrayOfUserBalanceWithUsdPrice=', arrayOfUserBalanceWithUsdPrice);
      // return res.json('ok5');
      // =================

      // TODO: проверить верность подсчета коэффициента

      

      return res.json({ arrayOfUserBalanceWithUsdPrice });
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

// для обработки "вывода" средств
app.post('/api/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Получен вебхук payout:', payload);

    // 1. Проверяем обязательный заголовок
    const receivedSignature = req.headers['x-nowpayments-sig'];
    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      return res.status(400).json({ error: 'Missing signature header' });
    }

    // 2. Безопасная сортировка объекта
    const safeSort = (obj) => {
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
    };

    // 3. Генерация и проверка подписи
    const hmac = crypto.createHmac('sha512', process.env.IPN_SECRET_KEY);
    hmac.update(JSON.stringify(safeSort(payload)));
    const expectedSignature = hmac.digest('hex');

    // 4. Безопасное сравнение подписей
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.log('Неверная подпись');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    console.log('Подписи совпадают');

    // 5. Обработка вебхука (с обработкой ошибок)
    try {
      res.status(200).json({ status: 'success' });
      //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт

      await processWebhookPayout(payload);
    } catch (processError) {
      console.error('Ошибка обработки:', processError);
      res.status(500).json({ error: 'Processing failed' });
    }
  } catch (error) {
    console.error('Ошибка обработки вебхука:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// функция обработки вывод средств (payout)
async function processWebhookPayout(payload) {
  console.log('Обрабатываю:', payload);

  const statusLowerLetter = payload.status.toLowerCase();

  const updatedItem = await VerifiedPayoutsModel.findOneAndUpdate(
    { batch_withdrawal_id: payload.batch_withdrawal_id },
    { $set: { status: statusLowerLetter } }
  );

  console.log('Статус=', payload.status.toLowerCase());

  if (payload.status.toLowerCase() === 'finished') {
    const foundUser = await UserModel.findOne({
      nowpaymentid: updatedItem.userIdAtNP,
    });
    const language = foundUser.language;
    const tlgid = foundUser.tlgid;
    console.log('переход к функции сенд мсг');
    const type = 'payout';
    sendTlgMessage(tlgid, language, type);
  }
}

// для обработки "ввода" средств
app.post('/api/webhook_payin', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Получен вебхук payin:', payload);

    // 1. Проверяем обязательный заголовок
    const receivedSignature = req.headers['x-nowpayments-sig'];
    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      return res.status(400).json({ error: 'Missing signature header' });
    }

    // 2. Безопасная сортировка объекта
    const safeSort = (obj) => {
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
    };

    // 3. Генерация и проверка подписи
    const hmac = crypto.createHmac('sha512', process.env.IPN_SECRET_KEY);
    hmac.update(JSON.stringify(safeSort(payload)));
    const expectedSignature = hmac.digest('hex');

    // 4. Безопасное сравнение подписей
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      console.log('Неверная подпись');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    console.log('Подписи совпадают');

    // 5. Обработка вебхука (с обработкой ошибок)
    try {
      res.status(200).json({ status: 'success' });
      //TODO: добавить логику, если приходят остальные статусы - как то оповещать юзера

      await processWebhookPayin(payload);
    } catch (processError) {
      console.error('Ошибка обработки:', processError);
      res.status(500).json({ error: 'Processing failed' });
    }
  } catch (error) {
    console.error('Ошибка обработки вебхука:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//FIXME:
// функция обработки payIn со статусом finished
async function processWebhookPayin(payload) {
  console.log('Обрабатываю payin:');

  // const statusLowerLetter = payload.payment_status.toLowerCase()

  const updatedItem = await RqstPayInModel.findOneAndUpdate(
    { payment_id: payload.payment_id },
    { $set: { payment_status: payload.payment_status.toLowerCase() } }
  );

  console.log('Статус payin=', payload.payment_status.toLowerCase());

  // const uslovie = payload.status.toLowerCase()

  if (payload.payment_status.toLowerCase() === 'finished') {
    const userFromRqstBase = await RqstPayInModel.findOne({
      payment_id: payload.payment_id,
    });
    const tlgid = userFromRqstBase.tlgid;

    const userFromUserBase = await UserModel.findOne({
      tlgid: tlgid,
    });

    const language = userFromUserBase.language;
    const type = 'payin';
    console.log('переход к функции сенд мсг');
    sendTlgMessage(tlgid, language, type);
  }
}

function sendTlgMessage(tlgid, language, type) {
  const { title, text } = TEXTS[type]?.[language];

  // const sendingText = TEXTS[language].text;
  const params = `?chat_id=${tlgid}&text=${title}%0A${text}`;
  const url = baseurl + params;

  https
    .get(url, (response) => {
      let data = '';

      // Когда запрос завершён
      response.on('end', () => {
        console.log(JSON.parse(data)); // Выводим результат
      });
    })
    .on('error', (err) => {
      console.error('Ошибка:', err);
    });
}


//статистика пополнения баланса
app.get('/api/get_my_payin', async (req, res) => {
  try {
    if (!req.query.tlgid) {
      return res.status(400).json({ message: 'Параметр tlgid обязателен' });
    }

    const payins = await RqstPayInModel.find({
      payment_status: 'finished',
      tlgid: req.query.tlgid
    }).sort({ updatedAt: -1 }).lean();

    if (!payins || payins.length === 0) {
      return res.status(404).json({ status: 'no' });
    }

    const months = [
      'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
    ];

    
    const processedPayins = payins.map(item => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      // Ошибка 2: Возвращаем новый объект, а не мутируем исходный
      return {
        ...item,
        formattedDate: `${day} ${month} ${hours}:${minutes}`
      };
    });

    return res.status(200).json({ 
      status: 'ok',
      count: processedPayins.length,
      data: processedPayins 
    });
    
  } catch (err) {
    console.error('Ошибка в /api/get_my_payin:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});


//статистика вывода с баланса
app.get('/api/get_my_payout', async (req, res) => {
  try {

const tlgid = req.query.tlgid

    if (!tlgid) {
      return res.status(400).json({ message: 'Параметр tlgid обязателен' });
    }

    const user = await UserModel.findOne({ tlgid: tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;

    const payouts = await VerifiedPayoutsModel.find({
      status: 'finished',
      userIdAtNP: nowpaymentid
    }).sort({ updatedAt: -1 }).lean();

    if (!payouts || payouts.length === 0) {
      return res.status(404).json({ status: 'no' });
    }

    const months = [
      'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
    ];

    
    const processedPayouts = payouts.map(item => {
      const date = new Date(item.updatedAt);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      // Ошибка 2: Возвращаем новый объект, а не мутируем исходный
      return {
        ...item,
        formattedDate: `${day} ${month} ${hours}:${minutes}`
      };
    });

    return res.status(200).json({ 
      status: 'ok',
      count: processedPayouts.length,
      data: processedPayouts 
    });
    
  } catch (err) {
    console.error('Ошибка в /api/get_my_payout:', err);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
});


app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server has been started');
});
