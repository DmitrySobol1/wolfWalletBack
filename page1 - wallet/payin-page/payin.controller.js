import { Router } from 'express';

import UserModel from '../../models/user.js';

import {
  getAvailableCoins,
  getTokenFromNowPayment,
  createUserInNowPayment,
  getMinAmountForDeposit,
  createPayAdress,
} from '../../nowPayment/nowPayment.services.js';

const router = Router();

export const payinController = router;

// получение из nowpayments монет, одобренных в ЛК
router.get('/get_available_coins', async (req, res) => {
  try {
    const response = await getAvailableCoins();

    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }

    return res.json(response);
  } catch (err) {
    console.log(err);
    res.json({
      message: 'ошибка сервера',
    });
  }
});

// получение информации, чтобы вернуть адресс и мин сумму пополнения, создать ЛК юзера в NP ?
router.post('/get_info_for_payinadress', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });
    if (!user) {
      return res.json({ statusBE: 'notOk' });
    }
    const { ...userData } = user._doc;

    const token = await getTokenFromNowPayment();
    if (!token) {
      return res.json({ statusBE: 'notOk' });
    }

    if (userData.nowpaymentid === 0) {
      const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);
      if (!nowpaymentid) {
        return res.json({ statusBE: 'notOk' });
      }

      //записать nowpaymentid в БД
      const updatedUser = await UserModel.findOneAndUpdate(
        { tlgid: req.body.tlgid },
        { $set: { nowpaymentid: nowpaymentid } },
        { new: true } // Вернуть обновленную запись
      );
      if (!updatedUser) {
        return res.json({ statusBE: 'notOk' });
      }
      const { ...userData } = updatedUser._doc;
    }

    const minAmount = await getMinAmountForDeposit(req.body.coin);
    if (!minAmount) {
      return res.json({ statusBE: 'notOk' });
    }

    //чтобы исключить колебание мин кол-ва, пока обрабатывается запрос
    const minAmountPlus5Percent = minAmount + minAmount * 0.05;

    const payAdress = await createPayAdress(
      token,
      req.body.coin,
      minAmountPlus5Percent,
      userData.nowpaymentid,
      req.body.tlgid
    );
    if (!payAdress) {
      return res.json({ statusBE: 'notOk' });
    }

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
