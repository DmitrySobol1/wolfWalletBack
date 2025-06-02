import mongoose from 'mongoose';


const VerifiedPayoutsSchema = new mongoose.Schema(
  {
    payout_id: {
      type: Number,
      required: true,
      unique: true,
    },
    batch_withdrawal_id: {
      type: Number,
      required: true,
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
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('VerifiedPayouts', VerifiedPayoutsSchema);
