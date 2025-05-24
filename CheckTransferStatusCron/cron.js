import cron from 'node-cron';
import { executeCheckTask } from './task.js';


//Сценарий, для проверки, прошел ли трансфер со счета клиента на мастер кошелек


cron.schedule(
  '* * * * *',
  async () => {
    console.log('🚀 Запуск ежедневной задачи...', new Date().toISOString());

    try {
      await executeCheckTask();
      console.log('✅ Задача успешно выполнена');
    } catch (error) {
      console.error('❌ Ошибка выполнения задачи:', error);
    }
  },
  {
    scheduled: true,
    timezone: 'Europe/Moscow',
  }
);

console.log('⏰ Планировщик задач инициализирован');
