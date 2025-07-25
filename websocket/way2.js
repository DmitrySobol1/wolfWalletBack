//FIXME:
// для тестов
import dotenv from 'dotenv';
dotenv.config();

//FIXME:
//для прода
// import dotenv from 'dotenv';
// dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

// TODO: убрат в проде команду
executeCheckTask();

// TODO: убрать файл env из этой папки перед заливкой на сервер
// TODO: нужно ли убирать из этого файла const app и прочее?

import mongoose from 'mongoose';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';
import WorkinSocketModel from '../models/workingSocket.js';

// import ComissionStockModel from '../models/comissionStockMarket.js';

// import { TEXTS } from './texts.js';

import https from 'https';

// import cors from 'cors';
// import crypto from 'crypto';
// import speakeasy from 'speakeasy';

import axios from 'axios';

const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

// const app = express();

// app.use(express.json());
// app.use(cors());

export async function executeCheckTask() {
  console.log('Начинаю cron5: поиск заявок для лимитного ордера');

  try {
    // поиск активных лимит ордеров
    const activeRqsts = await RqstStockLimitOrderModel.find({
      status: 'receivedByStock',
    }).exec();

    if (!activeRqsts || activeRqsts.length === 0) {
      console.log('Нет активных заявок');
      return;
    }

    // console.log(activeRqsts);
    console.log('всего активных ордеров=', activeRqsts.length);

    const groupedData = Object.groupBy(activeRqsts, (item) => item.pair);
    // console.log(groupedData);

    const keys = Object.keys(groupedData);

    for (const pair of keys) {
      const items = groupedData[pair];
      const getPriceResult = await getPrice(pair);

      if (getPriceResult.statusFn && getPriceResult.statusFn == 'ok') {
        console.log(pair, ' price=', getPriceResult.price);

        
        for (const item of items) {
          
            if (item.type == 'sell') {
            if (getPriceResult.price >= item.price) {
              console.log(`ПРОДАЖА: мин цена для продажи у клиента ${item.price} | совершаем продажу order id= ${item.id}` );
              
              // совершить продажу по цене биржи
              await prePlaceOrder(
                item.coin1short,
                item.coin2short,
                item.type,
                item.amountBeReceivedByStock,
                item.id
              );
            } else {
              console.log(
                `ПРОДАЖА: мин цена для продажи у клиента ${item.price} | НЕ совершаем продажу`
              );
            }
          }

          if (item.type == 'buy') {
            if (getPriceResult.price <= item.amount) {
              console.log(`ПОКУПКА: макс цена для покупки у клиента ${item.price} | совершаем покупку order id= ${item.id}`);
              
              // совершить покупку по цене биржи
              await prePlaceOrder(
                item.coin1short,
                item.coin2short,
                item.type,
                item.amountBeReceivedByStock,
                item.id
              );
            } else {
              console.log(
                `ПОКУПКА: макс цена для покупки у клиента ${item.price} | НЕ совершаем покупку`
              );
            }
          }
        }
      } else {
        // FIXME: выдать ошибку
        return;
      }
    }
  } catch (error) {
    console.error('Ошибка в executeCheckTask:', error);
  }
}


// получение стоимости валютной пары
async function getPrice(pair) {
  try {
    const response = await axios.get(
      `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${pair}`
    );

    if (!response) {
      return { statusFn: 'notOk' };
    }

    return { statusFn: 'ok', price: response.data.data.price };
  } catch (err) {
    console.log(err);
    res.json({
      message: 'ошибка сервера',
    });
  }
}

async function prePlaceOrder(coin1short,coin2short,type,amountBeReceivedByStock,id){
  
    const placeOrderFunction = await placeOrder(
    coin1short,
    coin2short,
    type,
    amountBeReceivedByStock
  );

  if (placeOrderFunction.status === 'ok') {
    await RqstStockLimitOrderModel.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          order_id: placeOrderFunction.orderId,
          status: 'orderPlaced',
          amountAccordingBaseIncrement: placeOrderFunction.amountWithStep,
        },
      },
      { new: true }
    );

    console.log('ордер размещен на бирже')
  }
}

//разместить order на бирже
async function placeOrder(coin1, coin2, type, amount) {
  try {


    class KcSigner {
      constructor(apiKey, apiSecret, apiPassphrase) {
        this.apiKey = apiKey || '';
        this.apiSecret = apiSecret || '';
        this.apiPassphrase = apiPassphrase || '';

        if (apiPassphrase && apiSecret) {
          this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
        }

        if (!apiKey || !apiSecret || !apiPassphrase) {
          console.warn('API credentials are missing. Access will likely fail.');
        }
      }

      sign(plain, key) {
        return crypto.createHmac('sha256', key).update(plain).digest('base64');
      }

      headers(requestPath, method = 'POST', body = '') {
        const timestamp = Date.now().toString();
        const bodyString =
          typeof body === 'object' ? JSON.stringify(body) : body;
        const prehash =
          timestamp + method.toUpperCase() + requestPath + bodyString;
        const signature = this.sign(prehash, this.apiSecret);

        return {
          'KC-API-KEY': this.apiKey,
          'KC-API-PASSPHRASE': this.apiPassphrase,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-SIGN': signature,
          'KC-API-KEY-VERSION': '3',
          'Content-Type': 'application/json',
        };
      }
    }

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
    console.log(
      'url=',
      `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`
    );
    const getSize = await axios.get(
      `https://api.kucoin.com${requestPathForSize}/${coin1}-${coin2}`,
      {
        headers: signer.headers(requestPathForSize, methodForSize),
      }
    );

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

    // Optional: check KuCoin API response code
    if (response.data.code !== '200000') {
      console.error('Ошибка от KuCoin:', response.data);
      return res.status(400).json({ error: response.data });
    } else {
      console.log(response.data);
      return {
        orderId: response.data.data.orderId,
        status: 'ok',
        amountWithStep: amountWithStep,
      };
    }
  } catch (err) {
    console.error('Ошибка сервера:', err.message || err);
    res.status(500).json({
      message: 'Ошибка сервера',
      error: err?.response?.data || err.message,
    });
  }
}
