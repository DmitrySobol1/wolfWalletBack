import { Router } from 'express';
const router = Router();


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

import {getMinAmountForDeposit, getBalance, getEstimatePricePair, getTokenFromNowPayment, makeWriteOff} from '../nowPayment/nowPayment.services.js'
import {createRqstExchange} from '../modelsOperations/models.services.js'

export const exchangeController = router;



// получить список комиссий за обмен
router.get('/get_comissionExchange', async (req, res) => {
  try {
    const commissions = await ComissionExchangeModel.find().lean();
    if (!commissions || commissions.length == 0 ) {
      return res.json({ statusBE: 'notOk' });
    }

    res.json({
      status: 'success',
      data: commissions,
    });
  } catch (error) {
    console.error('Error in endpoint /get_comissionExchange')
    res.json({ statusBE: 'notOk' });
  }
});



router.get('/get_minamount', async (req, res) => {
  try {
    const {coinFrom} = req.query
    if (!coinFrom ) {
        return res.json({ statusBE: 'notOk' });
    }

    const minAmount = await getMinAmountForDeposit(coinFrom);

    return res.status(200).json({
      status: 'ok',
      minAmount: minAmount,
    });
  } catch (err) {
    console.error('Ошибка в /api/get_minamount:', err);
    res.json({ statusBE: 'notOk' });
  }
});




// получение баланса юзера в выбранной валюте, для отображения на вкладке обмена
router.get('/get_balance_currentCoin', async (req, res) => {
  try {

    console.log('step 0 - start')

    const { tlgid, coin } = req.query;
     if (!tlgid || !coin ) {
      return res.json({ statusBE: 'notOk' });
    }

    console.log('step 1, tlgid=', tlgid, ' coin=', coin)

    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.json({ statusBE: 'notOk' });
    }

    console.log('step 1', user)

    const nowpaymentid = user._doc.nowpaymentid;

    const responseGetBalance = await getBalance(nowpaymentid)
    if (!getBalance) {
      return res.json({ statusBE: 'notOk' });
    }

    const userBalance = responseGetBalance.data.result.balances;

    const arrayOfUserBalance = Object.entries(userBalance).map(
        ([key, value]) => ({
          currency: key, // кладем ключ внутрь объекта
          ...value, // распаковываем остальные свойства
        })
      );

    console.log('2 | userBalance', arrayOfUserBalance);

    let temp = false

    arrayOfUserBalance.map((item) => {
        const epsilon = 1e-20;
        
        if (item.currency === coin && Math.abs(item.amount - 2e-18) > epsilon) {
            temp = true
            return res.json({
            coin: coin,
            balance: item.amount,
          });
          
        }
      });

      // если не найдено
      if (!temp){

          return res.json({
            coin: coin,
            balance: 0,
          });
      }

  } catch (err) {
    console.error('Ошибка в /get_balance_currentCoin', err);
    res.json({ statusBE: 'notOk' });
  }
});



router.get('/get_conversion_rate', async (req, res) => {
  try {
    
    const { coinFrom, coinTo } = req.query;
    const amount = Number(req.query.amount);
    if (!coinFrom || !coinTo || !amount ) {
      return res.json({ statusBE: 'notOk' });
    }

    console.log('coinFrom=', coinFrom)
    console.log('coinTo=', coinTo)
    console.log('amount=', amount)

    const response = await getEstimatePricePair(amount,coinFrom,coinTo)
    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }

    const convertedAmount = response.data.estimated_amount;
  
    return res.status(200).json({
      status: 'ok',
      convertedAmount: convertedAmount,
    });
  } catch (err) {
    console.error('Ошибка в /exchange/get_conversion_rate:', err);
    res.json({ statusBE: 'notOk' });
  }
});



//перевод с Юзер счета на Мастер счет для Обмена
router.post('/rqst_fromUser_toMaster', async (req, res) => {
  try {

    const {tlgid, coinFrom, amount, convertedAmount, coinTo, nowpaymentComission, ourComission  } = req.body
    if (!tlgid || !coinFrom || !amount || !convertedAmount || !coinTo ) {
      return res.json({ statusBE: 'notOk' });
    }

    
    const token = await getTokenFromNowPayment();
    if (!token) {
      return res.json({ statusBE: 'notOk' });
    }

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.json({ statusBE: 'notOk' });
    }

    const nowpaymentid = user._doc.nowpaymentid;
    const language = user._doc.language;

    const requestData = {
      currency: String(coinFrom),
      amount: Number(amount),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await makeWriteOff(token, requestData)
    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }


    if (response.data.result.status === 'PROCESSING') {
      const id_clientToMaster = response.data.result.id;

      const data = {
        id_clientToMaster,
        tlgid,
        nowpaymentid,
        amount,
        coinFrom,
        convertedAmount,
        coinTo,
        nowpaymentComission,
        ourComission,
        language
      }  

      const createRqst = await createRqstExchange(data)  

      if (!createRqst) {
        return res.json({ statusBE: 'notOk' });
      }
      

      if (createRqst === 'created') {
        return res.json({ status: 'OK' });
      }
    }
  } catch (error) {
    console.error('Error in /exchange/rqst_fromUser_toMaster', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    res.json({ statusBE: 'notOk' });
  }
});