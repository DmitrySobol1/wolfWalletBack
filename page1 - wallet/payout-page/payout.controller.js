import { Router } from 'express';
import axios from 'axios';

import UserModel from '../../models/user.js';

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
      return res.json({ statusBE: 'notOk' });
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
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//получить комиссию сети за вывод монеты
router.get('/get_withdrawal_fee', async (req, res) => {
  try {
    const response = await getPayoutFee(req.query.coin, req.query.amount);

    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }

    return res.json({ networkFees:response.data.fee });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});




// проверка валидности адреса кошелька
router.post('/validate_adress', async (req, res) => {
  try {
    const validateResult = await validateAdress(req.body.adress, req.body.coin);

     if (!validateResult) {
      return res.json({ statusBE: 'notOk' });
    }


    if (validateResult === 'OK') {
      return res.json(validateResult);
    } else {
      return res.json({ statusBE: 'notOk' });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});



//создать запрос на вывод монет (перевод с юзер счета на мастер счет)
router.post('/rqst_to_payout', async (req, res) => {
  try {

    const {tlgid, coin,sum} = req.body

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

    const requestData = {
      currency: String(coin),
      amount: Number(sum),
      sub_partner_id: String(nowpaymentid),
    };

    const response = await makeWriteOff(token,requestData)
    if (!response?.data?.result?.status) {
      return res.json({ statusBE: 'notOk' });
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
      return res.json({ statusBE: 'notOk' });
    }

      if (createRqst === 'created') {
        return res.json({ status: 'OK' });
      }
    }
  } catch (error) {
    console.error('Error in endpoint /rqst_to_payout', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error(`Error adress: ${error.message}`);
  }
});