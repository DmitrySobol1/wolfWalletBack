import { Router } from 'express';
import axios from 'axios';

import { logger } from '../../middlewares/error-logger.js'

import UserModel from '../../models/user.js';
import ComissionToTransferModel from '../../models/comissionToTransfer.js';
import RqstTransferToOtherUserModel from '../../models/rqstTransferToOtherUser.js';

import {
  getTokenFromNowPayment,
  checkIfUserExist,
  makeTransferResponse,
  makeWriteOff
} from '../../nowPayment/nowPayment.services.js';

import { createRqstTransferToOtherUserModel } from '../../modelsOperations/models.services.js'


const router = Router();

export const transferController = router;

//получить нашу комиссию за трансфер между пользователями
router.get('/get_transfer_fee', async (req, res) => {
  try {
    const { coin, tlgid } = req.query;
    if (!coin || !tlgid) {
      throw new Error('не переданы coin или tlgid');
    }

    let fees = {}

    fees = await ComissionToTransferModel.findOne({
      coin: coin,
    }).lean();
    
    // FIXME:  если нет комиссии, устанавливаем = 0
    if (!fees) {
      fees = {qty: 0}
    }
    
    
    const user = await UserModel.findOne({
      tlgid: tlgid,
    });
    if (!user) {
      throw new Error('не найден в бд');
    }

    const selfNowpaymentid = user.nowpaymentid;

    const response = {
    //   ...fees.toObject(),
      ...fees,
      selfNowpaymentid,
      status: 'ok',
    };

    

    return res.json(response);
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /transfer/get_transfer_fee', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    return res.json({ statusBE: 'notOk' });
  }
});

// проверка существует ли юзер
router.post('/get_user', async (req, res) => {
  try {
    const { adress } = req.body;
    if (!adress) {
      throw new Error('не передан adress');
    }

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('ошибка в функции getTokenFromNowPayment');
    }

    const response = await checkIfUserExist(token, adress);
    if (!response) {
      throw new Error('ошибка в функции checkIfUserExist');
    }

    return res.json({ count: response.data.count });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /transfer/get_usere', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});

//создать запрос на трансфер другому юзеру
router.post('/rqst_to_transfer', async (req, res) => {
  try {
    const { coin, sum, tlgid, adress, ourComission } = req.body;


    if (!coin || !sum || !tlgid || !adress || ourComission==null ) {
      throw new Error('не передан один из параметров');
    }

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      throw new Error('не найден в бд');
    }
    
    console.log('step 1', user);

    const fromUserNP = user._doc.nowpaymentid;

    // найти TLG id юзера, которому переводим
    const toUser = await UserModel.findOne({ nowpaymentid: adress });
    if (!toUser) {
      throw new Error('не найден в бд');
    }

    const toUserTlgid = toUser._doc.tlgid;


    
    console.log('step 1_1', fromUserNP);

    let item_id = '';
    const qtyToTransfer = (Number(sum) - Number(ourComission)).toFixed(6);

    const token = await getTokenFromNowPayment();
    if (!token) {
      throw new Error('нет ответа от getTokenFromNowPayment');
    }

    console.log('step 1_2', token);

    //делаем перевод с счета клиента на мастер счет, это когда комиссия не равна 0
    if (ourComission != 0) {
      const requestData = {
        currency: String(coin),
        amount: Number(ourComission),
        sub_partner_id: String(fromUserNP),
      };

      console.log('step 2.1 | requestData ', requestData)

      const response = await makeWriteOff(token, requestData);

      if (!response?.data?.result?.status) {
        throw new Error('нет ответа от makeWriteOff');
      }


      console.log('step 2', response.data);

      if (response.data.result.status === 'PROCESSING') {
        const transactionId_comission = response.data.result.id;

        const statusComission = 'new';
        const our_comission = ourComission;

        const data = {
          transactionId_comission,
          coin,
          sum,
          fromUserNP,
          adress,
          our_comission,
          tlgid,
          statusComission,
          qtyToTransfer,
          toUserTlgid
        };

        item_id = await createRqstTransferToOtherUserModel(data);
        if (!item_id || item_id == '') {
          throw new Error('нет ответа от createRqstTransferToOtherUserModel');
        }

        console.log('step 4 ifNe0 RQST=', item_id);
      }

      //когда комиссия не равна 0 - перевод на мастер счет не делаем, просто создаем запись в БД
    } else if (ourComission == 0) {
      const transactionId_comission = 0;
      const statusComission = 'finished';
      const our_comission = 0;

      const data = {
        transactionId_comission,
        coin,
        sum,
        fromUserNP,
        adress,
        our_comission,
        tlgid,
        statusComission,
        qtyToTransfer,
        toUserTlgid
      };

      item_id = await createRqstTransferToOtherUserModel(data);
      if (!item_id || item_id == '') {
        throw new Error('нет ответа от createRqstTransferToOtherUserModel');
      }

      console.log('step 4 if0 RQST=', item_id);
    }

    const requestData = {
      currency: String(coin),
      amount: Number(qtyToTransfer),
      from_id: String(fromUserNP),
      to_id: String(adress),
    };

    console.log('step 5 requestData=', requestData);

    const transferResponse = await makeTransferResponse(token, requestData);
    if (!transferResponse?.data?.result?.id) {
      throw new Error('нет ответа от makeTransferResponse');
    }

    const transactionId_transferToUser = transferResponse.data.result.id;
    console.log('step 6 transef', transferResponse.data);

    //поменять инфо в БД
    const updatedItem = await RqstTransferToOtherUserModel.findOneAndUpdate(
      { _id: item_id.item_id },
      {
        $set: {
          transactionId_transferToUser: Number(transactionId_transferToUser),
          statusTransferToUser: 'new',
        },
      }
    );

    console.log('success finished')

    return res.json({ status: 'OK' });
  } catch (err) {
    logger.error({
          title: 'Ошибка в endpoint /transfer/rqst_to_transfer', 
          message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        }); 
    return res.json({ statusBE: 'notOk' });
  }
});
