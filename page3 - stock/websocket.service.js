import { WebSocketServer } from 'ws';

import { fetchPrice } from './fetch-price.js';
import { isUpdated , updateLastPrice } from './helper.js'

const PORT2 = 8080
const POLL_INTERVAL = 2500

const wss = new WebSocketServer({port: PORT2})
console.log(`websocket running on port ${PORT2}`)

let clients = []

wss.on('connection', (ws)=>{

  clients.push(ws);
  console.log('clients connected')

  ws.on('close', ()=>{
    clients.clients.filter((client)=> client !== ws);
    console.log('client disconnected')
  })

})

setInterval(async ()=> {
  try {

    const priceData = await fetchPrice()

    if (isUpdated(priceData.price)){
      updateLastPrice(priceData.price);
      const message = JSON.stringify({
        type: 'btc_price', data: priceData
      });

      clients.forEach((client) =>{
        if(client.readyState === WebSocket.OPEN){
          client.send(message)
        }
      })

      console.log(`new price sent: ${priceData.price}`)

    } else {
        console.log('no price change')
    }



  } catch (error){
      console.error('error fetching price', error.message)

  }
}, POLL_INTERVAL)
