import UserModel from '../models/user.js';
import RqstTrtFromUserToMainModel from '../models/rqstTrtFromUserToMain.js';
import VerifiedPayoutsModel from '../models/verifiedPayouts.js';
import RqstPayInModel from '../models/rqstPayIn.js';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from '../models/rqstExchange.js';
import ComissionStockMarketModel from '../models/comissionStockMarket.js';

import { logger } from '../middlewares/error-logger.js'

export async function createNewUser(tlgid) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
      isOnboarded: false,
      isMemberEdChannel: null,
      jb_email: null,
      isLevelTested: false,
      level: null,
      nowpaymentid: 0,
      valute: 'eur',
      language: 'en',
    });

    const user = await doc.save();

    if (!user) {
      throw new Error('ошибка при создании пользователя в бд UserModel');
    }

    return { status: 'created' };
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции models.services.js > createNewUser',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

export async function createNewRqstPayIn(params, tlgid, nowpaymentid) {
  try {
    const doc = new RqstPayInModel({
      payment_id: params.payment_id,
      payment_status: params.payment_status,
      pay_amount: params.pay_amount,
      price_currency: params.price_currency,
      userIdAtNP: nowpaymentid,
      amount_received: params.amount_received,
      tlgid: tlgid,
    });

    const rqst = await doc.save();
    return rqst;
  } catch (err) {
     logger.error({
        fn_title:  'Ошибка в функции createNewRqstPayIn',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
  }
}

export async function createRqstTrtFromuserToMain(data) {
  try {
    if (!data) {
      return;
    }

    const {
      transactionId,
      coin,
      sum,
      nowpaymentid,
      adress,
      networkFees,
      ourComission,
      qtyToSend,
      qtyForApiRqst,
    } = data;

    const rqst = new RqstTrtFromUserToMainModel({
      transactionId,
      coin,
      sum,
      status: 'new',
      fromUserNP: nowpaymentid,
      adress,
      networkFees,
      ourComission,
      qtyToSend,
      qtyForApiRqst,
    });

    if (!rqst) {
      return;
    }

    await rqst.save();
    return 'created';
  } catch (err) {
     logger.error({
        fn_title:  'Ошибка в функции RqstTrtFromUserToMainModel',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
  }
}

export async function createRqstTransferToOtherUserModel(data) {
  try {
    if (!data) {
      return;
    }

    const {
      transactionId_comission,
      coin,
      sum,
      fromUserNP,
      adress,
      our_comission,
      tlgid,
      statusComission,
      qtyToTransfer,
    } = data;

    const rqst = new RqstTransferToOtherUserModel({
      transactionId_comission,
      coin,
      totalSum: sum,
      fromUserNP,
      toUserNP: adress,
      ourComission: our_comission,
      fromUserTlgid: tlgid,
      statusComission,
      statusAll: 'new',
      transactionId_transferToUser: 0,
      statusTransferToUser: '0',
      qtyToTransfer,
    });

    const item = await rqst.save();

    console.log('step 3 ITEM=', item._id);
    return { item_id: item._id.toString() };
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции RqstTransferToOtherUserModel',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
  }
}

export async function createRqstExchange(data) {
  try {
    const {
      id_clientToMaster,
      tlgid,
      nowpaymentid,
      amount,
      coinFrom,
      convertedAmount,
      coinTo,
      nowpaymentComission,
      ourComission,
      language,
    } = data;

    const rqst = new RqstExchangeSchemaModel({
      id_clientToMaster,
      id_exchange: 0,
      id_masterToClient: 0,
      status: 'new',
      tlgid,
      userNP: nowpaymentid,
      amountFrom: amount,
      coinFrom,
      amountTo: convertedAmount,
      coinTo,
      nowpaymentComission,
      ourComission: ourComission,
      language,
    });

    if (!rqst) {
      return;
    }

    await rqst.save();
    return 'created';
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции createRqstExchange',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

// создать новый объект в verified payouts
export async function createVerifiedPayout(data) {
  try {
    const {
      payout_id,
      batch_withdrawal_id,
      coin,
      sum,
      status,
      userIdAtNP,
      adress,
      networkFees,
      ourComission,
      qtyToSend,
      qtyForApiRqst,
    } = data;

    const rqst = new VerifiedPayoutsModel({
      payout_id,
      batch_withdrawal_id,
      coin,
      sum,
      status,
      userIdAtNP,
      adress,
      networkFees,
      ourComission,
      qtyToSend,
      qtyForApiRqst,
      isSentMsg: false,
    });

    if (!rqst) {
      throw new Error('не сохранилось значение в БД VerifiedPayoutsModel ');
    }

    const user = await rqst.save();
    return { status: 'created' };
  } catch (err) {
    
    logger.error({
        fn_title:  'Ошибка в функции models.services.js > createVerifiedPayout',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

export async function getOurComissionMarket() {
  try {
    const response = await ComissionStockMarketModel.findOne({
      coin: 'ourComission',
    });

    if (!response) {
      throw new Error('не получен ответ в БД ComissionStockMarketModel ');
    }

    const ourComission = response.qty;

    return { ourComission: ourComission };
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции models.services.js > getOurComissionMarket',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}

// получить нашу комиссию за сделку - Лимит
export async function getOurComissionLimit() {
  try {
    const response = await ComissionStockMarketModel.findOne({
      coin: 'ourComission',
    });

    if (!response) {
      throw new Error('не получен ответ в БД ComissionStockMarketModel ');
    }

    const ourComission = response.qty;

    return { ourComission: ourComission };
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции models.services.js > getOurComissionLimit',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}
