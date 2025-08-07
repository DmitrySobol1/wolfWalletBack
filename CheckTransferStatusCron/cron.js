import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import { logger } from '../middlewares/error-logger.js'

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });


//Сценарий, для проверки, прошел ли трансфер со счета клиента на мастер кошелек


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи1...', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача1 выполнена');
    } catch (err) {
    logger.error({
          cron_title: 'Ошибка в CRON 1 > при выполнении файла task.js', 
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

console.log('⏰ Планировщик задач1 инициализирован, check port=',process.env.PORT);
