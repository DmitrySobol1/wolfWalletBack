import express from 'express';
import mongoose from 'mongoose';

import { walletController } from './page1 - wallet/wallet.controller.js'
import { payinController } from './page1 - wallet/payin-page/payin.controller.js'
import { payoutController } from './page1 - wallet/payout-page/payout.controller.js'
import { transferController } from './page1 - wallet/transfer-page/transfer.controller.js'
import { stockController } from './page3 - stock/stock.controller.js'
import { webhooksController } from './webhooks/webhooks.controller.js'

import { exchangeController } from './page2 - exchange/exchange.controller.js'

import UserModel from './models/user.js';
import ComissionToPayoutModel from './models/comissionToPayout.js';
import ComissionToTransferModel from './models/comissionToTransfer.js';
import RqstTrtFromUserToMainModel from './models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from './models/verifiedPayouts.js';
import ComissionExchangeModel from './models/comissionToExchange.js';
import RqstPayInModel from './models/rqstPayIn.js';
import RqstTransferToOtherUserModel from './models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from './models/rqstExchange.js';
import TradingPairsModel from './models/tradingPairs.js';
import RqstStockMarketOrderModel from './models/rqstStockMarketOrder.js';
import RqstStockLimitOrderModel from './models/rqstStockLimitOrder.js';
import StockAdressesModel from './models/stockAdresses.js';
import ComissionStockMarketModel from './models/comissionStockMarket.js';
import WorkingSocketModel from './models/workingSocket.js';
import crypto from 'crypto';

import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import speakeasy from 'speakeasy';
import axios from 'axios';

import { Convert } from 'easy-currencies';
import { TEXTS } from './texts.js';

import https from 'https';
import { totalmem } from 'os';
import { toUnicode } from 'punycode';
const baseurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

app.use(express.json());
app.use(cors());


// wallet page
app.use('/api/wallet', walletController)

// wallet > payin & payout pages & transfer
app.use('/api/payin', payinController)
app.use('/api/payout', payoutController)
app.use('/api/transfer', transferController)


// exchange page
app.use('/api/exchange', exchangeController)


// stock page
app.use('/api/stock', stockController)

// all webhooks
app.use('/api/wh', webhooksController)





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













// получение инфо о nowpayment id + создать, если не существует
app.post('/api/get_user_id', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;

    console.log(userData);


    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});


// создать id в nowpayment
app.post('/api/create_user_NpId', async (req, res) => {
  try {
    const token = await getTokenFromNowPayment();

    const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);

    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { nowpaymentid: nowpaymentid } },
      { new: true } // Вернуть обновленную запись
    );

    console.log('UPDATED USER=', updatedUser);

    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});




app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server has been started');
});
