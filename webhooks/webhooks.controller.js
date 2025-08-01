import { Router } from 'express';
import axios from 'axios';

import crypto from 'crypto';

const router = Router();

import { processWebhookPayout } from './webhooks.services.js'

export const webhooksController = router;



// для обработки "вывода" средств
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Получен вебхук "для вывода" payout:', payload);

    // 1. Проверяем обязательный заголовок
    const receivedSignature = req.headers['x-nowpayments-sig'];
    if (!receivedSignature) {
      throw new Error('Отсутствует подпись в заголовке');
    }

    // 2. Безопасная сортировка объекта
    const safeSort = (obj) => {
      const seen = new WeakSet();
      const sort = (obj) => {
        if (obj !== Object(obj)) return obj;
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        return Object.keys(obj)
          .sort()
          .reduce((result, key) => {
            result[key] = sort(obj[key]);
            return result;
          }, {});
      };
      return sort(obj);
    };

    // 3. Генерация и проверка подписи
    const hmac = crypto.createHmac('sha512', process.env.IPN_SECRET_KEY);
    hmac.update(JSON.stringify(safeSort(payload)));
    const expectedSignature = hmac.digest('hex');

    // 4. Безопасное сравнение подписей
    if (
      !crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      throw new Error('Неверная подпись');
    }

    console.log('Подписи совпадают');

    
    //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт
    
    
    // 5. Обработка вебхука (с обработкой ошибок)
    await processWebhookPayout(payload);
    
    

  } catch (error) {
    console.error(
      'Ошибка в /wh/webhook, вебхук "вывода" |',
      error
    );
    
  }
});