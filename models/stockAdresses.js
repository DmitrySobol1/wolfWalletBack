import mongoose from 'mongoose';

const StockAdressesSchema = new mongoose.Schema(
  {
    coinShort: {
      type: String,
      required: true,
      
    },
    coinFull: {
      type: String,
      required: true,
      
    },
    coinChain: {
      type: String,
      required: true,
      
    },
    adress: {
      type: String,
      required: true,
    },
   
    
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'StockAdresses',
  StockAdressesSchema
);
