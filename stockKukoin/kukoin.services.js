import axios from 'axios';

export async function getPrice(pair){
    try {

    if (!pair) {
      return;
    }

    const response = await axios.get(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${pair}`);
    if (!response) {
      return;
    }

    return response

    } catch (error) {
    console.error('Error in stock.services.js - getPrice', {
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw new Error('Error in stock.services.js - getPrice');
  }
}