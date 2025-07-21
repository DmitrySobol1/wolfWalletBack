import mongoose from 'mongoose';


const RqstStockMarketOrderSchema = new mongoose.Schema(
  {
    id_clientToMaster: {
      type: String,
    },
    id_MasterToStock: {
      type: String,
    },
    id_OrderOnStock: {
      type: String,
    },
    status: {
      type: String,
    },
    tlgid: {
      type: Number,
    },
    userNP: {
      type: Number,
    },
    type: {
      type: String,
    },

    coin1short: {
      type: String,
    },
    coin1full: {
      type: String,
    },
    coin1chain: {
      type: String,
    },
    coin2short: {
      type: String,
    },
    coin2full: {
      type: String,
    },
    coin2chain: {
      type: String,
    },
    coin2: {
      type: String,
    },
    amount: {
      type: Number,
    },
    
    nowpaymentComission: {
      type: Number,
    },
    ourComission: {
      type: Number,
    },
    stockComission: {
      type: Number,
    },
    language: {
      type: String,
    },
    helptext: {
      type: String,
    },
    errorText : {
      type: String,
    },
    amountSentToStock: {
      type: Number
    },
    payout_id: {
      type: String
    },
    batch_withdrawal_id: {
      type: String
    },
    order_id: {
      type: String
    },
    trtCoinFromStockToNP_np_id: {
      type: String
    },
    trtCoinFromStockToNP_stock_id:{
      type: String
    },
    amountAccordingBaseIncrement:{
      type: Number
    },
    amountSentBackToNp:{
      type: Number
    },
    amountBeReceivedByStock:{
      type: Number
    },


  
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'RqstStockMarketOrder',
  RqstStockMarketOrderSchema
);

