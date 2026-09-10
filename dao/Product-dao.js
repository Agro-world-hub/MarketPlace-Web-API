const {
  plantcare,
  collectionofficer,
} = require("../startup/database");

exports.getProductsByCategoryDao = (category, search, userId) => {
  return new Promise((resolve, reject) => {
    let sql = `
        SELECT 
          m.id,
          m.displayName,
          m.normalPrice,
          m.discountedPrice,
          m.discount,
          m.promo,
          m.unitType,
          m.startValue,
          m.changeby,
          m.displayType,
          m.tags,
          v.varietyNameEnglish,
          v.varietyNameSinhala,
          v.varietyNameTamil,
          v.image,
          c.cropNameEnglish,
          c.cropNameSinhala,
          c.cropNameTamil,
          c.category,
          CASE WHEN ca.id IS NOT NULL THEN 1 ELSE 0 END AS inCart
        FROM marketplaceitems m
        JOIN plant_care.cropvariety v ON m.varietyId = v.id
        JOIN plant_care.cropgroup c ON v.cropGroupId = c.id
        LEFT JOIN cart ct ON ct.userId = ?
        LEFT JOIN cartadditionalitems ca ON ca.cartId = ct.id AND ca.productId = m.id
        WHERE m.category = 'Retail'
          AND m.isEnable = 1
      `;

    // userId param must come first — it's used in the LEFT JOIN above
    const params = [userId];

    if (category && (!search || search.trim() === '')) {
      let categoryCondition = '';

      if (category === 'Vegetables') {
        categoryCondition = ` AND c.category IN (?, ?)`;
        params.push('Vegetables', 'Mushrooms');
      } else if (category === 'Cereals') {
        categoryCondition = ` AND c.category IN (?, ?, ?, ?)`;
        params.push('Cereals', 'Legumes', 'Pulses', 'Grain');
      } else if (category === 'Spices') {
        categoryCondition = ` AND c.category = ?`;
        params.push('Spices');
      } else if (category === 'Fruits') {
        categoryCondition = ` AND c.category = ?`;
        params.push('Fruit');
      } else {
        categoryCondition = ` AND c.category = ?`;
        params.push(category);
      }

      sql += categoryCondition;
    }

    if (search && search.trim() !== '') {
      sql += ` AND (m.displayName LIKE ? OR m.tags LIKE ?)`;
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    sql += ` ORDER BY m.displayName ASC`;

    collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        const formattedResults = results.map(item => {
          let discountPercentage = null;

          const normalPrice = Number(item.normalPrice);
          const discountedPrice = item.discountedPrice != null ? Number(item.discountedPrice) : null;

          if (
            normalPrice > 0 &&
            discountedPrice != null &&
            discountedPrice > 0 &&
            normalPrice > discountedPrice
          ) {
            const discount = ((normalPrice - discountedPrice) / normalPrice) * 100;
            discountPercentage = discount % 1 === 0 ? Math.round(discount) : Math.round(discount * 100) / 100;
          }

          return {
            ...item,
            discountedPrice: discountedPrice != null && discountedPrice % 1 === 0
              ? parseInt(discountedPrice)
              : discountedPrice,
            discount: discountPercentage,
            inCart: !!item.inCart, // convert 1/0 -> boolean
          };
        });

        resolve(formattedResults);
      }
    });
  });
};

exports.getAllSlidesDao = () => {
  return new Promise((resolve, reject) => {
    collectionofficer.query(
      "SELECT * FROM banners  ORDER BY createdAt DESC",
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });
};

exports.getProductsByCategoryDaoWholesale = (category, search, userId) => {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        m.id,
        m.displayName,
        m.normalPrice,
        m.discountedPrice,
        m.discount,
        m.promo,
        m.unitType,
        m.startValue,
        m.changeby,
        m.displayType,
        m.tags,
        v.varietyNameEnglish,
        v.varietyNameSinhala,
        v.varietyNameTamil,
        v.image,
        c.cropNameEnglish,
        c.cropNameSinhala,
        c.cropNameTamil,
        c.category,
        CASE WHEN ca.id IS NOT NULL THEN 1 ELSE 0 END AS inCart
      FROM marketplaceitems m
      JOIN plant_care.cropvariety v ON m.varietyId = v.id
      JOIN plant_care.cropgroup c ON v.cropGroupId = c.id
      LEFT JOIN cart ct ON ct.userId = ?
      LEFT JOIN cartadditionalitems ca ON ca.cartId = ct.id AND ca.productId = m.id
      WHERE m.category = 'Wholesale'
        AND m.isEnable = 1
    `;

    // userId param must come first — it's used in the LEFT JOIN above
    const params = [userId];

    // Add category condition only if no search is provided or if search is empty
    if (category && (!search || search.trim() === '')) {
      // Normalize "fruits" to "Fruit" for category matching
      let normalizedCategory = category.toLowerCase() === 'fruits' ? 'Fruit' : category;

      // Handle grouped categories
      if (normalizedCategory === 'Vegetables') {
        sql += ` AND (c.category = ? OR c.category = ?)`;
        params.push('Vegetables', 'Mushrooms');
      } else if (normalizedCategory === 'Cereals') {
        sql += ` AND (c.category = ? OR c.category = ? OR c.category = ? OR c.category = ?)`;
        params.push('Cereals', 'Legumes', 'Pulses', 'Grain');
      } else {
        sql += ` AND c.category = ?`;
        params.push(normalizedCategory);
      }
    }

    // Add search condition if search is provided
    if (search && search.trim() !== '') {
      sql += ` AND (m.displayName LIKE ? OR m.tags LIKE ?)`;
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    sql += ` ORDER BY m.displayName ASC`;

    collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        const formattedResults = results.map(item => {
          const normalPrice = Number(item.normalPrice);
          const discountedPrice = item.discountedPrice != null ? Number(item.discountedPrice) : null;

          let discountPercentage = null;
          if (
            normalPrice > 0 &&
            discountedPrice != null &&
            discountedPrice > 0 &&
            normalPrice > discountedPrice
          ) {
            const discount = ((normalPrice - discountedPrice) / normalPrice) * 100;
            discountPercentage = discount % 1 === 0 ? Math.round(discount) : Math.round(discount * 100) / 100;
          }

          return {
            ...item,
            discountedPrice: discountedPrice != null && discountedPrice % 1 === 0
              ? parseInt(discountedPrice)
              : discountedPrice,
            discount: discountPercentage,
            inCart: !!item.inCart, // convert 1/0 -> boolean
          };
        });
        resolve(formattedResults);
      }
    });
  });
};

exports.getAllProductDao = (search) => {
  return new Promise((resolve, reject) => {
    let sql = `
        SELECT mp.id, mp.displayName, mp.image, (mp.productPrice + mp.packingFee + mp.serviceFee) AS subTotal
        FROM marketplacepackages mp
        LEFT JOIN definepackage dp ON mp.id = dp.packageId
        WHERE mp.status = 'Enabled' 
        AND mp.isValid = 1 AND dp.id IS NOT NULL
        `;

    const params = [];

    if (search && search.trim() !== '') {
      sql += ` AND mp.displayName LIKE ?`;
      params.push(`%${search.trim()}%`);
    }

    sql += ` 
    GROUP BY mp.id, mp.displayName, mp.image
    ORDER BY mp.displayName ASC`;

    collectionofficer.query(sql, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getAllPackageItemsDao = (packageId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT 
            pd.id, 
            pd.packageId, 
            pd.qty as quantity, 
            pt.typeName as displayName,
            pt.shortCode,
            pd.productTypeId,
            pd.createdAt
        FROM packagedetails pd
        LEFT JOIN producttypes pt ON pd.productTypeId = pt.id
        WHERE pd.packageId = ?;
        `;
    collectionofficer.query(sql, [packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getCategoryCountsDao = () => {
  return new Promise((resolve, reject) => {
    const sql = `
   SELECT 
        c.category,
        COUNT(m.id) as itemCount
      FROM marketplaceitems m
      JOIN plant_care.cropvariety v ON m.varietyId = v.id
      JOIN plant_care.cropgroup c ON v.cropGroupId = c.id
      WHERE m.category = 'Retail' AND m.isEnable = 1
      GROUP BY c.category
    `;

    collectionofficer.query(sql, (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Group the results according to business logic
        const groupedCounts = {};

        results.forEach(item => {
          let groupedCategory = '';

          if (item.category === 'Vegetables' || item.category === 'Mushrooms') {
            groupedCategory = 'Vegetables';
          } else if (item.category === 'Cereals' || item.category === 'Legumes' || item.category === 'Pulses' || item.category === 'Grain') {
            groupedCategory = 'Cereals';
          } else if (item.category === 'Spices') {
            groupedCategory = 'Spices';
          } else if (item.category === 'Fruit') {
            groupedCategory = 'Fruits';
          } else {
            groupedCategory = item.category;
          }

          if (groupedCounts[groupedCategory]) {
            groupedCounts[groupedCategory] += item.itemCount;
          } else {
            groupedCounts[groupedCategory] = item.itemCount;
          }
        });

        // Convert to array format
        const finalResults = Object.keys(groupedCounts).map(category => ({
          category: category,
          itemCount: groupedCounts[category]
        }));

        resolve(finalResults);
      }
    });
  });
};

exports.getCategoryCountsWholesaleDao = () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        c.category,
        COUNT(m.id) as itemCount
      FROM marketplaceitems m
      JOIN plant_care.cropvariety v ON m.varietyId = v.id
      JOIN plant_care.cropgroup c ON v.cropGroupId = c.id
      WHERE m.category = 'Wholesale' AND m.isEnable = 1
      GROUP BY c.category
    `;

    collectionofficer.query(sql, (err, results) => {
      if (err) {
        reject(err);
      } else {
        // Group the results according to business logic
        const groupedCounts = {};

        results.forEach(item => {
          let groupedCategory = '';

          if (item.category === 'Vegetables' || item.category === 'Mushrooms') {
            groupedCategory = 'Vegetables';
          } else if (item.category === 'Cereals' || item.category === 'Legumes' || item.category === 'Pulses' || item.category === 'Grain') {
            groupedCategory = 'Cereals';
          } else if (item.category === 'Spices') {
            groupedCategory = 'Spices';
          } else if (item.category === 'Fruit') {
            groupedCategory = 'Fruits';
          } else {
            groupedCategory = item.category;
          }

          if (groupedCounts[groupedCategory]) {
            groupedCounts[groupedCategory] += item.itemCount;
          } else {
            groupedCounts[groupedCategory] = item.itemCount;
          }
        });

        // Convert to array format
        const finalResults = Object.keys(groupedCounts).map(category => ({
          category: category,
          itemCount: groupedCounts[category]
        }));

        resolve(finalResults);
      }
    });
  });
};

exports.addSlideDao = (slide) => {
  return new Promise((resolve, reject) => {
    const sql =
      "INSERT INTO banners (imageUrl, title, description) VALUES (?, ?, ?)";
    collectionofficer.query(
      sql,
      [slide.imageUrl, slide.title, slide.description],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });
};

exports.deleteSlideDao = (id) => {
  return new Promise((resolve, reject) => {
    collectionofficer.query(
      "DELETE FROM banners WHERE id = ?",
      [id],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });
};

exports.getUserCartIdDao = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT id
        FROM cart
        WHERE userId = ?
        `;
    collectionofficer.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.updateAditionalItemsUserCartDao = (cartId, isAditional) => {
  return new Promise((resolve, reject) => {
    console.log(cartId, isAditional);

    const sql = `
        UPDATE retailcart 
        SET isAditional  = ? 
        WHERE id = ?
        `;
    collectionofficer.query(sql, [isAditional, cartId], (err, results) => {
      if (err) {
        console.log(err);

        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.createCartDao = (userId, buyerType) => {
  return new Promise((resolve, reject) => {
    const sql = `
        INSERT INTO cart (userId, buyerType) 
        VALUES (?, ?)
        `;
    collectionofficer.query(sql, [userId, buyerType], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.checkPackageInCartDao = (cartId, packageId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT id, qty
        FROM cartpackage
        WHERE cartId = ? AND packageId = ?
        `;
    collectionofficer.query(sql, [cartId, packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.updatePackageQtyInCartDao = (cartId, packageId, qty) => {
  return new Promise((resolve, reject) => {
    const sql = `
        UPDATE cartpackage 
        SET qty = ? 
        WHERE cartId = ? AND packageId = ?
        `;
    collectionofficer.query(sql, [qty, cartId, packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.addPackageToCartDao = (cartId, packageId, qty = 1) => {
  return new Promise((resolve, reject) => {
    const sql = `
        INSERT INTO cartpackage (cartId, packageId, qty)
        VALUES (?, ?, ?)
        `;
    collectionofficer.query(sql, [cartId, packageId, qty], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

//------------------------------daos for products in cart---------------------------------------

// Check if a specific product exists in the cart
exports.checkProductInCartDao = (cartId, productId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT id, qty, unit
        FROM cartadditionalitems
        WHERE cartId = ? AND productId = ?
        `;
    collectionofficer.query(sql, [cartId, productId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Add a new product to the cart
exports.addProductToCartDao = (cartId, productId, qty, unit) => {
  return new Promise((resolve, reject) => {
    const sql = `
        INSERT INTO cartadditionalitems (cartId, productId, qty, unit)
        VALUES (?, ?, ?, ?)
        `;
    collectionofficer.query(sql, [cartId, productId, qty, unit], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Update product quantity in cart
exports.updateProductQtyInCartDao = (cartId, productId, qty) => {
  return new Promise((resolve, reject) => {
    const sql = `
        UPDATE cartadditionalitems 
        SET qty = ? 
        WHERE cartId = ? AND productId = ?
        `;
    collectionofficer.query(sql, [qty, cartId, productId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};




// Remove a product from cart
exports.removeProductFromCartDao = (cartId, productId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        DELETE FROM cartadditionalitems 
        WHERE cartId = ? AND productId = ?
        `;
    collectionofficer.query(sql, [cartId, productId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Clear all products from cart
exports.clearCartDao = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        DELETE FROM cartadditionalitems 
        WHERE cartId = ?
        `;
    collectionofficer.query(sql, [cartId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Get user's cart with all details
exports.getUserCartWithDetailsDao = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        c.id as cartId,
        c.userId,
        c.buyerType,
        c.isCoupon,
        c.couponValue,
        c.createdAt,
        mu.creditBalance
      FROM cart c
      LEFT JOIN marketplaceusers mu ON mu.id = c.userId
      WHERE c.userId = ?
    `;
    collectionofficer.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getUserCreditBalanceDao = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT creditBalance FROM marketplaceusers WHERE id = ?`;
    collectionofficer.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results.length > 0 ? results[0].creditBalance : 0);
      }
    });
  });
};


exports.getCartPackagesDao = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        cp.id as cartItemId,
        cp.qty as quantity,
        cp.createdAt,
        mp.id as packageId,
        mp.displayName as packageName,
        mp.image,
        mp.description,
        (mp.productPrice+mp.packingFee+mp.serviceFee) as price,
        mp.status,
        mp.isValid
      FROM cartpackage cp
      JOIN marketplacepackages mp ON cp.packageId = mp.id
      WHERE cp.cartId = ?
      ORDER BY cp.createdAt DESC
    `;

    collectionofficer.query(sql, [cartId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const expandedPackages = [];

        results.forEach(pkg => {
          const quantity = pkg.quantity || 1;

          for (let i = 0; i < quantity; i++) {
            expandedPackages.push({
              ...pkg,
              quantity: 1,
              sequenceNumber: i + 1,
              uniqueId: `${pkg.cartItemId}_${i + 1}`
            });
          }
        });

        resolve(expandedPackages);
      }
    });
  });
};

// Get package details (items) for a specific package
exports.getPackageDetailsDao = (packageId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        pd.id,
        pd.packageId,
        pd.qty as quantity,
        pd.createdAt,
        pt.id as productTypeId,
        pt.typeName as name,
        pt.shortCode
      FROM packagedetails pd
      JOIN producttypes pt ON pd.productTypeId = pt.id
      WHERE pd.packageId = ?
      ORDER BY pt.typeName
    `;
    collectionofficer.query(sql, [packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getCartProductsDao = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        cai.id as cartItemId,
        cai.qty as quantity,
        cai.unit,
        cai.createdAt,
        mi.id as productId,
        mi.displayName as name,
        mi.normalPrice,
        mi.discountedPrice,
        mi.comPrice,
        mi.discount,
        mi.promo,
        mi.unitType,
        mi.startValue,
        mi.changeby,
        mi.displayType,
        mi.tags,
        mi.isEnable,
        mi.maxQuantity as maxQuantity,
        cv.varietyNameEnglish,
        cv.varietyNameSinhala,
        cv.varietyNameTamil,
        cv.image,
        cg.cropNameEnglish,
        cg.cropNameSinhala,
        cg.cropNameTamil,
        cg.category
      FROM cartadditionalitems cai
      JOIN marketplaceitems mi ON cai.productId = mi.id
      JOIN plant_care.cropvariety cv ON mi.varietyId = cv.id
      JOIN plant_care.cropgroup cg ON cv.cropGroupId = cg.id
      WHERE cai.cartId = ?
      ORDER BY cai.createdAt DESC
    `;
    collectionofficer.query(sql, [cartId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Get cart summary with totals
exports.getCartSummaryDao = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        (
          SELECT COUNT(*) 
          FROM cartpackage cp 
          WHERE cp.cartId = ?
        ) as totalPackages,
        (
          SELECT COUNT(*) 
          FROM cartadditionalitems cai 
          WHERE cai.cartId = ?
        ) as totalProducts,
        (
          SELECT COALESCE(SUM(mp.productPrice), 0) 
          FROM cartpackage cp 
          JOIN marketplacepackages mp ON cp.packageId = mp.id 
          WHERE cp.cartId = ?
        ) as packageTotal,
        (
          SELECT COALESCE(SUM(COALESCE(mi.discountedPrice, mi.normalPrice)), 0) 
          FROM cartadditionalitems cai 
          JOIN marketplaceitems mi ON cai.productId = mi.id 
          WHERE cai.cartId = ?
        ) as productTotal
    `;
    collectionofficer.query(sql, [cartId, cartId, cartId, cartId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const result = results[0] || {};
        resolve({
          totalPackages: result.totalPackages || 0,
          totalProducts: result.totalProducts || 0,
          packageTotal: parseFloat(result.packageTotal) || 0,
          productTotal: parseFloat(result.productTotal) || 0
        });
      }
    });
  });
};

exports.updateCartProductQuantityDao = (cartId, productId, quantity, unit) => {
  return new Promise((resolve, reject) => {
    const query = unit
      ? `UPDATE cartadditionalitems SET qty = ?, unit = ? WHERE cartId = ? AND productId = ?`
      : `UPDATE cartadditionalitems SET qty = ? WHERE cartId = ? AND productId = ?`;

    const params = unit
      ? [quantity, unit, cartId, productId]
      : [quantity, cartId, productId];

    collectionofficer.query(query, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

// Update package quantity in cart
exports.updateCartPackageQuantityDao = (cartId, packageId, quantity) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE cartpackage 
      SET qty = ? 
      WHERE cartId = ? AND packageId = ?
    `;
    collectionofficer.query(sql, [quantity, cartId, packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Remove product from cart
exports.removeCartProductDao = (cartId, productId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM cartadditionalitems 
      WHERE cartId = ? AND productId = ?
    `;
    collectionofficer.query(sql, [cartId, productId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Remove package from cart
exports.removeCartPackageDao = (cartId, packageId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM cartpackage 
      WHERE cartId = ? AND packageId = ?
    `;
    collectionofficer.query(sql, [cartId, packageId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getCartPackageDao = async (cartId, packageId) => {
  const query = `
    SELECT qty 
    FROM cartpackage 
    WHERE cartId = ? AND packageId = ?
  `;
  const [rows] = await collectionofficer.promise().query(query, [cartId, packageId]);
  return rows;
};

exports.decrementCartPackageQtyDao = async (cartId, packageId) => {
  const query = `
    UPDATE cartpackage 
    SET qty = qty - 1 
    WHERE cartId = ? AND packageId = ?
  `;
  const [result] = await collectionofficer.promise().query(query, [cartId, packageId]);
  return result;
};

exports.bulkRemoveCartProductsDao = (cartId, productIds) => {
  return new Promise((resolve, reject) => {
    // Check if productIds is an array
    if (!Array.isArray(productIds)) {
      reject(new Error("productIds must be an array"));
      return;
    }

    // Early exit if no valid IDs
    if (productIds.length === 0) {
      resolve({ affectedRows: 0, success: false });
      return;
    }

    const placeholders = productIds.map(() => '?').join(',');
    const query = `
      DELETE FROM cartadditionalitems 
      WHERE cartId = ? AND productId IN (${placeholders})
    `;

    const params = [cartId, ...productIds];

    collectionofficer.query(query, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          affectedRows: results.affectedRows || 0,
          success: (results.affectedRows || 0) > 0
        });
      }
    });
  });
};

exports.getSuggestedItemsForNewUserDao = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        mi.displayName,
        pc.image
      FROM 
        marketplaceusers mu
      JOIN 
        marketplaceitems mi
      ON 1 = 1
      JOIN 
        plant_care.cropvariety pc 
      ON mi.varietyId = pc.id
      WHERE 
        mu.id = ? 
        AND mu.firstTimeUser = 0
        AND mu.buyerType = 'retail'
        AND mi.category = 'Retail'
      ORDER BY 
        mi.displayName ASC
    `;

    collectionofficer.query(query, [userId], (err, results) => {
      if (err) {
        return reject(err);
      }

      resolve(results);
    });
  });
};

exports.insertExcludeItemsDao = (userId, displayNames) => {
  return new Promise((resolve, reject) => {
    if (!displayNames || displayNames.length === 0) {
      return resolve({ message: 'No items to insert' });
    }

    const placeholders = displayNames.map(() => '?').join(',');
    const query = `
      INSERT INTO excludelist (userId, mpItemId)
      SELECT ?, mi.id
      FROM marketplaceitems mi
      WHERE mi.category = 'Retail' AND mi.displayName IN (${placeholders})
    `;

    const values = [userId, ...displayNames];

    collectionofficer.query(query, values, (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
};

exports.getExcludedItemsDao = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT DISTINCT mi.displayName, cv.image
      FROM excludelist el
      JOIN marketplaceitems mi ON el.mpItemId = mi.id
      JOIN plant_care.cropvariety cv ON mi.varietyId = cv.id
      WHERE el.userId = ? AND mi.category = 'Retail'
      ORDER BY mi.displayName ASC
    `;

    collectionofficer.query(query, [userId], (err, items) => {
      if (err) {
        return reject(err);
      }
      resolve(items);
    });
  });
};

exports.deleteExcludedItemsDao = (userId, displayNames) => {
  return new Promise((resolve, reject) => {
    const placeholders = displayNames.map(() => '?').join(',');
    const query = `
      DELETE el FROM excludelist el
      JOIN marketplaceitems mi ON el.mpItemId = mi.id
      WHERE el.userId = ? AND mi.displayName IN (${placeholders})
    `;
    const values = [userId, ...displayNames];

    collectionofficer.query(query, values, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

exports.updateUserStatusDao = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE marketplaceusers
      SET firstTimeUser = 1
      WHERE id = ? AND firstTimeUser = 0
    `;

    collectionofficer.query(query, [userId], (err, result) => {
      if (err) {
        return reject(err);
      }

      if (result.affectedRows === 0) {
        return reject(new Error("User not found or already marked as non-first-time user"));
      }

      resolve({ success: true, message: "User status updated successfully" });
    });
  });
};

exports.getSuggestedItemsDao = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        mi.id,
        mi.displayName,
        pc.image
      FROM 
        marketplaceitems mi
      JOIN 
        plant_care.cropvariety pc ON mi.varietyId = pc.id
      WHERE 
        mi.category = 'Retail'
      ORDER BY
        mi.displayName ASC
    `;

    collectionofficer.query(query, (err, results) => {
      if (err) {
        return reject(err);
      }

      resolve(results);
    });
  });
};

//global search related dao
exports.searchProductsAndPackagesDao = (searchTerm) => {
  return new Promise((resolve, reject) => {
    const productsQuery = `
      SELECT 
        m.id,
        m.displayName,
        m.normalPrice,
        m.discountedPrice,
        m.discount,
        m.promo,
        m.unitType,
        m.startValue,
        m.changeby,
        m.displayType,
        m.tags,
        v.varietyNameEnglish,
        v.varietyNameSinhala,
        v.varietyNameTamil,
        v.image,
        c.cropNameEnglish,
        c.cropNameSinhala,
        c.cropNameTamil,
        c.category,
        'product' as type
      FROM marketplaceitems m
      JOIN plant_care.cropvariety v ON m.varietyId = v.id
      JOIN plant_care.cropgroup c ON v.cropGroupId = c.id
      WHERE m.category = 'Retail' 
      AND (
        m.displayName LIKE ? OR
        v.varietyNameEnglish LIKE ? OR
        v.varietyNameSinhala LIKE ? OR
        v.varietyNameTamil LIKE ? OR
        c.cropNameEnglish LIKE ? OR
        c.cropNameSinhala LIKE ? OR
        c.cropNameTamil LIKE ? OR
        m.tags LIKE ?
      )
      ORDER BY m.displayName ASC
    `;

    const packagesQuery = `
      SELECT 
        mp.id, 
        mp.displayName, 
        mp.image, 
        mp.description,
        mp.productPrice,
        mp.packingFee,
        mp.serviceFee,
        (mp.productPrice + mp.packingFee + mp.serviceFee) AS subTotal,
        'package' as type,
        NULL as normalPrice,
        NULL as discountedPrice,
        NULL as discount,
        NULL as promo,
        NULL as unitType,
        NULL as startValue,
        NULL as changeby,
        NULL as displayType,
        NULL as tags,
        NULL as varietyNameEnglish,
        NULL as varietyNameSinhala,
        NULL as varietyNameTamil,
        NULL as cropNameEnglish,
        NULL as cropNameSinhala,
        NULL as cropNameTamil,
        NULL as category
      FROM marketplacepackages mp
      INNER JOIN definepackage dp ON mp.id = dp.packageId
      WHERE mp.status = 'Enabled' 
      AND mp.isValid = 1
      AND mp.displayName LIKE ?
    `;

    const searchPattern = `%${searchTerm}%`;
    const productsParams = Array(8).fill(searchPattern); // 8 search fields for products
    const packagesParams = [searchPattern]; // 1 search field for packages

    // Execute both queries
    Promise.all([
      new Promise((resolveProducts, rejectProducts) => {
        collectionofficer.query(productsQuery, productsParams, (err, results) => {
          if (err) {
            rejectProducts(err);
          } else {
            // Format the products results
            const formattedResults = results.map(item => {
              // Calculate discount percentage
              let discountPercentage = null;
              if (item.normalPrice && item.discountedPrice && item.normalPrice > item.discountedPrice) {
                const discount = ((item.normalPrice - item.discountedPrice) / item.normalPrice) * 100;
                discountPercentage = discount % 1 === 0 ? Math.round(discount) : Math.round(discount * 100) / 100;
              }

              return {
                ...item,
                discountedPrice: item.discountedPrice && item.discountedPrice % 1 === 0
                  ? parseInt(item.discountedPrice)
                  : item.discountedPrice,
                discount: discountPercentage
              };
            });
            resolveProducts(formattedResults);
          }
        });
      }),
      new Promise((resolvePackages, rejectPackages) => {
        collectionofficer.query(packagesQuery, packagesParams, (err, results) => {
          if (err) {
            rejectPackages(err);
          } else {
            resolvePackages(results);
          }
        });
      })
    ])
      .then(([products, packages]) => {
        // Combine both arrays
        const combinedResults = [...products, ...packages];
        resolve(combinedResults);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

exports.getIncludedItemsDao = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT DISTINCT 
        mi.displayName, 
        cv.image
      FROM preferlist pl 
      JOIN marketplaceitems mi ON pl.mpItemId = mi.id
      JOIN plant_care.cropvariety cv ON mi.varietyId = cv.id
      WHERE pl.userId = ? AND mi.category = 'Retail'
      ORDER BY mi.displayName ASC
    `;

    collectionofficer.query(query, [userId], (err, items) => {
      if (err) {
        return reject(err);
      }
      resolve(items);
    });
  });
};

exports.insertIncludedItemsDao = (userId, displayNames) => {
  return new Promise((resolve, reject) => {
    if (!displayNames || displayNames.length === 0) {
      return resolve({ message: 'No items to insert' });
    }

    const placeholders = displayNames.map(() => '?').join(',');
    const query = `
      INSERT INTO preferlist (userId, mpItemId)
      SELECT ?, mi.id
      FROM marketplaceitems mi
      WHERE mi.category = 'Retail' AND mi.displayName IN (${placeholders})
    `;

    const values = [userId, ...displayNames];

    collectionofficer.query(query, values, (err, result) => {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
};

exports.deleteIncludedItemsDao = (userId, displayNames) => {
  return new Promise((resolve, reject) => {
    const placeholders = displayNames.map(() => '?').join(',');
    const query = `
      DELETE pl FROM preferlist pl
      JOIN marketplaceitems mi ON pl.mpItemId = mi.id
      WHERE pl.userId = ? AND mi.displayName IN (${placeholders})
    `;
    const values = [userId, ...displayNames];

    collectionofficer.query(query, values, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};