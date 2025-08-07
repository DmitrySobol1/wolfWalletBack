import axios from 'axios';

import { logger } from '../middlewares/error-logger.js'


export async function getAvailableCoins() {
  const response = await axios.get(
    'https://api.nowpayments.io/v1/merchant/coins',
    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );

  return response.data;
}

export async function getTokenFromNowPayment() {
  const response = await axios.post(
    'https://api.nowpayments.io/v1/auth',
    {
      email: process.env.NOWPAYMENTSEMAIL,
      password: process.env.NOWPAYMENTSPASSWD,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.token;
}

export async function createUserInNowPayment(token, tlgid) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!tlgid || (typeof tlgid !== 'string' && typeof tlgid !== 'number')) {
      throw new Error('Invalid tlgid format');
    }

    // 2. Формирование тела запроса (уточните правильную структуру в API-документации)
    const requestData = {
      name: String(tlgid),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/balance',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.id) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    return response.data.result.id;
  } catch (err) {
    

  logger.error({
    fn_title:  'Error in createUserInNowPayment',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
    return
  }
}

export async function getMinAmountForDeposit(coin) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/min-amount?currency_from=${coin}&fiat_equivalent=usd&is_fixed_rate=false&is_fee_paid_by_user=false`,
    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );
  // console.log('MIN=',response.data)
  return response.data.min_amount;
}

export async function createPayAdress(
  token,
  coin,
  minAmount,
  nowpaymentid,
  type
) {
  try {
    // 1. Валидация входных параметров
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid or missing authentication token');
    }

    if (!coin || typeof coin !== 'string') {
      throw new Error('Invalid coin format');
    }

    if (!minAmount || (typeof coin !== 'number' && typeof coin !== 'string')) {
      throw new Error('Invalid minAmount format');
    }

    if (
      !nowpaymentid ||
      (typeof nowpaymentid !== 'number' && typeof nowpaymentid !== 'string')
    ) {
      throw new Error('Invalid nowpaymentid format');
    }

    
    let callBackUrl = process.env.WEBHOOKADRESS_FOR_PAYIN

    if (type == 'marketOrLimit') {
      callBackUrl = 'https://nowpayments.io'
    }

    // 2. Формирование тела запроса
    const requestData = {
      currency: coin,
      amount: Number(minAmount),
      sub_partner_id: String(nowpaymentid),
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
      ipn_callback_url: callBackUrl, 
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/payment',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    // 4. Проверка структуры ответа
    if (!response.data?.result?.pay_address) {
      throw new Error('Invalid response structure from NowPayments API');
    }

    // await createNewRqstPayIn(response.data.result, tlgid, nowpaymentid);
    // return response.data.result.pay_address;
    return response.data.result;
    
  } catch (err) {

  logger.error({
    fn_title:  'Error in createPayAdress',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });

    return
  }
}

export async function getMinAmountToWithdraw(coin) {
  try {
    if (!coin) {
      return;
    }

    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout-withdrawal/min-amount/${coin}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    return response;
  } catch (err) {

   logger.error({
    fn_title:  'Error in getMinAmountToWithdraw',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });

    return
  }
}

export async function getPayoutFee(coin, amount) {
  try {
    if (!coin || !amount) {
      return;
    }

    const response = await axios.get(
      `https://api.nowpayments.io/v1/payout/fee?currency=${coin}&amount=${amount}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

     if (!response) {
      throw new Error('не пришел ответ от NowPayment');
    }

    return response;
  } catch (err) {

  logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getPayoutFee',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });

  }
}

export async function validateAdress(adress, coin) {
  try {
    if (!adress || !coin) {
      return;
    }

    const requestData = {
      address: String(adress),
      currency: String(coin),
    };

    // 3. Выполнение запроса с обработкой ошибок
    const response = await axios.post(
      'https://api.nowpayments.io/v1/payout/validate-address',
      requestData,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (response.data == 'OK') {
      console.log(response.data);
      return response.data;
    } else {
      return;
    }
  } catch (err) {
    logger.error({
    fn_title:  'Error in validateAdress',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
    return
  }
}

export async function makeWriteOff(token, requestData) {
  try {
    if (!token || !requestData) {
      return;
    }

    const response = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/write-off',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (!response) {
      return;
    }

    return response;
  } catch (err) {
    logger.error({
    fn_title:  'Error in makeWriteOff',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

// проверка существует ли юзер
export async function checkIfUserExist(token, adress) {
  try {
    if (!token || !adress) {
      return;
    }

    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner?id=${adress}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response) {
      return;
    }

    return response;
  } catch (err) {
    logger.error({
    fn_title:  'Error in checkIfUserExist',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

export async function makeTransferResponse(token, requestData) {
  try {
    if (!token || !requestData) {
      return;
    }

    const transferResponse = await axios.post(
      'https://api.nowpayments.io/v1/sub-partner/transfer',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 секунд таймаут
      }
    );

    if (!transferResponse) {
      return;
    }

    return transferResponse;
  } catch (err) {
    logger.error({
    fn_title:  'Error in makeTransferResponse',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

export async function getBalance(nowpaymentid) {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    if (!response) {
      return;
    }

    return response;
  } catch (err) {
    logger.error({
    fn_title:  'Error in getBalance',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

export async function getEstimatePricePair(amount, coinFrom, coinTo) {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/estimate?amount=${amount}&currency_from=${coinFrom}&currency_to=${coinTo}`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    if (!response) {
      return;
    }

    return response;
  } catch (err) {
    logger.error({
    fn_title:  'Error in getEstimatePricePair',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
    
  }
}

export async function getMinDeposit(coin) {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/min-amount?currency_from=${coin}&fiat_equivalent=usd&is_fixed_rate=False&is_fee_paid_by_user=False`,
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTSAPI,
        },
      }
    );

    if (!response) {
      throw new Error('не пришел ответ от NowPayment');
    }

    return response;
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getMinDeposit',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });

    
  return
  }
}

//создать payout
export async function createpayout(requestData, token) {
  try {
    if (!requestData || !token) {
      throw new Error('не получены параметры requestData или  token ');
    }

    const response = await axios.post(
      'https://api.nowpayments.io/v1/payout',
      requestData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response) {
      throw new Error('не пришел ответ от NowPayment');
    }

    return response.data;
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > createpayout',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

//верифицировать payout
export async function verifyPayout(withdrawal_id, code2fa, token) {
  try {
    if (!withdrawal_id || !code2fa || !token) {
      throw new Error(
        'не получены параметры withdrawal_id или code2fa или token '
      );
    }

    const response = await axios.post(
      `https://api.nowpayments.io/v1/payout/${withdrawal_id}/verify`,
      {
        verification_code: code2fa,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': process.env.NOWPAYMENTSAPI,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response) {
      throw new Error('не пришел ответ от NowPayment');
    }

    return response.data;
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > verifyPayout',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

// выполнить перевод другому юзеру
export async function getTransfer(token, transferID) {
  try {
    const response = await axios.get(
      `https://api.nowpayments.io/v1/sub-partner/transfers/?id=${transferID}`,

      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response) {
      throw new Error('не пришел ответ от NowPayment в функции getTransfer');
    }

    return response.data.result;
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getTransfer',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

//сделать конверсию валют
export async function createConversion(token, amount, coinFrom, coinTo) {
  try {
    if (!token || !amount || !coinFrom || !coinTo) {
      throw new Error(
        'не пришел один из аргументов token/amount/coinFrom/coinTo'
      );
    }

    const response = await axios.post(
      'https://api.nowpayments.io/v1/conversion',
      { amount: amount, from_currency: coinFrom, to_currency: coinTo },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response) {
      throw new Error(
        'не пришел ответ от NowPayment в функции createConversion'
      );
    }

    if (response.data.result.status === 'WAITING') {
      return { status: 'ok', id: response.data.result.id };
    }
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getcreateConversionTransfer',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
  return
  }
}

export async function getConversionStatus(token, id) {
  try {
    if (!token || !id) {
      throw new Error('не пришел один из аргументов token/id');
    }

    const response = await axios.get(
      `https://api.nowpayments.io/v1/conversion/${id}`,

      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response) {
      throw new Error(
        'не пришел ответ от NowPayment в функции getConversionStatus'
      );
    }

    return response.data.result;
  } catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getcreateConversionTransfer',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
    return;
  }
}


export async function depositFromMasterToClient(coinTo, amountTo, userNP, token) {
  try {

    if (!coinTo || !amountTo || !userNP || !token) {
      throw new Error('не пришел один из аргументов coinTo|amountTo|userNP|token');
    }    
  
  const response = await axios.post(
    'https://api.nowpayments.io/v1/sub-partner/deposit',
    { currency: coinTo, amount: amountTo, sub_partner_id: userNP },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTSAPI, 
      },
    }
  );

  if (!response) {
      throw new Error(
        'не пришел ответ от NowPayment в функции depositFromMasterToClient'
      );
    }



  if (response.data.result.status === 'PROCESSING') {
    return { status: 'ok', id: response.data.result.id };
  } 
  }
  catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > depositFromMasterToClient',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
    return;
  }
}


//получить инфо о пополнении баланса Юзера
export async function getPaymentStatus(paymentID) {
  try {

    if (!paymentID) {
      throw new Error(
        'нет параметра paymentID'
      );
    }

  
  const response = await axios.get(
    `https://api.nowpayments.io/v1/payment/${paymentID}`,

    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );

   if (!response) {
      throw new Error(
        'не пришел ответ от NowPayment в функции getPaymentStatus'
      );
    }

  return { result: 'ok', payStatus: response.data.payment_status };
  }
   catch (err) {
    logger.error({
    fn_title:  'Ошибка в функции nowPayment.services.js > getPaymentStatus',
    fn_message: err.message,
    fn_dataFromServer: err.response?.data
    });
    return;
  }
}