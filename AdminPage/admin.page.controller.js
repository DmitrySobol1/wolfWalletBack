//сохранить новую торговую пару
app.post('/api/save_new_tradingpair', async (req, res) => {
  const doc = new TradingPairsModel({
    coin1short: 'TON',
    coin1full: 'TON',
    coin1chain: 'ton',
    coin2short: 'USDT',
    coin2full: 'USDTTRC20',
    coin2chain: 'trx',
    adress1: 'EQCis7EQg8xEgj7j-SoBDan4cBwqSdl26mX7LYbvwwkHNFoF',
    adress2: 'TYL8ALwJMS5MsmuSZN7uXsdem13HtTNr5K',
  });

  await doc.save();
  return res.json({ status: 'saved' });
});

//сохранить новый адрес для перевода на биржу
app.post('/api/save_new_stockAdress', async (req, res) => {
  const doc = new StockAdressesModel({
    coinShort: 'TON',
    coinFull: 'TON',
    coinChain: 'ton',
    adress: 'EQCis7EQg8xEgj7j-SoBDan4cBwqSdl26mX7LYbvwwkHNFoF',
  });

  await doc.save();
  return res.json({ status: 'saved' });
});


//сохранить новую комиссию за трансфер
app.post('/api/save_new_transfercomission', async (req, res) => {
  const doc = new ComissionToTransferModel({
    qty: 0.01,
    coin: 'ton',
  });

  const comission = await doc.save();
  return res.json({ status: 'saved' });
});


//сохранить новую комиссию 
app.post('/api/save_new_comission', async (req, res) => {
  const doc = new ComissionStockMarketModel({
    qty: 1,
    coin: 'ourComission',
  });

  const comission = await doc.save();
});



//сохранить новую комиссию за обмен (числа в процентах!!!!!)
app.post('/api/save_new_comissionExchange', async (req, res) => {
  const doc = new ComissionExchangeModel({
    qty: req.body.qty, // в процентах!!!!
    coin: req.body.coin,
  });

  const comission = await doc.save();

  res.json({
    message: 'new saved',
  });
});