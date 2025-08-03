import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });


//Сценарий, для проверки обмена валюты


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи3...', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача3 выполнена');
    } catch (error) {
      console.error(
      'Ошибка в CRON 3 > при выполнении файла task.js |',
      error
    );
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач3 инициализирован, check port=',process.env.PORT);
