import { Router } from 'express';

import UserModel from '../../models/user.js';

import {
  getAvailableCoins,
  getTokenFromNowPayment,
  createUserInNowPayment,
  getMinAmountForDeposit,
  createPayAdress,
} from '../../nowPayment/nowPayment.services.js';

import { createNewRqstPayIn } from '../../modelsOperations/models.services.js'

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

    
    
    const { tlgid, coin  }  = req.body

    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.json({ statusBE: 'notOk' });
    }

    

    const { ...userData } = user._doc;

    const token = await getTokenFromNowPayment();
    if (!token) {
      return res.json({ statusBE: 'notOk' });
    }

    if (userData.nowpaymentid === 0) {
      const nowpaymentid = await createUserInNowPayment(token, tlgid);
      if (!nowpaymentid) {
        return res.json({ statusBE: 'notOk' });
      }

      //записать nowpaymentid в БД
      const updatedUser = await UserModel.findOneAndUpdate(
        { tlgid: tlgid },
        { $set: { nowpaymentid: nowpaymentid } },
        { new: true } // Вернуть обновленную запись
      );
      if (!updatedUser) {
        return res.json({ statusBE: 'notOk' });
      }
      const { ...userData } = updatedUser._doc;
    }

    const minAmount = await getMinAmountForDeposit(coin);
    if (!minAmount) {
      return res.json({ statusBE: 'notOk' });
    }

    
    //чтобы исключить колебание мин кол-ва, пока обрабатывается запрос
    const minAmountPlus5Percent = minAmount + minAmount * 0.05;

    const payAdressObj = await createPayAdress(
      token,
      coin,
      minAmountPlus5Percent,
      userData.nowpaymentid,
      // tlgid
    );
    if (!payAdressObj) {
      return res.json({ statusBE: 'notOk' });
    }

    const actualPayAdress = payAdressObj.pay_address


    const modelResp = await createNewRqstPayIn(payAdressObj, tlgid, userData.nowpaymentid);

    if (!modelResp) {
      return res.json({ statusBE: 'notOk' });
    }
    
    const objToFront = {
      minAmount,
      payAdress: actualPayAdress,
    };
    

    return res.json(objToFront);
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});
