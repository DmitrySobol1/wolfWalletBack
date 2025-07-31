import { Router } from 'express';
import axios from 'axios';

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
      return res.json({ statusBE: 'notOk' });
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
      return res.json({ statusBE: 'notOk' });
    }

    const selfNowpaymentid = user.nowpaymentid;

    const response = {
    //   ...fees.toObject(),
      ...fees,
      selfNowpaymentid,
      status: 'ok',
    };

    

    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'ошибка сервера',
    });
  }
});

// проверка существует ли юзер
router.post('/get_user', async (req, res) => {
  try {
    const { adress } = req.body;
    if (!adress) {
      return res.json({ statusBE: 'notOk' });
    }

    const token = await getTokenFromNowPayment();
    if (!token) {
      return res.json({ statusBE: 'notOk' });
    }

    const response = await checkIfUserExist(token, adress);
    if (!response) {
      return res.json({ statusBE: 'notOk' });
    }

    return res.json({ count: response.data.count });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: 'ошибка сервера',
    });
  }
});

//создать запрос на трансфер другому юзеру
router.post('/rqst_to_transfer', async (req, res) => {
  try {
    const { coin, sum, tlgid, adress, ourComission } = req.body;


    if (!coin || !sum || !tlgid || !adress || ourComission==null ) {
      return res.json({ statusBE: 'notOk' });
    }

    // найти nowPayment id по тлг id
    const user = await UserModel.findOne({ tlgid: tlgid });
    if (!user) {
      return res.json({ statusBE: 'notOk' });
    }

    console.log('step 1', user);

    const fromUserNP = user._doc.nowpaymentid;
    
    console.log('step 1_1', fromUserNP);

    let item_id = '';
    const qtyToTransfer = (Number(sum) - Number(ourComission)).toFixed(6);

    const token = await getTokenFromNowPayment();
    if (!token) {
      return res.json({ statusBE: 'notOk' });
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
        return res.json({ statusBE: 'notOk' });
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
        };

        item_id = await createRqstTransferToOtherUserModel(data);
        if (!item_id || item_id == '') {
          return res.json({ statusBE: 'notOk' });
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
      };

      item_id = await createRqstTransferToOtherUserModel(data);
      if (!item_id || item_id == '') {
        return res.json({ statusBE: 'notOk' });
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
      return res.json({ statusBE: 'notOk' });
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
  } catch {}
});
