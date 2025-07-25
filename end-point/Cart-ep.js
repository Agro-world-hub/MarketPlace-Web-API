const CartDao = require("../dao/Cart-dao");
const ProductValidate = require("../validations/product-validation");

exports.getTrueCart = async (req, res) => {
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  console.log(fullUrl);
  try {
    const userId = req.params.userId;
    const cart = await CartDao.getTrueCart(userId);
    console.log("Cart retrieved:", userId);
    if (cart.length === 0) {
      return res.json({
        status: false,
        message: "No cart found",
        cart: [],
      });
    }
    res.status(200).json({
      status: true,
      message: "cart found.",
      cart: cart,
    });
  } catch (err) {
    console.error("Error during get product:", err);
    res.status(500).json({ error: "An error occurred during retrieval." });
  }
};




exports.getCartDetails = async (req, res) => {
  const { userId } = req.params;

  try {
    const cart = await CartDao.getCartByUserId(userId);
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const result = { cartId: cart.id };

    if (cart.isAditional) {
      result.additionalItems = await CartDao.getAdditionalItems(cart.id);
    }

    if (cart.isPackage) {
      const packageItems = await CartDao.getPackageItems(cart.id);
      result.packageItems = await Promise.all(packageItems.map(async (pkg) => {
        const baseDetails = await CartDao.getPackageDetails(pkg.packageId);

        if (pkg.isMin) {
          const minusItems = await CartDao.getPackageItemMin(pkg.id);
          baseDetails.forEach(item => {
            const minus = minusItems.find(m => m.packageItemId === item.id);
            if (minus) item.quantity -= minus.qty;
          });
        }

        if (pkg.isAdded) {
          const addedItems = await CartDao.getPackageItemAdded(pkg.id);
          addedItems.forEach(add => {
            const existing = baseDetails.find(i => i.id === add.packageItemId);
            if (existing) {
              existing.quantity += add.qty;
            } else {
              baseDetails.push({ ...add, id: add.packageItemId });
            }
          });
        }

        return {
          packageId: pkg.packageId,
          finalItems: baseDetails
        };
      }));
    }

    res.json(result);

  } catch (error) {
    console.error('DAO error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};




exports.createOrder = async (req, res) => {
  try {
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    console.log('Full URL:', fullUrl);

    const { items, cartId, checkoutDetails, paymentMethod, discountAmount, grandTotal } = req.body;
    console.log("Order creation started", { itemsCount: items?.length, cartId });

    // Input validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items must be a non-empty array" });
    }

    if (!cartId) {
      return res.status(400).json({ error: "Cart ID is required" });
    }

    if (!checkoutDetails) {
      return res.status(400).json({ error: "Checkout details are required" });
    }

    if (!grandTotal || grandTotal <= 0) {
      return res.status(400).json({ error: "Valid grand total is required" });
    }

    const {
      buildingType,
      houseNo,
      street,
      cityName,
      buildingNo,
      buildingName,
      flatNumber,
      floorNumber,
      deliveryMethod,
      title,
      phoneCode1,
      phone1,
      phoneCode2,
      phone2,
      scheduleType,
      deliveryDate,
      timeSlot,
      fullName
    } = checkoutDetails;

    // Validate required checkout fields
    if (!deliveryMethod || !title || !phone1 || !fullName) {
      return res.status(400).json({ 
        error: "Missing required checkout details: deliveryMethod, title, phone1, or fullName" 
      });
    }

    // Step 1: Create delivery address with error handling
    let homedeliveryId;
    try {
      homedeliveryId = await CartDao.createDeliveryAddress(
        buildingType,
        houseNo,
        street,
        cityName,
        buildingNo,
        buildingName,
        flatNumber,
        floorNumber
      );
      
      if (!homedeliveryId) {
        throw new Error("Failed to create delivery address");
      }
    } catch (error) {
      console.error("Error creating delivery address:", error);
      return res.status(500).json({ error: "Failed to create delivery address" });
    }

    // Step 2: Get cart details with error handling
    let cartDetails;
    try {
      cartDetails = await CartDao.checkCartDetails(cartId);
      
      if (!cartDetails || cartDetails.length === 0) {
        return res.status(404).json({ error: "Cart not found" });
      }
    } catch (error) {
      console.error("Error checking cart details:", error);
      return res.status(500).json({ error: "Failed to retrieve cart details" });
    }

    const userId = cartDetails[0]?.userId;
    if (!userId) {
      return res.status(400).json({ error: "Invalid cart or missing user" });
    }

    // Step 3: Create order with error handling
    let orderId;
    try {
      orderId = await CartDao.createOrder(
        userId,
        deliveryMethod,
        homedeliveryId,
        title,
        phoneCode1,
        phone1,
        phoneCode2,
        phone2,
        scheduleType,
        deliveryDate,
        timeSlot,
        fullName,
        grandTotal,
        discountAmount || 0
      );
      
      if (!orderId) {
        throw new Error("Failed to create order");
      }
    } catch (error) {
      console.error("Error creating order:", error);
      return res.status(500).json({ error: "Failed to create order" });
    }

    // Step 4: Save order items with detailed error handling
    const orderItemPromises = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Validate each item
      if (!item.productId || !item.unit || !item.qty) {
        console.error(`Invalid item at index ${i}:`, item);
        return res.status(400).json({ 
          error: `Invalid item at index ${i}: missing productId, unit, or qty` 
        });
      }

      const orderItemPromise = CartDao.saveOrderItem({
        orderId,
        productId: item.productId,
        unit: item.unit,
        qty: item.qty,
        discount: item.totalDiscount || 0,
        price: item.totalPrice || 0,
        packageId: item.itemType === 'package' ? item.packageId : null,
        packageItemId: item.itemType === 'package' ? item.id : null
      }).catch(error => {
        console.error(`Error saving order item ${i}:`, error);
        throw new Error(`Failed to save order item ${i}: ${error.message}`);
      });

      

      orderItemPromises.push(orderItemPromise);
    }

    try {
      await Promise.all(orderItemPromises);
    } catch (error) {
      console.error("Error saving order items:", error);
      // Consider rolling back the order creation here
      return res.status(500).json({ error: "Failed to save order items" });
    }


    try {
  await CartDao.deleteCropTask(cartId);
  console.log(`Cart ${cartId} deleted successfully`);
} catch (error) {
  console.error(`Failed to delete cart ${cartId}:`, error);
}

    console.log("Order creation success", { orderId, userId });
    return res.status(200).json({ 
      status: true, 
      message: "Order created successfully", 
      orderId: orderId 
    });


    

  } catch (err) {
    console.error("Unexpected error in createOrder:", err);
    return res.status(500).json({ 
      error: "An unexpected error occurred while creating order",
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};