import axios from 'axios';
import WebSocket from 'ws';





(async () => {
  // 1. Получаем токен и endpoint через REST API
  const { data } = await axios.post('https://api.kucoin.com/api/v1/bullet-public');

  const wsEndpoint = data.data.instanceServers[0].endpoint;
  const token = data.data.token;

    

  // 2. Подключаемся к WebSocket
  const ws = new WebSocket(`${wsEndpoint}?token=${token}`);

  ws.on('open', () => {
    console.log('✅ Соединение установлено');

    // 3. Подписываемся на тикер BTC-USDT
    const subscribeMsg = {
      id: Date.now().toString(),
      type: "subscribe",
      topic: "/market/ticker:BTC-USDT",
      response: true
    };

    ws.send(JSON.stringify(subscribeMsg));
  });

 
  ws.on('message', (msg) => {
    const message = JSON.parse(msg);

    


    if (message.type === 'message' && message.topic.includes('ticker')) {
      console.log('1 BTC = ', message.data.price, ' USDT');
    }

    //SELL: если цена Биржы >= цена с БД, то совершаем сделку

    if (message.data.price >= sellPrice){
      // здесь совершить сделку и изменить статус заявки
    }

    
  });

 
 
  ws.on('error', (err) => {
    console.error('❌ Ошибка WebSocket:', err);
  });

  ws.on('close', () => {
    console.log('🔌 Соединение закрыто');
  });
})();



