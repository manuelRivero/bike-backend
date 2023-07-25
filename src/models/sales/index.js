const { Schema, model } = require("mongoose");

const SaleSchema = Schema(
  {
    status: {
      type: String,
      required:true
    },
    paymentMethod:{
      type:Number,
      required:true
    },
    products: {
      type:[
        {
          quantity: { type: Number, required: true },
          data: {
            type: {
              _id: { type: Schema.Types.ObjectId, ref: "Products" },
              name: {
                type: String,
                required: true,
                trim: true,
              },
              price: {
                type: Number,
                required: true,
              },
              discount: {
                type: Number,
              },
            },
          },
        }
      ]
    },
    user: {
      required: true,
      type:{
        _id: { type: Schema.Types.ObjectId, ref: "Users" }
      }
    },
    total: {
      type: Number,
    },
    ordenType:{
      type: Number
    },
    description:{
      type: String
    }
  },
  { colletion: "Sales", timestamps: true }
);

module.exports = model("Sale", SaleSchema);
