import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });


//Сценарий, для покупки/продажи на бирже по маркету


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи4... | Покупки/продажи на бирже по маркету', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача4 выполнена');
    } catch (error) {
      console.error(
      'Ошибка в CRON 4 stock market cron > при выполнении файла task.js |',
      error
    );
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач4 инициализирован, check port=',process.env.PORT);
