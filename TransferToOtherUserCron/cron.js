import cron from 'node-cron';
import { executeCheckTask2 } from './task.js';

import dotenv from 'dotenv';
dotenv.config({ path: '/root/wolfwallet/wolfWalletBack/.env' });


//Сценарий, для проверки, прошел ли трансфер денег от одного клиента другому


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск задачи2...', new Date().toISOString());

    try {
      await executeCheckTask2();
      console.log('✅ Задача2 успешно выполнена');
    } catch (error) {
      console.error('❌ Ошибка выполнения задачи2:', error);
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач2 инициализирован, check port=',process.env.PORT);
