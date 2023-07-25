const { string } = require("joi");
const { Schema, model } = require("mongoose");

const ProductSchema = Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    status:{
      available:{
        type:Boolean,
        default: false
      }
    },
    images: {
      type: [
        {
          url: {
            type: String,
          },
        },
      ],
    },
    // tags: {
    //   type: [
    //     {
    //       name: {
    //         type: String,
    //         required: true,
    //       },
    //     },
    //   ],
    // },
    description:{
      type:String
    },
    stock: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
    },
  },
  { colection: "products", timestamps: true }
);

module.exports = model("Products", ProductSchema);
