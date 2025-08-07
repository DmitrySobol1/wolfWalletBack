import { Router } from 'express';
const router = Router();


import UserModel from '../models/user.js';
import ComissionExchangeModel from '../models/comissionToExchange.js';

import {getMinAmountForDeposit, getBalance, getEstimatePricePair, getTokenFromNowPayment, makeWriteOff} from '../nowPayment/nowPayment.services.js'
import {createRqstExchange} from '../modelsOperations/models.services.js'

export const exchangeController = router;



// получить список комиссий за обмен
router.get('/get_comissionExchange', async (req, res) => {
  try {
    const commissions = await ComissionExchangeModel.find().lean();
    if (!commissions || commissions.length == 0 ) {
      throw new Error('не найден в бд');
    }

    res.json({
      status: 'success',
      data: commissions,
    });
  } catch (err) {
    console.error('Error in endpoint /get_comissionExchange', err)
     console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
   return res.json({ statusBE: 'notOk' });
  }
});



router.get('/get_minamount', async (req, res) => {
  try {
    const {coinFrom} = req.query
    if (!coinFrom ) {
        throw new Error('нет параметра coin');
    }

    const minAmount = await getMinAmountForDeposit(coinFrom);

     if (!minAmount ) {
        throw new Error('не ответат от функции getMinAmountForDeposit');
      }


    return res.status(200).json({
      status: 'ok',
      minAmount: minAmount,
    });
  } catch (err) {
    console.error('Ошибка в /api/get_minamount:', err);
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
   return res.json({ statusBE: 'notOk' });
  }
});




// получение баланса юзера в выбранной валюте, для отображения на вкладке обмена
router.get('/get_balance_currentCoin', async (req, res) => {
  try {

    console.log('step 0 - start')

    const { tlgid, coin } = req.query;
     if (!tlgid || !coin ) {
      throw new Error('нет параметра coin или tlgid ');
    }

    console.log('step 1, tlgid=', tlgid, ' coin=', coin)

    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      throw new Error('не найден в бд');
    }

    console.log('step 1', user)

    const nowpaymentid = user._doc.nowpaymentid;

    const responseGetBalance = await getBalance(nowpaymentid)
    if (!getBalance) {
      throw new Error('нет ответа от функции getBalance');
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
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
    return res.json({ statusBE: 'notOk' });
  }
});



router.get('/get_conversion_rate', async (req, res) => {
  try {
    
    const { coinFrom, coinTo } = req.query;
    const amount = Number(req.query.amount);
    if (!coinFrom || !coinTo || !amount ) {
      throw new Error('нет параметров');
    }

    console.log('coinFrom=', coinFrom)
    console.log('coinTo=', coinTo)
    console.log('amount=', amount)

    const response = await getEstimatePricePair(amount,coinFrom,coinTo)
    if (!response) {
       throw new Error('нет ответа от функции getEstimatePricePair');
    }

    const convertedAmount = response.data.estimated_amount;
  
    return res.status(200).json({
      status: 'ok',
      convertedAmount: convertedAmount,
    });
  } catch (err) {
    console.error('Ошибка в /exchange/get_conversion_rate:', err);
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
    return res.json({ statusBE: 'notOk' });
  }
});



//перевод с Юзер счета на Мастер счет для Обмена
router.post('/rqst_fromUser_toMaster', async (req, res) => {
  try {

    const {tlgid, coinFrom, amount, convertedAmount, coinTo, nowpaymentComission, ourComission  } = req.body
    if (!tlgid || !coinFrom || !amount || !convertedAmount || !coinTo ) {
      throw new Error('нет параметров');
    }

    
    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('нет ответа от функции getTokenFromNowPayment');
    }

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      throw new Error('не найден в бд');
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
      throw new Error('не овтета от makeWriteOff');
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
        throw new Error('не овтета от createRqstExchange');
      }
      

      if (createRqst === 'created') {
        return res.json({ status: 'OK' });
      }
    }
  } catch (err) {
    console.error('Ошибка в /exchange/rqst_fromUser_toMaster', err);
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  });
    return res.json({ statusBE: 'notOk' });
  }
});