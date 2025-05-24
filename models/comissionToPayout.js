import mongoose from 'mongoose';

const ComissionToPayoutSchema = new mongoose.Schema(
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

export default mongoose.model('ComissionPayout', ComissionToPayoutSchema);
