import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    tlgid: {
      type: Number,
      required: true,
      unique: true,
    },
    isOnboarded: {
      type: Boolean,
      required: true,
    },
    isMemberEdChannel: {
      type: Boolean,
    },
    jb_email: String,
    isLevelTested: {
      type: Boolean,
      required: true,
    },
    level: String,
    nowpaymentid: Number,
    valute: String,
    language: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', UserSchema);
