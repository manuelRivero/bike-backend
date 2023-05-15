const mongoose = require("mongoose");
const Product = require("./../../models/product");
const Sales = require("./../../models/sales");
const User = require("./../../models/user");
const jwt = require("jsonwebtoken");
const validation = require("./../../helpers/validate");
const Joi = require("joi");
const { cloudinary } = require("./../../helpers/imageUpload");
const ExcelJS = require("exceljs");
var workbook = new ExcelJS.Workbook();

// schemas
const { createProductSchema } = require("./../../schemas/products");

const createProduct = {
  check: (req, res, next) => {
    const { body } = req;
    if (!req.files?.productImage) {
      res.json({
        true: false,
        error: "Las imagenes son requeridas",
      });
    } else {
      req.body.tags = JSON.parse(body.tags);
      validation.validateBody(req, next, createProductSchema);
    }
  },
  do: async (req, res) => {
    const { body, files } = req;
    const productImages = [];
    if (files.productImage.length) {
      for (let element of files.productImage) {
        try {
          const imageUrl = await cloudinary.uploader.upload(
            element.tempFilePath,
            { folder: "products" }
          );
          productImages.push({ url: imageUrl.secure_url });
        } catch {}
      }
    } else {
      console.log("else case");
      try {
        const imageUrl = await cloudinary.uploader.upload(
          files.productImage.tempFilePath,
          { folder: "products" }
        );
        productImages.push({ url: imageUrl.secure_url });
      } catch {}
    }
    const product = new Product({ ...body, images: productImages });
    try {
      product.save();
      res.json({
        ok: true,
        product,
      });
    } catch (error) {
      console.log("error", error);
    }
  },
};
const createProductsFromExcel = {
  check: async (req, res, next) => {
    if (!req.files?.excel) {
      res.json({
        true: false,
        error: "El excel es requerido",
      });
    } else {
      next();
    }
  },
  do: async (req, res) => {
    const filePath = req.files.excel.tempFilePath;
    workbook.xlsx.readFile(filePath).then(async function () {
      var workSheet = workbook.getWorksheet("productos");
      const images = workSheet.getImages();
      const productList = [];
      console.log("workSheet.rowCount", workSheet.rowCount);
      for (let i = 1; i <= workSheet.rowCount; i++) {
        const setProduct = async () => {
            const currentRow = workSheet.getRow(i);
            if (i === 1) return;
            console.log("currentRow", currentRow);
  
            const rowImages = images.filter((e) => {
              return e.range.tl.nativeRow === i - 1;
            });
            const mapedImages = rowImages.map((e) =>
              workbook.getImage(+e.imageId)
            );
  
            const resultUrl = await Promise.all(
              mapedImages.map((element) => {
                return new Promise((resolve, reject) => {
                  cloudinary.uploader
                    .upload_stream((err, res) => {
                      if (err) {
                        console.log(err);
                      } else {
                        // filteredBody.photo = result.url;
                        resolve({ url: res.secure_url });
                      }
                    })
                    .end(element.buffer);
                });
              })
            );
  
            const productData = {
              name: currentRow.getCell(1).value,
              price: currentRow.getCell(2).value,
              tags: currentRow
                .getCell(3)
                .value.split(",")
                .map((e) => ({ name: e })),
              description: currentRow.getCell(4).value,
              stock: currentRow.getCell(5).value,
              images: resultUrl,
            };
            console.log("productData", productData);
            const product = new Product({ ...productData });
            productList.push(product);            
        }
       await setProduct()
      }
        workSheet.eachRow(async (row, i) => {
          
          
         
      });

      const saveResponse = await Promise.all(
        productList.map((product) => {
          return new Promise(async (resolve, reject) => {
            try {
              const response = await product.save();
              resolve(response);
            } catch (error) {
              console.log("error al guardar", error);
              res.json({
                ok: false,
                error: "error al guardar",
              });
            }
          });
        })
      );
      console.log("saveResponse", saveResponse);
      res.json({
        ok: true,
      });
    });
  },
};
const getProducts = async (req, res) => {
  const token = req.get("x-token");
  const user = {};
  if (token) {
    const { uid } = jwt.verify(token, process.env.SECRETORPRIVATEKEY);
    user._id = uid;
  }

  const page = Number(req.query.page) || 0;
  const regex = new RegExp(req.query.search, "i");
  const search = req.query.search ? { name: regex } : {};
  const minPrice = req.query.minPrice
    ? { $lte: Number(req.query.minPrice) }
    : null;
  const maxPrice = req.query.maxPrice
    ? { $lte: Number(req.query.maxPrice) }
    : null;
  const priceQuery =
    minPrice && maxPrice ? { price: { ...minPrice, ...maxPrice } } : {};
  const tags = req.query.tags
    ? { "tags.name": { $in: JSON.parse(req.query.tags) } }
    : {};

  let [products, total] = await Promise.all([
    Product.find({ ...search, ...tags, ...priceQuery })
      .skip(page * 10)
      .limit(10)
      .lean(),
    Product.find({ ...search, ...tags, ...priceQuery }).count(),
  ]);
  const targetUser = await User.findById(user._id);
  products.forEach((product) => {
    if (targetUser.likedProducts.includes(product)) {
      product.liked = true;
    } else {
      product.liked = false;
    }
  });

  res.json({
    ok: true,
    products,
    total,
  });
};

const likeProduct = {
  check: (req, res, next) => {
    const schema = Joi.object({
      like: Joi.boolean().required(),
    });
    validation.validateBody(req, next, schema);
  },
  do: async (req, res) => {
    const { uid } = req;
    const { like } = req.body;
    const { id } = req.params;
    const targetProduct = await Product.findById(id);
    if (!targetProduct) {
      return res.status(404).json({
        ok: false,
        message: "El producto no existe",
      });
    }

    const targetUser = await User.findById(uid);
    if (like) {
      if (!targetUser.likedProducts.includes(targetProduct._id)) {
        console.log("producto incluido");
        targetUser.likedProducts = [
          ...targetUser.likedProducts,
          targetProduct._id,
        ];
      }
    } else {
      targetUser.likedProducts = targetUser.likedProducts.filter(
        (e) => e === targetProduct._id
      );
    }
    await targetUser.save();
    res.status(200).json({
      ok: true,
      targetUser,
    });
  },
};
const topProducts = async (req, res) => {
  const page = req.query.page || 0;

  const topProducts = await Sales.aggregate([
    { $group: { _id: "$products", count: { $sum: 1 } } },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product_data",
      },
    },
    {
      $sort: {
        count: -1,
      },
    },
    {
      $facet: {
        metadata: [{ $count: "count" }],
        data: [{ $skip: page * 10 }, { $limit: 10 }],
      },
    },
  ]);
  console.log("top products", topProducts);
  res.json({
    ok: true,
    data: topProducts[0].data,
    metadata: topProducts[0].metadata,
  });
};
module.exports = {
  createProduct,
  getProducts,
  likeProduct,
  topProducts,
  createProductsFromExcel,
};
