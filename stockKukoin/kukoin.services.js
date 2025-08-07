import axios from 'axios';
import crypto from 'crypto';

import { KcSigner } from './kcSigner.js'; 

import { logger } from '../middlewares/error-logger.js'

export async function getPrice(pair) {
  try {
    if (!pair) {
      return;
    }

    const response = await axios.get(
      `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${pair}`
    );
    if (!response) {
      return;
    }

    return response; 
  } catch (err) {
    logger.error({
        fn_title:  'Error in stock.services.js - getPrice',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return
  }
}

//разместить order на бирже
export async function placeOrder(coin1, coin2, type, amount) {
  try {
    
    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //получить цену с учетом минимального шага сети
    const requestPathForSize = '/api/v2/symbols';
    const methodForSize = 'GET';
    
    
    const getSize = await axios.get(
      `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`,
      {
        headers: signer.headers(requestPathForSize, methodForSize),
      }
    );

    if (!getSize) {
      throw new Error('не получен ответ от Kukoin');
    }

    console.log('getSize', getSize.data);

    const baseIncrement = parseFloat(getSize.data.data.baseIncrement);
    console.log('Минимальный шаг объёма:', baseIncrement);

    const amountWithStep = (
      Math.floor(amount / baseIncrement) * baseIncrement
    ).toFixed(6);
    console.log('новая цена:', amountWithStep);
    console.log('amount=', amount);

    const requestPath = '/api/v1/hf/orders';
    const method = 'POST';

    const orderBody = {
      type: 'market',
      symbol: `${coin1}-${coin2}`,
      side: type,
      size: amountWithStep,
      clientOid: clientOid,
      remark: 'order remarks',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

    if (!response) {
      throw new Error('не получен ответ от Kukoin');
    }

    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      throw new Error('пришла ошибка от Kukoin ');
    } else {
      console.log(response.data);
      return {
        orderId: response.data.data.orderId,
        status: 'ok',
        amountWithStep: amountWithStep,
      };
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции kukoin.services.js > placeOrder',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}



//проверить, выполнен ли ORDER на бирже
export async function checkOrderExecution(
  order_id,
  coin1,
  coin2,
  coin1full,
  coin2full,
  coin1chain,
  coin2chain
) {
  try {
  
    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    
    //get adresses
    const requestPath = `/api/v1/hf/orders/${order_id}/?symbol=${coin1}-${coin2}`;
    const method = 'GET';

    const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
      headers: signer.headers(requestPath, method),
    });

    if (!response) {
      throw new Error('не получен ответ от Kukoin');
    }

    if (response.data.code !== '200000') {
      throw new Error('ошибка от KuCoin:');
    }
   
    
     else {
      
      if (
        response.data.data.inOrderBook == false &&
        response.data.data.active == false
      ) {
        console.log('from fn');
        console.log(response.data);

        // когда сделка не совершена
        if (response.data.data.size == response.data.data.cancelledSize) {
          // FIXME: что делать, если сделка не совершена? повторно ее пытаться совершить или возврат?
          return
        }


        if (response.data.data.side == 'buy') {
          const amount = response.data.data.dealSize;
          const coin = coin1;
          const coinFull = coin1full;
          const chain = coin1chain;
          return { amount, coin, coinFull, chain };
        }

        if (response.data.data.side == 'sell') {
          const amount =
            Number(response.data.data.dealFunds) -
            Number(response.data.data.fee);
          const coin = coin2;
          const coinFull = coin2full;
          const chain = coin2chain;
          return { amount, coin, coinFull, chain };
        }
      }
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции kukoin.services.js > checkOrderStatus',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}



// получить число для округления
export async function getWithdrawalInfo(coin, chain) {
  try {
    

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    const currencyValue = coin.toUpperCase();
    const chainValue = chain.toLowerCase();

    //get adresses
    const requestPath = `/api/v1/withdrawals/quotas?currency=${currencyValue}&chain=${chainValue}`;
    const method = 'GET';

    const response = await axios.get(`https://api.kucoin.com${requestPath}`, {
      headers: signer.headers(requestPath, method),
    });

    if (!response) {
      throw new Error('не получен ответ от Kukoin');
    }

    if (response.data.code !== '200000') {
      throw new Error('ошибка от KuCoin');
    }

  
     else {
      console.log('fr withdraw fn ', response.data);
      return { precision: response.data.data.precision, statusFn: 'ok' };
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции kukoin.services.js > getWithdrawalInfo',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}




//отправить с биржи монеты в NP
export async function makeWithdrawFromStockToNp(amount, coin, adress, chain) {
  try {
    
    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //get adresses
    const requestPath = '/api/v3/withdrawals';
    const method = 'POST';

    const currencyValue = coin.toUpperCase();
    const chainValue = chain.toLowerCase();

    const orderBody = {
      currency: currencyValue,
      toAddress: adress,
      amount: amount,
      withdrawType: 'ADDRESS',
      chain: chainValue,
      isInner: false,
      remark: 'this is Remark',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

     if (!response) {
      throw new Error('не получен ответ от Kukoin');
    }
     
    if (response.data.code !== '200000') {
      throw new Error('Ошибка от KuCoin');
    }

    
    else {
      console.log('fr withdraw fn ', response.data);
      return response.data.data.withdrawalId;
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции kukoin.services.js > makeWithdrawFromStockToNp',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}






//трансфер с Trade на Main аккаунт внутри биржи
export async function transferInStock(coin, amount) {
  try {
   

    // Load API credentials from environment
    const key = process.env.KUCOIN_KEY || '';
    const secret = process.env.KUCOIN_SECRET || '';
    const passphrase = process.env.KUCOIN_PASSPHRASE || '';

    const signer = new KcSigner(key, secret, passphrase);

    // Generate a unique client order ID
    const clientOid = crypto.randomUUID();

    //get adresses
    const requestPath = '/api/v3/accounts/universal-transfer';
    const method = 'POST';

    const orderBody = {
      clientOid: clientOid,
      type: 'INTERNAL',
      currency: coin,
      amount: amount,
      fromAccountType: 'TRADE',
      toAccountType: 'MAIN',
    };

    console.log('orderBody=', orderBody);

    const response = await axios.post(
      `https://api.kucoin.com${requestPath}`,
      orderBody,
      {
        headers: signer.headers(requestPath, method, orderBody),
      }
    );

    if (!response) {
      throw new Error('не получен ответ от Kukoin');
    }
     
    if (response.data.code !== '200000') {
      throw new Error('Ошибка от KuCoin');
    }

   
     else {
      console.log('средства отправлены с Trade на Main ');
      return { statusFn: 'ok' };
    }
  } catch (err) {
    logger.error({
        fn_title:  'Ошибка в функции kukoin.services.js > makeWithdrawFromStockToNp',
        fn_message: err.message,
        fn_dataFromServer: err.response?.data
        });
    return;
  }
}
