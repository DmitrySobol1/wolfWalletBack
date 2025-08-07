import { Router } from 'express';
import axios from 'axios';

import UserModel from '../../models/user.js';

import { logger } from '../../middlewares/error-logger.js'

import {
  getMinAmountToWithdraw,
  getPayoutFee,
  validateAdress,
  getTokenFromNowPayment,
  makeWriteOff
} from '../../nowPayment/nowPayment.services.js';


import { createRqstTrtFromuserToMain } from '../../modelsOperations/models.services.js'

import ComissionToPayoutModel from '../../models/comissionToPayout.js';

const router = Router();

export const payoutController = router;

//получить мин сумму для вывода и нашу комиссию
router.get('/get_info_for_payout', async (req, res) => {
  try {
    const response = await getMinAmountToWithdraw(req.query.coin);

    if (!response) {
      throw new Error('нет ответа от фунции getMinAmountToWithdraw');
    }

    let status = false;
    let minSumToWithdraw = 'not available';

    if (response.data && response.data.success === true) {
      minSumToWithdraw = response.data.result;
    }

    let ourComission = 'not available';

    const comission = await ComissionToPayoutModel.findOne({
      coin: req.query.coin,
    });


    if (comission) {
      ourComission = Number(comission.qty);
    }

    if (
      minSumToWithdraw !== 'not available' &&
      ourComission !== 'not available'
    ) {
      status = true;
    }

    return res.json({
      minSumToWithdraw,
      ourComission,
      status,
      coin: req.query.coin,
    });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /payout/get_info_for_payout', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});

//получить комиссию сети за вывод монеты
router.get('/get_withdrawal_fee', async (req, res) => {
  try {

    const {coin, amount} = req.query

    const response = await getPayoutFee(coin, amount);

    if (!response) {
      throw new Error('нет ответа от фунции getPayoutFee');
    }

    return res.json({ networkFees:response.data.fee });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /payout/get_withdrawal_fee', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    return res.json({ statusBE: 'notOk' });
  }
});




// проверка валидности адреса кошелька
router.post('/validate_adress', async (req, res) => {
  try {
    const validateResult = await validateAdress(req.body.adress, req.body.coin);

     if (!validateResult) {
      throw new Error('нет ответа от функции validateAdress');
    }


    if (validateResult === 'OK') {
      return res.json(validateResult);
    } else {
      throw new Error('не верный ответ от функции validateAdress');
    }
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /payout/validate_adress', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    return res.json({ statusBE: 'notOk' });
  }
});



//создать запрос на вывод монет (перевод с юзер счета на мастер счет)
router.post('/rqst_to_payout', async (req, res) => {
  try {

    const {tlgid, coin,sum} = req.body

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

    const requestData = {
      currency: String(coin),
      amount: Number(sum),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await makeWriteOff(token,requestData)
    if (!response?.data?.result?.status) {
      throw new Error('нет ответа от функции makeWriteOff');
    }


    if (response.data.result.status === 'PROCESSING') {

      const transactionId = response.data.result.id;
      const {coin,sum,adress,networkFees,ourComission,qtyToSend,qtyForApiRqst} = req.body

      const data = {
        transactionId,
        coin,
        sum,
        nowpaymentid,
        adress,
        networkFees,
        ourComission,
        qtyToSend,
        qtyForApiRqst
      }

      const createRqst = await createRqstTrtFromuserToMain(data);

      if (!createRqst) {
      throw new Error('нет ответа от функции createRqstTrtFromuserToMain');
    }

      if (createRqst === 'created') {
        return res.json({ status: 'OK' });
      }
    }
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /payout/rqst_to_payout', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    return res.json({ statusBE: 'notOk' });
  }

});



