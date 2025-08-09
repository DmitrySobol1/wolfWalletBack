const defaultUrl = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
import axios from 'axios';

export async function fetchPrice(url = defaultUrl) {
    const response = await axios.get(url);
    console.log('RES', response.data)
    // const data = await response.json()

    return {
        symbol:response.data.symbol,
        price: parseFloat(response.data.price),
        timestamp: new Date().toISOString()
    }

}