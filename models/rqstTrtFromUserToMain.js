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
    sum: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    fromUserNP: {
      type: String,
      required: true,
    },
    adress: {
      type: String,
      required: true,
    },
    networkFees: {
      type: Number,
      required: true,
    },
    ourComission: {
      type: Number,
      required: true,
    },
    qtyToSend: {
      type: Number,
      required: true,
    },
    qtyForApiRqst: {
      type: Number,
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
