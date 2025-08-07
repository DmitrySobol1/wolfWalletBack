import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import { logger } from '../middlewares/error-logger.js'

//Сценарий, для покупки/продажи на бирже по лимиту


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи5... | Покупка/продажа на бирже по лимиту ', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача5 выполнена');
    } catch (err) {
      
    logger.error({
          cron_title: 'Ошибка в CRON 5 stock limit cron > при выполнении файла task.js', 
          cron_message: err.message,
          dataFromServer: err.response?.data,
          statusFromServer: err.response?.status,
        });
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач5 инициализирован, check port=',process.env.PORT);
