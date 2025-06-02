import mongoose from 'mongoose';

// transactionId: transactionId,
//       coin: coin,
//       sum: sum,
//       status: 'new',
//       userIdAtNP: userIdAtNP,
//       adress: adress,
//       totalComissionNum: totalComissionNum,
//       qtyToSend:qtyToSend

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
    userIdAtNP: {
      type: String,
      required: true,
    },
    adress: {
      type: String,
      required: true,
    },
    totalComissionNum: {
      type: Number,
      required: true,
    },
    qtyToSend: {
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
