import mongoose from 'mongoose';

const RqstPayInSchema = new mongoose.Schema(
  {
    payment_id: {
      type: Number,
      required: true,
      unique: true,
    },
    payment_status: {
      type: String,
      required: true,
    },
    pay_amount: {
      type: String,
      required: true,
    },
    price_currency: {
      type: String,
      required: true,
    },
    userIdAtNP: {
      type: String,
      required: true,
    },
    amount_received: {
      type: String,
      required: true,
    },
    tlgid: {
      type: String,
      required: true,
    },
    isOperated: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'RqstPayIn',
  RqstPayInSchema
);
