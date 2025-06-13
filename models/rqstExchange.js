import mongoose from 'mongoose';

const RqstExchangeSchema = new mongoose.Schema(
  {
    id_clientToMaster: {
      type: Number,
      required: true,
      unique: true,
    },
    id_exchange: {
      type: Number,
      required: true,
    },
    id_masterToClient: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
    },
    tlgid: {
      type: Number,
      required: true,
    },
    userNP: {
      type: Number,
      required: true,
    },

    amountFrom: {
      type: Number,
      required: true,
    },
    coinFrom: {
      type: String,
      required: true,
    },
    amountTo: {
      type: Number,
      required: true,
    },
    coinTo: {
      type: String,
      required: true,
    },
    nowpaymentComission: {
      type: Number,
      required: true,
    },
    ourComission: {
      type: Number,
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('RqstExchange', RqstExchangeSchema);
