const express = require("express");
const ProductEp = require("../end-point/Product-ep");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/all-product", ProductEp.getAllProduct);

router.get("/by-category", ProductEp.getProductsByCategory);

router.get("/package-details/:packageId", ProductEp.getPackageDetails);

router.post("/package-add-to-cart", authMiddleware, ProductEp.packageAddToCart);

router.post("/product-add-to-cart", authMiddleware, ProductEp.productAddToCart);

router.get("/get-product-type-count", ProductEp.getProductTypeCount);

router.get("/get-item-count", ProductEp.getCategoryCounts);
router.get("/get-item-count/wholesale", ProductEp.getCategoryCountsWholesale);
router.get("/wholesale", ProductEp.getProductsByCategoryWholesale);

router.get("/slides", ProductEp.getAllSlides);
router.post("/slide", ProductEp.addSlide);
router.delete("/slide/:id", ProductEp.deleteSlide);


//----------------------cart function routes ------------------------

// GET /api/cart - Get user's complete cart data
router.get('/cart', authMiddleware, ProductEp.getUserCart);

// PUT /api/cart/product/quantity - Update product quantity in cart
router.put('/product/quantity', authMiddleware, ProductEp.updateCartProductQuantity);

// PUT /api/cart/package/quantity - Update package quantity in cart
router.put('/package/quantity', authMiddleware, ProductEp.updateCartPackageQuantity);

// DELETE /api/cart/product/:productId - Remove product from cart
router.delete('/product/:productId', authMiddleware, ProductEp.removeCartProduct);

// DELETE /api/cart/package/:packageId - Remove package from cart
router.delete('/package/:packageId', authMiddleware, ProductEp.removeCartPackage);


module.exports = router;
