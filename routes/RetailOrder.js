const express = require("express");
const RetailOrderEp = require("../end-point/RetailOrder-ep");
const authMiddleware = require("../middlewares/authMiddleware");


const router = express.Router();

router.get(
    "/get-retail-cart",
    authMiddleware,
    RetailOrderEp.getRetailCart
);

router.get("/order-history", authMiddleware, RetailOrderEp.getRetailOrderHistory);
router.put(
    "/post-check-out-data",
    authMiddleware,
    RetailOrderEp.postCheckOutData
);

router.get(
    "/fetch-check-out-data",
    authMiddleware,
    RetailOrderEp.getCheckOutData
);
router.get('/order/:orderId/packages',authMiddleware, RetailOrderEp.getOrderPackages);
router.get("/order/additional-items/:orderId",authMiddleware, RetailOrderEp. getOrderAdditionalItems);

module.exports = router;

