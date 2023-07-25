const Sale = require("./../../models/sales");
const Product = require("./../../models/product");
const User = require("./../../models/user");
const validation = require("./../../helpers/validate");
const mongoose = require("mongoose");

const moment = require("moment");
const { orderStatus } = require("./const");
const Joi = require("joi");

const createSaleFromAdmin = {
  check: async (req, res, next) => {
    const schema = Joi.object({
      total: Joi.string().when("orderType", {
        is: "1" | "2",
        then: Joi.required(),
      }),
      paymentMethod: Joi.number().required().valid(1, 0),
      orderType: Joi.number().required().valid(0, 1, 2),
      repairTotal: Joi.string().when("orderType", {
        is: "1" | "2",
        then: Joi.required(),
      }),
      description: Joi.string().when("orderType", {
        is: "1" | "2",
        then: Joi.required(),
      }),
      products: Joi.array()
        .when("orderType", {
          is: "0" | "2",
          then: Joi.array().items(
            Joi.object({
              _id: Joi.string().required(),
              quantity: Joi.number().required(),
            }).required()
          ),
        })
        ,
    });
    validation.validateBody(req, next, schema);
  },
  do: async (req, res, next) => {
    const { uid } = req;
    const { products, paymentMethod, repairTotal, description, orderType } =
      req.body;
    const errorProducts = [];
    
    let total = 0;
    
    if ((orderType === 0) | (orderType === 2)) {
      products.forEach(async (element) => {
        if (element.quantity <= 0) {
          errorProducts.push({
            _id: element._id,
            error: "Se envió una cantidad de cero",
          });
          return;
        }

        const targetProduct = await Product.findOne({
          _id: mongoose.Types.ObjectId(element._id),
        });
        if (!targetProduct) {
          errorProducts.push({
            _id: element._id,
            error: "No existe el producto",
          });
        }
      });

      if (errorProducts.length > 0) {
        res.status(400).json({
          ok: false,
          message: "No se pudo procesar la orden de los siguientes productos",
          errorProducts,
        });
        return;
      }


      for (product of products) {
        const targetProduct = await Product.findOne({
          _id: mongoose.Types.ObjectId(product._id),
        });
        if (targetProduct.stock < product.quantity) {
          errorProducts.push({ _id: product._id, error: "Producto sin stock" });
          return;
        }

        targetProduct.stock = targetProduct.stock - Number(product.quantity);

        product.name = targetProduct.name;
        product.price = targetProduct.price;
        product.discount = targetProduct.discount | null;

        await targetProduct.save();
        let discount = 0;
        if (targetProduct.discount) {
          discount = (targetProduct.price * targetProduct.discount) / 100;
          total =
            total + (targetProduct.price - discount) * Number(product.quantity);
        } else {
          total = total + targetProduct.price * Number(product.quantity);
        }
      }
    }

    const handleTotal = (total) => {
      switch (orderType) {
        case "0":
          return total;
          break;
        case "1":
          return repairTotal;
          break;
        case "2":
          return repairTotal + total;
          break;

        default:
          break;
      }
    };

    const sale = new Sale({
      products:
        orderType === 1 || orderType === 2
          ? products.map((e) => {
              return {
                data: {
                  _id: e._id,
                  name: e.name,
                  price: e.price,
                  discount: e.discount | null,
                },
                quantity: e.quantity,
              };
            })
          : null,

      user: { _id: uid },
      orderType,
      total: handleTotal(total),
      description: description ? description : null,
      paymentMethod,
      status: orderStatus[2],
    });

    try {
      await sale.save();
      res.status(200).json({
        ok: true,
        sale,
        errorProducts,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: "Sucedió un error al guardar la orden",
      });
      console.log("sale error", error);
    }
  },
};
const createSale = {
  check: async (req, res, next) => {
    const schema = Joi.object({
      product: Joi.string().required(),
      user: Joi.object({
        email: Joi.string().required(),
        phone: Joi.number().required(),
      }),
    });
    validation.validateBody(req, next, schema);
  },
  do: async (req, res) => {
    const { product, user } = req.body;

    const targetProduct = await Product.findOne({
      _id: mongoose.Types.ObjectId(product),
    });
    if (!targetProduct) {
      return res.status(400).json({
        ok: false,
        message: "No se encontro el producto",
      });
    }

    if (targetProduct.stock < 1) {
      return res.status(400).json({
        ok: false,
        message: "El producto no cuanta con stock",
      });
    }

    targetProduct.stock = targetProduct.stock - 1;
    await targetProduct.save();
    let discount = 0;
    let total = 0;
    if (targetProduct.discount) {
      discount = (targetProduct.price * targetProduct.discount) / 100;
      total = targetProduct.price - discount;
    } else {
      total = targetProduct.price;
    }

    const sale = new Sale({
      status: "PENDIENTE",
      product: {
        quantity: 1,
        data: {
          _id: targetProduct.id,
          name: targetProduct.name,
          price: targetProduct.price,
          discount: targetProduct.discount ? targetProduct.discount : 0,
        },
      },
      user,
      total,
    });
    try {
      await sale.save();
      res.status(200).json({
        ok: true,
        sale: sale,
      });
    } catch (error) {
      console.log("sale error", error);
    }
  },
};
const getSales = async (req, res) => {
  const { query } = req;
  const page = Number(req.query.page) || 0;
  const status = query.status ? { status: orderStatus[query.status] } : {};

  const [sales, total] = await Promise.all(
    [
      Sale.find({ ...status })
        .populate({ path: "user", select: "name lastname email provider" })
        .skip(page * 10)
        .limit(10),
    ],
    Sale.find().count()
  );
  res.status(200).json({
    ok: true,
    sales,
    total,
  });
};
const getSaleDetail = async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({
      ok: false,
      message: "No se agrego el id de la orden en el request",
    });
  }

  const sale = await Sale.aggregate([
    { $match: { _id: mongoose.Types.ObjectId(id) } },
  ]);
  console.log("sale", sale);
  return res.json({
    ok: true,
    data: sale[0],
  });
};
const changeSaleStatus = {
  check: async (req, res, next) => {
    const schema = Joi.object({
      paymentMethod: Joi.string().required(),
      id: Joi.string().required(),
      status: Joi.number()
        .valid(...[0, 1, 2, 3, 4, 5])
        .required(),
    });
    validation.validateBody(req, next, schema);
  },
  do: async (req, res, next) => {
    try {
      const sale = await Sale.findById(mongoose.Types.ObjectId(req.body.id));
      if (!sale) {
        res.status(400).json({
          ok: false,
          error: "No se encontro el numero de la orden",
        });
        return;
      }
      sale.status = orderStatus[req.body.status];
      if (req.body.paymentMethod) {
        sale.paymentMethod = req.body.paymentMethod;
      } else {
        if (!sale.paymentMethod) {
          sale.paymentMethod = null;
        }
      }
      await sale.save();
      res.json({
        ok: true,
        id: sale._id,
        status: sale.status,
      });
    } catch (error) {
      console.log("error", error);
      res.status(400).json({
        ok: false,
        error: "No se ha podido actualizar el estatus de la orden",
      });
    }
  },
};
const getMonthlySales = async (req, res) => {
  const { query } = req;
  const startOfMonth = moment(query.date, "DD-MM-YYYY").startOf("month");
  const endOfMonth = moment(query.date, "DD-MM-YYYY").endOf("month");

  const dateQuery = {
    createdAt: {
      $gte: new Date(startOfMonth),
      $lte: new Date(endOfMonth),
    },
  };
  const [sales] = await Promise.all([
    Sale.aggregate([
      {
        $match: { ...dateQuery },
      },
      { $group: { _id: "$createdAt", total: { $sum: "$total" } } },
    ]),
  ]);
  res.status(200).json({
    ok: true,
    sales,
  });
};

const totalByDate = {
  check: (req, res, next) => {},

  do: async (req, res, next) => {
    const today = new Date();
    const { from } = req.query;
    let date = moment(moment.now());
    if (from === "day") {
      date = date.subtract(1, "d").format("YYYY-MM-DD");
    }
    if (from === "week") {
      date = date.subtract(7, "d").format("YYYY-MM-DD");
    }
    if (from === "month") {
      date = date.subtract(1, "month").format("YYYY-MM-DD");
    }
    if (from === "year") {
      date = date.subtract(1, "year").format("YYYY-MM-DD");
    }
    const sales = await Sale.aggregate([
      // First Stage
      {
        $match: { createdAt: { $gte: new Date(date), $lt: today } },
      },
    ]);
    const total = sales.reduce((acumulator, value) => {
      return Number(acumulator) + Number(value.total);
    }, 0);
    console.log("total", total);
    res.status(200).json({
      ok: true,
      total,
    });
  },
};
const dailySales = {
  check: () => {},
  do: async (req, res, next) => {
    let date = req.query.from;

    const sales = await Sale.aggregate([
      {
        $match: {
          createdAt: {
            $lte: moment(date).utc().endOf("date").toDate(),
            $gte: moment(date).utc().startOf("date").toDate(),
          },
        },
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: { _id: "$products.data._id", data: "$products.data" },
          quantity: { $sum: { $toDouble: "$products.quantity" } },
        },
      },
      // {
      //   $lookup: {
      //     from: "products",
      //     localField: "_id",
      //     foreignField: "_id",
      //     as: "product_data",
      //   },
      // },
      // { $unwind: "$product_data" },
      // {
      //   $project: {
      //     _id: 1,
      //     quantity: 1,
      //     product_data: "$product_data",
      //   },
      // },
    ]);

    let total = 0;
    console.log("sales", sales);
    sales.forEach((sale) => {
      total = total + parseInt(sale._id.data.price) * parseInt(sale.quantity);
    });

    res.status(200).json({
      ok: true,
      total,
    });
  },
};

module.exports = {
  createSale,
  getSales,
  totalByDate,
  dailySales,
  getMonthlySales,
  changeSaleStatus,
  createSaleFromAdmin,
  getSaleDetail,
};
