import mongoose from 'mongoose';

const ComissionToExchangeSchema = new mongoose.Schema(
  {
    qty: {
      type: Number,
      required: true,
      
    },
    coin: {
      type: String,
      required: true,
      unique: true,
    }
},
  {
    timestamps: true,
  }
);

export default mongoose.model('ComissionExchange', ComissionToExchangeSchema);
