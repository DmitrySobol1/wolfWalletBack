import cron from 'node-cron';
import { executeCheckTask2 } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });

import { logger } from '../middlewares/error-logger.js'

//Сценарий, для проверки, прошел ли трансфер денег от одного клиента другому


cron.schedule( 
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи2...', new Date().toISOString());

    try {
      await executeCheckTask2();
      console.log('✅ Задача2 успешно выполнена');
    } catch (err) {
      
    logger.error({
          cron_title: 'Ошибка в CRON 2 > при выполнении файла task.js', 
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

console.log('⏰ Планировщик задач2 инициализирован, check port=',process.env.PORT);
