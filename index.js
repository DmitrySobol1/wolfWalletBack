import express from 'express';
import mongoose from 'mongoose';

import { walletController } from './page1 - wallet/wallet.controller.js'
import { payinController } from './page1 - wallet/payin-page/payin.controller.js'
import { payoutController } from './page1 - wallet/payout-page/payout.controller.js'
import { transferController } from './page1 - wallet/transfer-page/transfer.controller.js'
import { stockController } from './page3 - stock/stock.controller.js'
import { webhooksController } from './webhooks/webhooks.controller.js'
import { systemController } from './SystemAction/system.controller.js'

import { exchangeController } from './page2 - exchange/exchange.controller.js'

import {requestLogger} from './middlewares/error-logger.js'
import {errorLogger} from './middlewares/error-logger.js'
 
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();


const PORT = process.env.PORT || 4444;

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('DB OK'))
  .catch((err) => console.log('db error:', err));

const app = express();

app.use(express.json());
app.use(cors());


// app.use(requestLogger)


// wallet page
app.use('/api/wallet', walletController)

// wallet > payin & payout pages & transfer
app.use('/api/payin', payinController)
app.use('/api/payout', payoutController)
app.use('/api/transfer', transferController)


// exchange page
app.use('/api/exchange', exchangeController)


// stock page
app.use('/api/stock', stockController)

// all webhooks
app.use('/api/wh', webhooksController)

// system action
app.use('/api/system', systemController)


app.use(errorLogger)

app.listen(PORT, (err) => {
  if (err) {
    return console.log(err);
  }
  console.log('server has been started');
});


// FIXME: не удалять, не нашел, где используется на фронте
// получить сумму комиссий
// app.get('/api/get_comission', async (req, res) => {
//   try {
//     const comission = await ComissionToPayoutModel.findOne({
//       coin: req.query.coin,
//     });

//     console.log('com=', comission);
//     return res.json({ comission });
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       message: 'ошибка сервера',
//     });
//   }
// });



