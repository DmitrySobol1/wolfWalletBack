import mongoose from 'mongoose';

const WorkingSocketSchema = new mongoose.Schema(
  {
    pair: {
      type: String,
      required: true,
    },
    coin1: {
      type: String,
      required: true,
    },
    coin2: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    socketId: {
      type: String,
      required: true,
    },
    rqstId: {
      type: String,
      required: true,
    },
},
  {
    timestamps: true,
  }
);

export default mongoose.model('WorkingSocket', WorkingSocketSchema);
