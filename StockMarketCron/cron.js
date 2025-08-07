import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import { logger } from '../middlewares/error-logger.js'

//Сценарий, для покупки/продажи на бирже по маркету


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи4... | Покупки/продажи на бирже по маркету', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача4 выполнена');
    } catch (err) {
      
    logger.error({
          cron_title: 'Ошибка в CRON 4 stock market cron > при выполнении файла task.js', 
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

console.log('⏰ Планировщик задач4 инициализирован, check port=',process.env.PORT);
