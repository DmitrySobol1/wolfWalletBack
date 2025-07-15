import mongoose from 'mongoose';

const TradingPairsSchema = new mongoose.Schema(
  {
    coin1short: {
      type: String,
      required: true,
      
    },
    coin1full: {
      type: String,
      required: true,
      
    },
    coin1chain: {
      type: String,
      required: true,
      
    },
   coin2short: {
      type: String,
      required: true,
      
    },
    coin2full: {
      type: String,
      required: true,
      
    },
    coin2chain: {
      type: String,
      required: true,
    },
    
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'TradingPairs',
  TradingPairsSchema
);
