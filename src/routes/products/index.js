/*api/products*/

const { Router } = require("express");
const router = Router();

// controllers
const {
  createProduct,
  getProducts,
  getAdminProducts,
  likeProduct,
  topProducts,
  createProductsFromExcel,
  createProductsImages,
  getProductDetail,
  editProduct
} = require("../../controllers/products");

// validation
const { validateJWT } = require("../../middleware/validateJWT");

// routes
router.get("/", [validateJWT], getProducts);
router.get("/detail", [validateJWT], getProductDetail.do)
router.put("/edit/:id", [validateJWT],editProduct.check, editProduct.do)
router.get("/admin-products", [validateJWT],  getAdminProducts);
router.post("/", [validateJWT],createProduct.check, createProduct.do);
router.post("/like/:id", [validateJWT], likeProduct.check, likeProduct.do);
router.get("/topProducts", [validateJWT], topProducts);
router.post(
  "/productsExcel",
  [validateJWT],
  createProductsFromExcel.check,
  createProductsFromExcel.do
);
router.post(
  "/productsImages",
  [validateJWT],
  createProductsImages.check,
  createProductsImages.do
);

module.exports = router;
