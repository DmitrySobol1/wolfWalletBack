import { Router } from 'express';
import axios from 'axios';

import crypto from 'crypto';

const router = Router();

import {
  processWebhookPayout,
  processWebhookStock,
  processWebhookStockLimit,
  verifyNowPaymentsSignature,
  processWebhookPayin
} from './webhooks.services.js';

export const webhooksController = router;

// для обработки "вывода" средств
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const receivedSignature = req.headers['x-nowpayments-sig'];
    const secretKey = process.env.IPN_SECRET_KEY;

    console.log('Получен вебхук "для вывода" payout:', payload);

    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      throw new Error('отсутствует подпись в header');
    }

    const isValid = verifyNowPaymentsSignature(
      payload,
      receivedSignature,
      secretKey
    );

    if (!isValid) {
      console.log('Неверная подпись');
      throw new Error('неверная подпись');
    }

    console.log('Подписи совпадают');

    //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт

    // 5. Обработка вебхука (с обработкой ошибок)
    await processWebhookPayout(payload);
  } catch (error) {
    console.error('Ошибка в /wh/webhook, вебхук "вывода" |', error);
  }
});





// для обработки "ввода" средств
router.post('/webhook_payin', async (req, res) => {
  try {
    const payload = req.body;
    const receivedSignature = req.headers['x-nowpayments-sig'];
    const secretKey = process.env.IPN_SECRET_KEY;
    
    console.log('Получен вебхук payin:', payload);

    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      throw new Error('отсутствует подпись в header');
    }


    const isValid = verifyNowPaymentsSignature(
      payload,
      receivedSignature,
      secretKey
    );

    if (!isValid) {
      console.log('Неверная подпись');
      throw new Error('неверная подпись');
    }


    console.log('Подписи совпадают');

    // 5. Обработка вебхука (с обработкой ошибок)
    await processWebhookPayin(payload);

    
  } catch (error) {
    console.error('Ошибка в /wh/webhook_payin, вебхук "ввода средств" |', error);
  }
});











// для обработки "прихода денег на биржу" (при маркет ордере) (WEBHOOKADRESS_FORSTOCK в env)
router.post('/webhook_forstock', async (req, res) => {
  try {
    const payload = req.body;
    const receivedSignature = req.headers['x-nowpayments-sig'];
    const secretKey = process.env.IPN_SECRET_KEY;

    console.log('Получен вебхук forstock market:', payload);

    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      throw new Error('отсутствует подпись в header');
    }

    const isValid = verifyNowPaymentsSignature(
      payload,
      receivedSignature,
      secretKey
    );
    if (!isValid) {
      console.log('Неверная подпись');
      throw new Error('неверная подпись');
    }

    console.log('Подписи совпадают');

    const status = payload.status?.toLowerCase();
    if (status == 'finished') {
      //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт
      await processWebhookStock(payload);
    } else {
      console.log('статус не finished, не обрабатываем');
    }
  } catch (error) {
    console.error(
      'Ошибка в /wh/webhook_forstock, вебхук для обработки "прихода денег на биржу при маркет ордере',
      error
    );
  }
});


// для обработки "прихода денег на биржу" (при лимит ордере) (WEBHOOKADRESS_FORSTOCK_LIMIT в env)
router.post('/webhook_forstock_limit', async (req, res) => {
  try {
    const payload = req.body;
    const receivedSignature = req.headers['x-nowpayments-sig'];
    const secretKey = process.env.IPN_SECRET_KEY;

    // const payload = req.body;
    console.log('Получен вебхук forstock limit:', payload);

    if (!receivedSignature) {
      console.log('Отсутствует заголовок подписи');
      throw new Error('отсутствует подпись в header');
    }

    const isValid = verifyNowPaymentsSignature(
      payload,
      receivedSignature,
      secretKey
    );
    if (!isValid) {
      console.log('Неверная подпись');
      throw new Error('неверная подпись');
    }

    console.log('Подписи совпадают');

    const status = payload.status?.toLowerCase();
    if (status == 'finished') {
      //TODO: добавить логику, если приходит reject - чтобы пользователю написать msg и вернуть средства с master на его аккаунт
      await processWebhookStockLimit(payload);
    } else {
      console.log('статус не finished, не обрабатываем');
    }
  } catch (error) {
    console.error(
      'Ошибка в /wh/webhook_forstock_limit, вебхук для обработки "прихода денег на биржу при лимит ордере',
      error
    );
  }
});








