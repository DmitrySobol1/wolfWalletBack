import mongoose from 'mongoose';

const RqstTrtFromUserToMainSchema = new mongoose.Schema(
  {
    transactionId: {
      type: Number,
      required: true,
      unique: true,
    },
    coin: {
      type: String,
      required: true,
    },
    qty: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    userIdAtNP: {
      type: String,
      required: true,
    },
    adress: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'RqstTrtFromUserToMain',
  RqstTrtFromUserToMainSchema
);
