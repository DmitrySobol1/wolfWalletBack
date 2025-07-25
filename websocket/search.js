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

// import https from 'https';

// import cors from 'cors';
// import crypto from 'crypto';
// import speakeasy from 'speakeasy';

// import axios from 'axios';

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
    // поиск работающих сокетов
    const socketArray = await WorkinSocketModel.find().exec();

    if (!socketArray || socketArray.length === 0) {
      console.log('Нет активных сокетов');
      return;
    }


    //поиск и изменение мин цен
    for (const element of socketArray) {
      
      const rqstWithMinAmount = await RqstStockLimitOrderModel.findOne({
        coin1short: element.coin1,
        coin2short: element.coin2,
        status: 'receivedByStock',
        type: 'sell', 
      })
        .sort({ amount: 1 }) 
        .exec();


      if (rqstWithMinAmount && rqstWithMinAmount.amount < element.price) {
        const updatedSocket = await WorkinSocketModel.findOneAndUpdate(
          { _id: element._id },
          { 
            $set: { 
              price: rqstWithMinAmount.amount, 
              rqstId: rqstWithMinAmount._id 
            } 
          },
          { new: true } 
        ).exec();
        
        console.log('Нашел и обновил сокет:', updatedSocket._id);
      } else {
        console.log('Не нашел заявок с ценой меньше для сокета:', element._id);
      }
    }
  } catch (error) {
    console.error('Ошибка в executeCheckTask:', error);
  }
}