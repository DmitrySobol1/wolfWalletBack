import { Router } from 'express';

import UserModel from '../models/user.js';

import { createNewUser } from '../modelsOperations/models.services.js';

import { logger } from '../middlewares/error-logger.js'

import { getTokenFromNowPayment, createUserInNowPayment } from '../nowPayment/nowPayment.services.js'

const router = Router();

export const systemController = router;

// вход пользователя в аппку
router.post('/enter', async (req, res) => {
  try {
    const { tlgid } = req.body;

    const user = await UserModel.findOne({ tlgid: tlgid });

    //создание юзера
    if (!user) {
      const createresponse = await createNewUser(tlgid);

      if (!createresponse) {
        throw new Error('ошибка в функции createNewUser');
      }

      if (createresponse.status == 'created') {
        const userData = {};
        userData.result = 'showOnboarding';
        return res.json({ userData });
      }
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showWalletPage';
    return res.json({ userData });
  } catch (err) {
    logger.error({
          title: 'Error in endpoint /system/enter', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});

// смена валюты в БД
router.post('/change_valute', async (req, res) => {
  try {
    const resp = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { valute: req.body.valute } }
    );

    if (!resp) {
      throw new Error('не записалось в бд UserModel ');
    }

    return res.json({ status: 'changed' });
  } catch (err) {
    logger.error({
          title: 'Error in endpoint /system/change_valute', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return
  }
});

// смена языка в БД
router.post('/change_language', async (req, res) => {
  try {
    const resp = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { language: req.body.language } }
    );

    if (!resp) {
      throw new Error('не записалось в бд UserModel ');
    }

    return res.json({ status: 'changed' });
  } catch (err) {
    logger.error({
          title: 'Error in endpoint /system/change_language', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
  return
  }
});





// получение инфо о nowpayment id 
router.post('/get_user_id', async (req, res) => {
  try {
    const user = await UserModel.findOne({ tlgid: req.body.tlgid });

    if (!user) {
      throw new Error('не найден юзер в бд UserModel ');
    }

    const { ...userData } = user._doc;

    const nowpaymentid = userData.nowpaymentid;

    console.log(userData);


    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    logger.error({
          title: 'Error in endpoint /system/get_user_id', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});




// создать id в nowpayment
router.post('/create_user_NpId', async (req, res) => {
  try {

    const token = await getTokenFromNowPayment();

    if (!token) {
      throw new Error('не пришел ответ от функции getTokenFromNowPayment');
    }

    const nowpaymentid = await createUserInNowPayment(token, req.body.tlgid);

    if (!nowpaymentid) {
      throw new Error('не пришел ответ от функции createUserInNowPayment');
    }

    console.log('info from NP', nowpaymentid )

    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: req.body.tlgid },
      { $set: { nowpaymentid: nowpaymentid } },
      { new: true } // Вернуть обновленную запись
    );

    if (!updatedUser) {
      throw new Error('не сохранилось инфо в бд UserModel');
    }


    return res.json({ nowpaymentid: nowpaymentid });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint system/create_user_NpId', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});