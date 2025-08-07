import { Router } from 'express';

import UserModel from '../../models/user.js';

import {
  getAvailableCoins,
  getTokenFromNowPayment,
  createUserInNowPayment,
  getMinAmountForDeposit,
  createPayAdress,
} from '../../nowPayment/nowPayment.services.js';

import { createNewRqstPayIn } from '../../modelsOperations/models.services.js';

const router = Router();

export const payinController = router;

// получение из nowpayments монет, одобренных в ЛК
router.get('/get_available_coins', async (req, res) => {
  try {
    const response = await getAvailableCoins();

    if (!response) {
      throw new Error('нет ответа от фунции getAvailableCoins');
    }

    return res.json(response);
  } catch (err) {
    console.error('Ошибка в endpoint /payin/get_my_payout |', err);
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  }); 
    return res.json({ statusBE: 'notOk' });
  }
});

// получение информации, чтобы вернуть адресс и мин сумму пополнения, создать ЛК юзера в NP ?
router.post('/get_info_for_payinadress', async (req, res) => {
  try {
    const { tlgid, coin } = req.body;

    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      throw new Error('не найден юзер в бд');
    }

    const { ...userData } = user._doc;

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('нет ответа от фунции getTokenFromNowPayment');
    }

    if (userData.nowpaymentid === 0) {
      const nowpaymentid = await createUserInNowPayment(token, tlgid);
      if (!nowpaymentid) {
        throw new Error('нет ответа от фунции createUserInNowPayment');
      }

      //записать nowpaymentid в БД
      const updatedUser = await UserModel.findOneAndUpdate(
        { tlgid: tlgid },
        { $set: { nowpaymentid: nowpaymentid } },
        { new: true } // Вернуть обновленную запись
      );
      if (!updatedUser) {
        throw new Error('не найден в бд');
      }
      const { ...userData } = updatedUser._doc;
    }

    const minAmount = await getMinAmountForDeposit(coin);
    if (!minAmount) {
      throw new Error('нет ответа от фунции getMinAmountForDeposit');
    }

    //чтобы исключить колебание мин кол-ва, пока обрабатывается запрос
    const minAmountPlus5Percent = minAmount + minAmount * 0.05;

    const payAdressObj = await createPayAdress(
      token,
      coin,
      minAmountPlus5Percent,
      userData.nowpaymentid,
      'payin'
    );
    if (!payAdressObj) {
      throw new Error('нет ответа от фунции createPayAdress');
    }

    const actualPayAdress = payAdressObj.pay_address;

    const modelResp = await createNewRqstPayIn(
      payAdressObj,
      tlgid,
      userData.nowpaymentid
    );

    if (!modelResp) {
      throw new Error('нет ответа от фунции createNewRqstPayIn');
    }

    const objToFront = {
      minAmount,
      payAdress: actualPayAdress,
    };

    return res.json(objToFront);
  } catch (err) {
    console.error('Ошибка в endpoint /payin/get_info_for_payinadress |', err);
    console.error({
    dataFromServer: err.response?.data,
    statusFromServer: err.response?.status
  }); 
    return res.json({ statusBE: 'notOk' });
  }
});
