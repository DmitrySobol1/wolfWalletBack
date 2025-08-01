import axios from 'axios';
import { Convert } from 'easy-currencies';

import RqstPayInModel from '../models/rqstPayIn.js';
import RqstTransferToOtherUserModel from '../models/rqstTransferToOtherUser.js';
import RqstExchangeSchemaModel from '../models/rqstExchange.js';
import RqstStockMarketOrderModel from '../models/rqstStockMarketOrder.js';
import RqstStockLimitOrderModel from '../models/rqstStockLimitOrder.js';

// получение данных о стоимости крипты
export async function getCryptoPrices() {
  const response = await axios.get('https://api.coinlore.net/api/tickers/');
  return response.data.data;
}

// определить значок валюты
export async function getSymbol(valute) {
  let symbol = '₽';
  if (valute === 'usd') {
    symbol = '$';
  } else if (valute === 'eur') {
    symbol = '€';
  }
  return symbol;
}

// получить баланс юзера
export async function getUserBalance(nowpaymentid) {
  const response = await axios.get(
    `https://api.nowpayments.io/v1/sub-partner/balance/${nowpaymentid}`,
    {
      headers: {
        'x-api-key': process.env.NOWPAYMENTSAPI,
      },
    }
  );
  return response.data.result.balances;
}

// Расчеты для баланса
export async function getUserBalanceInUsd(userBalance, cryptoPrices) {
  const arrayOfUserBalance = Object.entries(userBalance).map(
    ([key, value]) => ({
      currency: key, // кладем ключ внутрь объекта
      currencyToFindPrices: key, //для того, чтобы все виды usdt (usdttrc,usdtton и т.д. ) приравнять просто к usdt
      ...value, // распаковываем остальные свойства
    })
  );

  //для того, чтобы все виды usdt (usdttrc,usdtton и т.д. ) приравнять просто к usdt
  arrayOfUserBalance.forEach((item) => {
    if (item.currencyToFindPrices.includes('usdt')) {
      item.currencyToFindPrices = 'usdt';
    }
  });

  const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance.map((item) => {
    // находим подходящий объект из cryptoPrices
    const matchingPrice = cryptoPrices.find(
      (price) =>
        item.currencyToFindPrices.toLowerCase() === price.symbol.toLowerCase()
    );

    // возвращаем новый объект с необходимой информацией
    return {
      currency: item.currency,
      amount: item.amount,
      price_usd: matchingPrice?.price_usd ?? null, // если нет подходящей цены, ставим null
    };
  });

  const userBalanceInUsd = arrayOfUserBalanceWithUsdPrice.reduce(
    (accumulator, item) => {
      return accumulator + item.amount * item.price_usd;
    },
    0
  );

  return userBalanceInUsd;
}

// получение курса доллара в валюте клиента
export async function getResultForFront(valute, language, userBalanceInUsd) {
  if (valute === 'usd') {
    const roundedBalance = parseFloat(userBalanceInUsd.toFixed(2));
    return {
      balance: roundedBalance,
      valute: valute,
      symbol: '$',
      language: language,
    };
  } else if (valute === 'eur') {
    const balance = await Convert(userBalanceInUsd).from('USD').to('EUR');
    const roundedBalance = parseFloat(balance.toFixed(2));
    return {
      balance: roundedBalance,
      valute: valute,
      symbol: '€',
      language: language,
    };
  } else if (valute === 'rub') {
    const balance = await Convert(userBalanceInUsd).from('USD').to('RUB');
    const roundedBalance = parseFloat(balance.toFixed(2));
    return {
      balance: roundedBalance,
      valute: valute,
      symbol: '₽',
      language: language,
    };
  }
}

// расчеты для вывода на вкладке активы
export async function getArrayOfUserBalanceWithUsdPrice(
  userBalance,
  fiatKoefficient,
  cryptoPrices,
  symbol
) {
  // Преобразовываем объект в массив объектов
  const arrayOfUserBalance = Object.entries(userBalance).map(
    ([key, value]) => ({
      currency: key, // кладем ключ внутрь объекта
      currencyToFindPrices: key, //для того, чтобы все виды usdt (usdttrc,usdtton и т.д. ) приравнять просто к usdt
      ...value, // распаковываем остальные свойства
    })
  );

  //для того, чтобы все виды usdt (usdttrc,usdtton и т.д. ) приравнять просто к usdt
  arrayOfUserBalance.forEach((item) => {
    if (item.currencyToFindPrices.includes('usdt')) {
      item.currencyToFindPrices = 'usdt';
    }
  });

  const arrayOfUserBalanceWithUsdPrice = arrayOfUserBalance
    .map((item) => {
      const matchingPrice = cryptoPrices.find(
        (price) =>
          item.currencyToFindPrices.toLowerCase() === price.symbol.toLowerCase()
      );

      const amount = item.amount != null ? parseFloat(item.amount) : 0;
      const priceUsd = parseFloat(matchingPrice?.price_usd) || 0;
      const fiatK = parseFloat(fiatKoefficient) || 0;

      // было 1e-20
      const epsilon = 1e-20;

      if (amount > 0 && Math.abs(amount - 2e-18) > epsilon) {
        const priceAllCoinInUsd = (amount * priceUsd).toFixed(2);
        const priceAllCoinInUserFiat = (priceAllCoinInUsd * fiatK).toFixed(2);

        return {
          currency: item.currency,
          currencyForUse: item.currencyToFindPrices,
          amount: amount,
          price_usd: priceUsd,
          priceAllCoinInUsd: priceAllCoinInUsd,
          priceAllCoinInUserFiat: priceAllCoinInUserFiat,
          symbol: symbol,
        };
      }
      return null;
    })
    .filter(Boolean); // Удаляет null/undefined из массива;

  return arrayOfUserBalanceWithUsdPrice;
}


export async function getSymbolAndKoef(valute) {
  let fiatKoefficient = 1;
  let symbol = '$';

  if (valute === 'eur') {
    fiatKoefficient = await Convert(1).from('USD').to('EUR');
    symbol = '€';
  } else if (valute === 'rub') {
    fiatKoefficient = await Convert(1).from('USD').to('RUB');
    symbol = '₽';
  }
  return { fiatKoefficient, symbol };
}


// поиск по БД для вывода на вкладке пополнения
export async function findDataInAllModels(datas) {
  const { tlgid, models} = datas

  const modelRegistry = {
    RqstPayInModel,
    RqstTransferToOtherUserModel,
    RqstExchangeSchemaModel,
    RqstStockMarketOrderModel,
    RqstStockLimitOrderModel,
  };

  const result = {};

  await Promise.all(
    models.map(async ({ name, modelName, statusValue, statusKey }) => {
      const Model = modelRegistry[modelName];
      if (!Model) {
        result[name] = []; 
        return;
      }

      const data = await Model.find({
        [statusValue]: statusKey,
        tlgid: tlgid,
      })
        .sort({ updatedAt: -1 })
        .lean();

      result[name] = data;
    })
  );

  return result;
}








