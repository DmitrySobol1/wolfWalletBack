import mongoose from 'mongoose';
  

const RqstTransferToOtherUserSchema = new mongoose.Schema(
  {
    transactionId_comission: {
      type: Number,
      required: true
      
    },
    coin: {
      type: String,
      required: true,
    },
    totalSum: {
      type: String,
      required: true,
    },
    fromUserNP: {
      type: String,
      required: true,
    },
    toUserNP: {
      type: String,
      required: true,
    },
    ourComission: {
      type: Number,
      required: true,
    },
    fromUserTlgid: {
      type: Number,
      required: true,
    },
    statusComission: {
      type: String,
      required: true,
    },
    statusAll: {
      type: String,
      required: true,
    },
    transactionId_transferToUser: {
      type: Number,
      required: true,
    },
    statusTransferToUser: {
      type: String,
      required: true,
    },
    qtyToTransfer: {
      type: Number,
      required: true,
    },
    toUserTlgid: {
      type: Number,
      required: true,
    },

  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'RqstTransferToOtherUser',
  RqstTransferToOtherUserSchema
);
