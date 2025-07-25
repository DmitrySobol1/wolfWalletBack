import cron from 'node-cron';
import { executeCheckTask } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });


//Сценарий, для покупки/продажи на бирже по лимиту


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи5... | Покупка/продажа на бирже по лимиту ', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача5 выполнена');
    } catch (error) {
      console.error('❌ Ошибка выполнения задачи5:', error);
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач5 инициализирован, check port=',process.env.PORT);
