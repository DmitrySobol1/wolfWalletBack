import { Router } from 'express';
const router = Router();

import axios from 'axios';

import { getPrice } from '../stockKukoin/kukoin.services.js';

import { getMinDeposit, getTokenFromNowPayment, makeWriteOff } from '../nowPayment/nowPayment.services.js';

import UserModel from '../models/user.js';
import ComissionToPayoutModel from '../models/comissionToPayout.js';
import ComissionToTransferModel from '../models/comissionToTransfer.js';
import RqstTrtFromUserToMainModel from '../models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from '../models/verifiedPayouts.js';
import ComissionExchangeModel from '../models/comissionToExchange.js';
import RqstPayInModel from '../models/rqstPayIn.js';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from '../models/rqstExchange.js';
import TradingPairsModel from '../models/tradingPairs.js';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';
import StockAdressesModel from '../models/stockAdresses.js';
import ComissionStockMarketModel from '../models/comissionStockMarket.js';
import WorkingSocketModel from '../models/workingSocket.js';

export const stockController = router;

// получение торговых пар для биржи
router.get('/get_stock_pairs', async (req, res) => {
  try {
    const pairs = await TradingPairsModel.find().lean();
    if (!pairs || pairs.length == 0) {
      return res.json({ statusBE: 'notOk' });
    }

    res.json({
      status: 'success',
      data: pairs,
    });
  } catch (error) {
    console.error('Error in endpoint /stock/get_stock_pairs');
    res.json({ statusBE: 'notOk' });
  }
});

// получение стоимости валютной пары
router.get('/get_ticker', async (req, res) => {
  try {
    const { pair } = req.query;
    if (!pair) {
      return res.json({ statusBE: 'notOk' });
    }

    const response = await getPrice(pair);
    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }

    return res.json(response.data);
  } catch (error) {
    console.error('Error in endpoint /stock/get_ticker');
    res.json({ statusBE: 'notOk' });
  }
});

// получить сумму комиссий
router.get('/get_ourComissionStockMarket', async (req, res) => {
  try {
    const comission = await ComissionStockMarketModel.findOne({
      coin: 'ourComission',
    });

    if (!comission) {
      return res.json({ statusBE: 'notOk' });
    }

    return res.json({ comission: comission.qty, statusFn: 'ok' });
  } catch (error) {
    console.error('Error in endpoint /stock/get_ourComissionStockMarket');
    res.json({ statusBE: 'notOk' });
  }
});

//получение минимальных сумм для ввода/вывода NP|stock - start

router.get('/get_minWithdrawNp', async (req, res) => {
  try {
    const { coin } = req.query;

    if (!coin) {
      throw new Error('нет параметра coin в query');
    }

    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout-withdrawal/min-amount/${coin}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    if (!response) {
      throw new Error('нет ответа от NP');
    }

    if (response.data.success != true) {
      throw new Error('NP прислал не верный ответ');
    } else {
      res.json({
        statusFn: 'ok',
        result: response.data.result,
      });
    }
  } catch (error) {
    console.error('Ошибка в endpoint /stock/get_minWithdrawNp | ', error);
    res.json({ statusBE: 'notOk' });
  }
});

router.get('/get_minDepositWithdrawStock', async (req, res) => {
  try {
    const { chain, coin } = req.query;

    if (!chain || !coin) {
      throw new Error('не пришли параметры chain|coin с фронта');
    }

    const response = await axios.get(
      `https://api.kucoin.com/api/v3/currencies/${coin}?chain=${chain}`
    );
    if (!response) {
      throw new Error('нет ответа от Kukoin');
    }

    if (
      response.data.code === '200000' &&
      Array.isArray(response.data.data.chains) &&
      response.data.data.chains.length > 0 &&
      response.data.data.chains[0].depositMinSize &&
      response.data.data.chains[0].withdrawalMinSize
    ) {
      //чтобы избежать нехватки при перевода с Биржи на Клиента
      const sum =
        Number(response.data.data.chains[0].withdrawalMinSize) +
        Number(response.data.data.chains[0].withdrawalMinFee);

      res.json({
        statusFn: 'ok',
        deposit: response.data.data.chains[0].depositMinSize,
        withdrawal: sum,
      });
    } else {
      throw new Error('не верные данные от Kukoin');
    }
  } catch (error) {
    console.error('Ошибка в endpoint /get_minDepositWithdrawStock | ', error);
    res.json({ statusBE: 'notOk' });
  }
});

router.get('/get_minDepositNp', async (req, res) => {
  try {
    const { coin } = req.query;

    const response = await getMinDeposit(coin);

    if (!response) {
      throw new Error('нет ответа от функции getMinDeposit');
    }

    res.json({ result: response.data.min_amount });
  } catch (error) {
    console.error('Ошибка в endpoint stock/get_minDepositNp | ', error);
    res.json({ statusBE: 'notOk' });
  }
});

//найти мои открытые ордера
router.get('/get_myOpenOrders', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      throw new Error('не передан tlgid');
    }

    const userData = await UserModel.findOne({ tlgid: tlgid });
    const lang = userData.language;

    if (!userData) {
      throw new Error('не найден user в UserModel');
    }

    const marketOrders = await RqstStockMarketOrderModel.find({
      status: { $ne: 'done' },
      tlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!marketOrders) {
      throw new Error('не найден объект в RqstStockMarketOrderModel');
    }

    const limitOrders = await RqstStockLimitOrderModel.find({
      status: { $ne: 'done' },
      tlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!limitOrders) {
      throw new Error('не найден объект в RqstStockLimitOrderModel');
    }

    if (
      (!marketOrders && !limitOrders) ||
      (marketOrders.length === 0 && limitOrders.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const processedMarketOrders = marketOrders.map((item) => {
      const type = {
        ru: 'маркет ордер',
        en: 'market order',
        de: 'marktauftrag',
      };

      const statusText = {
        ru: 'в работе',
        en: 'in progress',
        de: 'im gange',
      };

      let infoText = {};

      if (item.type == 'buy') {
        infoText = {
          ru: `покупка ${item.coin1full} за ${item.amount} ${item.coin2full}`,
          en: `buying ${item.coin1full} for ${item.amount} ${item.coin2full}`,
          de: `kauf ${item.coin1full} für ${item.amount} ${item.coin2full}`,
        };
      }

      if (item.type == 'sell') {
        infoText = {
          ru: `продажа ${item.amount} ${item.coin1full} за ${item.coin2full}`,
          en: `selling ${item.amount} ${item.coin1full} for ${item.coin2full}`,
          de: `verkauf ${item.amount} ${item.coin1full} für ${item.coin2full}`,
        };
      }

      return {
        status: statusText,
        type: type,
        info: infoText,
      };
    });

    const processedLimittOrders = limitOrders.map((item) => {
      const type = {
        ru: 'лимитный ордер',
        en: 'limit order',
        de: 'limit order',
      };

      const statusText = {
        ru: 'в работе',
        en: 'in progress',
        de: 'im gange',
      };

      let infoText = {};

      if (item.type == 'buy') {
        infoText = {
          ru: `покупка ${item.coin1full} по цене ${item.price} ${item.coin2full}`,
          en: `buying ${item.coin1full} per price ${item.price} ${item.coin2full}`,
          de: `kauf ${item.coin1full} pro preis ${item.price} ${item.coin2full}`,
        };
      }

      if (item.type == 'sell') {
        infoText = {
          ru: `продажа ${item.amount} ${item.coin1full} по цене ${item.price} ${item.coin2full}`,
          en: `selling ${item.amount} ${item.coin1full} per price ${item.price} ${item.coin2full}`,
          de: `verkauf ${item.amount} ${item.coin1full} pro preis ${item.price} ${item.coin2full}`,
        };
      }

      return {
        status: statusText,
        type: type,
        info: infoText,
      };
    });

    const total = [...processedMarketOrders, ...processedLimittOrders];

    return res.json({
      statusFn: 'ok',
      count: total.length,
      data: total,
    });
  } catch (error) {
    console.error('Ошибка в endpoint stock/get_myOpenOrders | ', error);
    res.json({ statusBE: 'notOk' });
  }
});

//найти мои выполненные ордера
router.get('/get_myDoneOrders', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      throw new Error('не передан tlgid');
    }

    const userData = await UserModel.findOne({ tlgid: tlgid });
    const lang = userData.language;

    if (!userData) {
      throw new Error('не найден user в UserModel');
    }

    const marketOrders = await RqstStockMarketOrderModel.find({
      status: 'done',
      tlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!marketOrders) {
      throw new Error('не найден объект в RqstStockMarketOrderModel');
    }

    const limitOrders = await RqstStockLimitOrderModel.find({
      status: 'done',
      tlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!limitOrders) {
      throw new Error('не найден объект в RqstStockLimitOrderModel');
    }

    if (
      (!marketOrders && !limitOrders) ||
      (marketOrders.length === 0 && limitOrders.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const processedMarketOrders = marketOrders.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      const type = {
        ru: 'маркет ордер',
        en: 'market order',
        de: 'marktauftrag',
      };

      let infoText = {};

      if (item.type == 'buy') {
        infoText = {
          ru: `покупка ${item.amountSentBackToNp} ${item.coin1full} за ${item.amount} ${item.coin2full}`,
          en: `buying ${item.amountSentBackToNp} ${item.coin1full} for ${item.amount} ${item.coin2full}`,
          de: `kauf ${item.amountSentBackToNp} ${item.coin1full} für ${item.amount} ${item.coin2full}`,
        };
      }

      if (item.type == 'sell') {
        infoText = {
          ru: `продажа ${item.amount} ${item.coin1full} за ${item.amountSentBackToNp} ${item.coin2full}`,
          en: `selling ${item.amount} ${item.coin1full} for ${item.amountSentBackToNp} ${item.coin2full}`,
          de: `verkauf ${item.amount} ${item.coin1full} für ${item.amountSentBackToNp} ${item.coin2full}`,
        };
      }

      return {
        type: type,
        info: infoText,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        forSort: item.updatedAt,
      };
    });

    const processedLimitOrders = limitOrders.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      const type = {
        ru: 'лимитный ордер',
        en: 'limit order',
        de: 'limit order',
      };

      let infoText = {};

      if (item.type == 'buy') {
        infoText = {
          ru: `покупка ${item.amountSentBackToNp} ${item.coin1full} за ${item.amount} ${item.coin2full}`,
          en: `buying ${item.amountSentBackToNp} ${item.coin1full} for ${item.amount} ${item.coin2full}`,
          de: `kauf ${item.amountSentBackToNp} ${item.coin1full} für ${item.amount} ${item.coin2full}`,
        };
      }

      if (item.type == 'sell') {
        infoText = {
          ru: `продажа ${item.amount} ${item.coin1full} за ${item.amountSentBackToNp} ${item.coin2full}`,
          en: `selling ${item.amount} ${item.coin1full} for ${item.amountSentBackToNp} ${item.coin2full}`,
          de: `verkauf ${item.amount} ${item.coin1full} für ${item.amountSentBackToNp} ${item.coin2full}`,
        };
      }

      return {
        type: type,
        info: infoText,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        forSort: item.updatedAt,
      };
    });

    const total = [...processedMarketOrders, ...processedLimitOrders].sort(
      (a, b) => b.forSort - a.forSort
    );

    return res.json({
      statusFn: 'ok',
      count: total.length,
      data: total,
    });
  } catch (error) {
    console.error('Ошибка в endpoint stock/get_myDoneOrders | ', error);
    res.json({ statusBE: 'notOk' });
  }
});



//новая заявка на биржу - marketorder
router.post('/new_stockorder_market', async (req, res) => {
  try {

    const {tlgid, coin1short, coin2short,  coin1full,  coin2full, amount, type, coin1chain, coin2chain, helptext} = req.body


    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      throw new Error('не найден user в UserModel');
    }

    const { ...userData } = user._doc;
    const nowpaymentid = userData.nowpaymentid;
    const language = userData.language;

    //вывод с счета клиента на мастер счет
    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('не получен токен от функции getTokenFromNowPayment ');
    }

    let requestData = {};

    if (type === 'buy') {
      requestData = {
        currency: String(coin2full),
        amount: Number(amount),
        sub_partner_id: String(nowpaymentid),
      };
    }

    if (type === 'sell') {
      requestData = {
        currency: String(coin1full),
        amount: Number(amount),
        sub_partner_id: String(nowpaymentid),
      };
    }

    const response = await makeWriteOff(token, requestData)
    if (!response) {
      throw new Error('функция makeWriteOff не вернула ответ');
    }

    let errorText = '';
    let statusText = 'error';
    let id_clientToMaster = null;

    if (response.data.result.status === 'PROCESSING') {
      id_clientToMaster = response.data.result.id;
      errorText = 'ok';
      statusText = 'new';
    } else {
      errorText = 'ошибка при отправке с счета клиента на мастер счет';
    }

    //записать инфо в БД
    const doc = new RqstStockMarketOrderModel({
      id_clientToMaster: id_clientToMaster,
      id_MasterToStock: null,
      id_OrderOnStock: null,
      status: statusText,
      tlgid: tlgid,
      userNP: nowpaymentid,
      type: type,
      coin1short: coin1short,
      coin1full: coin1full,
      coin1chain: coin1chain,
      coin2short: coin2short,
      coin2full: coin2full,
      coin2chain: coin2chain,
      amount: amount,
      nowpaymentComission: null,
      ourComission: null,
      stockComission: null,
      language: language,
      helptext: helptext,
      errorText: errorText,
      amountSentToStock: null,
      payout_id: null,
      batch_withdrawal_id: null,
      order_id: null,
      trtCoinFromStockToNP_np_id: null,
      trtCoinFromStockToNP_stock_id: null,
      amountAccordingBaseIncrement: null,
      amountSentBackToNp: null,
      amountBeReceivedByStock: null
    });

     if (!doc) {
      throw new Error('не сохранилось в БД RqstStockMarketOrderModel');
    }

    await doc.save();

    return res.json({ statusFn: 'saved' });
  } catch (error) {
    console.error('Ошибка в endpoint stock/new_stockorder_market | ', error);
    res.json({ statusBE: 'notOk' });
  }
});




//новая заявка на биржу - limitOrder
router.post('/new_stockorder_limit', async (req, res) => {
  try {

    const {tlgid, coin1short, coin2short,  coin1full,  coin2full, amount, type, coin1chain, coin2chain, helptext, limitPrice} = req.body

    const user = await UserModel.findOne({ tlgid: tlgid });
     if (!user) {
      throw new Error('не найден user в UserModel');
    }

    const { ...userData } = user._doc;
    const nowpaymentid = userData.nowpaymentid;
    const language = userData.language;

    //вывод с счета клиента на мастер счет
    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('не получен токен от функции getTokenFromNowPayment ');
    }

    let requestData = {};

    if (type === 'buy') {
      requestData = {
        currency: String(coin2full),
        amount: Number(amount),
        sub_partner_id: String(nowpaymentid),
      };
    }

    if (type === 'sell') {
      requestData = {
        currency: String(coin1full),
        amount: Number(amount),
        sub_partner_id: String(nowpaymentid),
      };
    }


    const response = await makeWriteOff(token, requestData)
    if (!response) {
      throw new Error('функция makeWriteOff не вернула ответ');
    }

    let errorText = '';
    let statusText = 'error';
    let id_clientToMaster = null;


    if (response.data.result.status === 'PROCESSING') {
      id_clientToMaster = response.data.result.id;
      errorText = 'ok';
      statusText = 'new';
    } else {
      errorText = 'ошибка при отправке с счета клиента на мастер счет';
    }

    //записать инфо в БД
    const pair = `${coin1short}-${coin2short}`

    const doc = new RqstStockLimitOrderModel({
      id_clientToMaster: id_clientToMaster,
      id_MasterToStock: null,
      id_OrderOnStock: null,
      status: statusText,
      tlgid: tlgid,
      userNP: nowpaymentid,
      type: type,
      pair: pair,  
      coin1short: coin1short,
      coin1full: coin1full,
      coin1chain: coin1chain,
      coin2short: coin2short,
      coin2full: coin2full,
      coin2chain: coin2chain,
      amount: amount,
      price: limitPrice,
      nowpaymentComission: null,
      ourComission: null,
      stockComission: null,
      language: language,
      helptext: helptext,
      errorText: errorText,
      amountSentToStock: null,
      payout_id: null,
      batch_withdrawal_id: null,
      order_id: null,
      trtCoinFromStockToNP_np_id: null,
      trtCoinFromStockToNP_stock_id: null,
      amountAccordingBaseIncrement: null,
      amountSentBackToNp: null,
      amountBeReceivedByStock: null
    });

    if (!doc) {
      throw new Error('не сохранилось в БД RqstStockLimitOrderModel');
    }

    await doc.save();

    return res.json({ statusFn: 'saved' });
  } catch (error) {
    console.error('Ошибка в endpoint stock/new_stockorder_limit | ', error);
    res.json({ statusBE: 'notOk' });
  }
});