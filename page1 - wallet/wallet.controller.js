import e, { Router } from 'express';

import { logger } from '../middlewares/error-logger.js';

import UserModel from '../models/user.js';
import VerifiedPayoutsModel from '../models/verifiedPayouts.js';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from '../models/rqstExchange.js';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';

import {
  getCryptoPrices,
  getUserBalance,
  getArrayOfUserBalanceWithUsdPrice,
  getSymbolAndKoef,
  findDataInAllModels,
} from './wallet.services.js';

const router = Router();

router.get('/test', async (req, res) => {
  try {

    const {par} = req.query

    if(!par){
      throw new Error('нет параметра par')
    }

    return res.json({ status: 'hello man 88' });
  } catch (err) {
    // logger.error('some error info')
    logger.error({
          title: 'Ошибка в test', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
        
    return res.status(400).json({ statusBE: 'notOk' });
  }
});




// получение баланса+языка+валюты юзера, + tab "мои активы"  + для вывода в "пополнить"
router.get('/get_balance_for_pay_out', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;

    if (!tlgid) {
      throw new Error('нет параметра tlgid');
    }

    const user = await UserModel.findOne({ tlgid: tlgid });

    if (!user) {
      throw new Error('юзер не найден в бд');
    }

    const { language, valute, nowpaymentid } = user;

    if (nowpaymentid === 0) {
      const responseSymbol = await getSymbolAndKoef(valute);

      if (!responseSymbol) {
        throw new Error('нет ответа от функции getSymbolAndKoef');
      }

      const { symbol } = responseSymbol;

      const dataForFront = {
        balance: 0,
        language: language,
        valute: valute,
        symbol: symbol,
        arrayOfUserBalanceWithUsdPrice: [],
      };

      return res.json({ dataForFront });
    } else {
      const cryptoPrices = await getCryptoPrices();
      if (!cryptoPrices) {
        throw new Error('нет ответа от функции getCryptoPrices');
      }

      const userBalance = await getUserBalance(nowpaymentid);
      if (!userBalance) {
        throw new Error('нет ответа от функции getUserBalance');
      }

      const responseSymbol = await getSymbolAndKoef(valute);
      if (!responseSymbol) {
        throw new Error('нет ответа от функции getSymbolAndKoef');
      }
      const { fiatKoefficient, symbol } = responseSymbol;

      const arrayOfUserBalanceWithUsdPrice =
        await getArrayOfUserBalanceWithUsdPrice(
          userBalance,
          fiatKoefficient,
          cryptoPrices,
          symbol
        );
      if (!arrayOfUserBalanceWithUsdPrice) {
        throw new Error(
          'нет ответа от функции getArrayOfUserBalanceWithUsdPrice'
        );
      }

      // TODO: проверить верность подсчета коэффициента

      // FIXME: проверить логику, если nowpaymentid = 0, иначе будет ошибка, см код на фронте
      const balance = arrayOfUserBalanceWithUsdPrice.reduce((sum, item) => {
        const value = parseFloat(item.priceAllCoinInUserFiat);
        return !isNaN(value) ? sum + value : sum;
      }, 0);

      const dataForFront = {
        balance: balance.toFixed(2),
        language: language,
        valute: valute,
        symbol: symbol,
        arrayOfUserBalanceWithUsdPrice,
      };

      return res.json({ dataForFront });
    }
  } catch (err) {
    logger.error({
          title: 'endpoint wallet/get_balance_for_pay_out', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});

//tab "мои пополнения"
router.get('/get_my_payin', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;

    if (!tlgid) {
      throw new Error('не передан tlgid');
    }


    const transfers = await RqstTransferToOtherUserModel.find({
      statusAll: 'finished',
      toUserTlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();


    const dataForFinding = {
      tlgid: tlgid,
      models: [
        {
          name: 'payins',
          modelName: 'RqstPayInModel',
          statusValue: 'payment_status',
          statusKey: 'finished',
        },
        // {
        //   name: 'transfers',
        //   modelName: 'RqstTransferToOtherUserModel',
        //   statusValue: 'statusAll',
        //   statusKey: 'finished',
        // },
        {
          name: 'exchange',
          modelName: 'RqstExchangeSchemaModel',
          statusValue: 'status',
          statusKey: 'done',
        },
        {
          name: 'stockOperations',
          modelName: 'RqstStockMarketOrderModel',
          statusValue: 'status',
          statusKey: 'done',
        },
        {
          name: 'stockOperationsLimit',
          modelName: 'RqstStockLimitOrderModel',
          statusValue: 'status',
          statusKey: 'done',
        },
      ],
    };

    const {
      payins,
      // transfers,
      exchange,
      stockOperations,
      stockOperationsLimit,
    } = await findDataInAllModels(dataForFinding);

    if (
      (!payins &&
        !transfers &&
        !exchange &&
        !stockOperations &&
        !stockOperationsLimit) ||
      (payins.length === 0 &&
        transfers.length === 0 &&
        exchange.length === 0 &&
        stockOperations.length === 0 &&
        stockOperationsLimit.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const processedPayins = payins.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.price_currency,
        qty: item.amount_received,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'payin',
        forSort: item.updatedAt,
      };
    });

    const processedTransfers = transfers.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coin,
        qty: item.qtyToTransfer,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'transfer',
        forSort: item.updatedAt,
      };
    });

    const processedExchanges = exchange.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coinTo,
        qty: item.amountTo,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'exchange',
        forSort: item.updatedAt,
      };
    });

    const processedStockOperations = stockOperations.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.type == 'buy' ? item.coin1full : item.coin2full,
        qty: item.amountSentBackToNp,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'stockMarket',
        forSort: item.updatedAt,
      };
    });

    const processedStockOperationsLimit = stockOperationsLimit.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.type == 'buy' ? item.coin1full : item.coin2full,
        qty: item.amountSentBackToNp,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'stockLimit',
        forSort: item.updatedAt,
      };
    });

    const total = [
      ...processedPayins,
      ...processedTransfers,
      ...processedExchanges,
      ...processedStockOperations,
      ...processedStockOperationsLimit,
    ].sort((a, b) => b.forSort - a.forSort);

    return res.status(200).json({
      status: 'ok',
      count: total.length,
      data: total,
    });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /wallet/get_my_payin', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});

//tab "мои выводы"
router.get('/get_my_payout', async (req, res) => {
  try {
    const tlgid = req.query.tlgid;

    if (!tlgid) {
      throw new Error('не передан tlgid');
    }

    const user = await UserModel.findOne({ tlgid: tlgid });

    if (!user) {
      throw new Error('не найден юзер в бд');
    }

    const { ...userData } = user._doc;
    const nowpaymentid = userData.nowpaymentid;

    const payouts = await VerifiedPayoutsModel.find({
      status: 'finished',
      userIdAtNP: nowpaymentid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const transfers = await RqstTransferToOtherUserModel.find({
      statusAll: 'finished',
      fromUserTlgid: tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const exchange = await RqstExchangeSchemaModel.find({
      status: 'done',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const stockOperations = await RqstStockMarketOrderModel.find({
      status: 'done',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    const stockOperationsLimit = await RqstStockLimitOrderModel.find({
      status: 'done',
      tlgid: req.query.tlgid,
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (
      (!payouts &&
        !transfers &&
        !exchange &&
        !stockOperations &&
        !stockOperationsLimit) ||
      (payouts.length === 0 &&
        transfers.length === 0 &&
        exchange.length === 0 &&
        stockOperations.length === 0 &&
        stockOperationsLimit.length === 0)
    ) {
      return res.status(200).json({ status: 'no' });
    }

    const processedPayouts = payouts.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coin,
        qty: item.qtyToSend,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'payout',
        forSort: item.updatedAt,
      };
    });

    const processedTransfers = transfers.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coin,
        qty: item.qtyToTransfer,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'transfer',
        forSort: item.updatedAt,
      };
    });

    const processedExchanges = exchange.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.coinFrom,
        qty: item.amountFrom,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'exchange',
        forSort: item.updatedAt,
      };
    });

    const processedStockOperations = stockOperations.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.type == 'buy' ? item.coin2full : item.coin1full,
        qty: item.amount,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'stockMarket',
        forSort: item.updatedAt,
      };
    });

    const processedStockOperationsLimit = stockOperationsLimit.map((item) => {
      const date = new Date(item.updatedAt);
      const day = date.getDate().toString().padStart(2, '0'); // добавляем 0 перед днем
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяц в диапазоне от 1 до 12
      const year = date.getFullYear().toString().slice(-2); // получаем последние 2 цифры года
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return {
        coin: item.type == 'buy' ? item.coin2full : item.coin1full,
        qty: item.amount,
        formattedDate: `${day}.${month}.${year} ${hours}:${minutes}`,
        type: 'stockLimit',
        forSort: item.updatedAt,
      };
    });

    const total = [
      ...processedPayouts,
      ...processedTransfers,
      ...processedExchanges,
      ...processedStockOperations,
      ...processedStockOperationsLimit,
    ].sort((a, b) => b.forSort - a.forSort);

    // console.log('total', total);

    return res.status(200).json({
      status: 'ok',
      count: total.length,
      data: total,
    });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /wallet/get_my_payout', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });  
    return res.json({ statusBE: 'notOk' });
  }
});

export const walletController = router;
