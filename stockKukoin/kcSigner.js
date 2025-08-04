import crypto from 'crypto';

export class KcSigner {
  constructor(apiKey, apiSecret, apiPassphrase) {
    this.apiKey = apiKey || '';
    this.apiSecret = apiSecret || '';
    this.apiPassphrase = apiPassphrase || '';

    if (apiPassphrase && apiSecret) {
      this.apiPassphrase = this.sign(apiPassphrase, apiSecret);
    }

    if (!apiKey || !apiSecret || !apiPassphrase) {
      console.warn('API credentials are missing. Access will likely fail.');
    }
  }

  sign(plain, key) {
    return crypto.createHmac('sha256', key).update(plain).digest('base64');
  }

  headers(requestPath, method = 'POST', body = '') {
    const timestamp = Date.now().toString();
    const bodyString =
      typeof body === 'object' ? JSON.stringify(body) : body;
    const prehash =
      timestamp + method.toUpperCase() + requestPath + bodyString;
    const signature = this.sign(prehash, this.apiSecret);

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-PASSPHRASE': this.apiPassphrase,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-SIGN': signature,
      'KC-API-KEY-VERSION': '3',
      'Content-Type': 'application/json',
    };
  }
}
