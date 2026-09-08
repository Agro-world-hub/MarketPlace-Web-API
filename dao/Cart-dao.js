const {
  plantcare,
  collectionofficer,
  dash,
} = require("../startup/database");

const QRCode = require('qrcode');
const uploadFileToS3 = require('../middlewares/s3upload');

exports.getTrueCart = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
    SELECT * 
    FROM retailcart 
    WHERE userId = ?`;
    collectionofficer.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Getting the cart by user ID
exports.getCartByUserId = async (userId) => {
  const [rows] = await collectionofficer.promise().query('SELECT * FROM retailcart WHERE userId = ?', [userId]);
  return rows[0]; // Assuming there is only one cart per user
};

// Getting additional items in the cart
exports.getAdditionalItems = async (cartId) => {
  const [rows] = await collectionofficer.promise().query(`
    SELECT rai.*, 
      mi.displayName,
      cv.image,
      CASE 
        WHEN rai.unit = 'g' THEN rai.qty * mi.discount / 1000
        ELSE rai.qty * mi.discount
      END AS totalDiscount, 
      CASE 
        WHEN rai.unit = 'g' THEN rai.qty * mi.normalPrice / 1000
        ELSE rai.qty * mi.normalPrice
      END AS totalPrice
    FROM retailadditionalitems rai
    JOIN marketplaceitems mi ON mi.id = rai.productId
    JOIN plant_care.cropvariety cv ON cv.id = mi.varietyId
    WHERE rai.cartId = ?`, [cartId]);

  return rows;
};

// Getting package items in the cart
exports.getPackageItems = async (cartId) => {
  const [rows] = await collectionofficer.promise().query('SELECT * FROM retailpackageitems WHERE cartId = ?', [cartId]);
  return rows;
};

// Getting package details for a specific package
exports.getPackageDetails = async (packageId) => {
  const [rows] = await collectionofficer.promise().query(`
    SELECT pd.*,
    mi.displayName,
    cv.image
    FROM packagedetails pd
    JOIN marketplaceitems mi ON mi.id = pd.mpItemId
    JOIN plant_care.cropvariety cv ON cv.id = mi.varietyId
    WHERE pd.packageId = ?`, [packageId]);

  return rows.map(row => ({
    id: row.id,
    mpItemId: row.mpItemId,
    displayName: row.displayName,
    image: row.image,
    quantity: row.quantity,
    discount: row.discount,
    price: row.price,
    discountedPrice: row.discountedPrice,
  }));
};

// Getting the package items that have been subtracted (minus items)
exports.getPackageItemMin = async (retailpackageItemsId) => {
  const [rows] = await collectionofficer.promise().query('SELECT * FROM retailpackageitemsMinus WHERE retailpackageItemsId = ?', [retailpackageItemsId]);
  return rows;
};

// Getting the package items that have been added (added items)
exports.getPackageItemAdded = async (retailpackageItemsId) => {
  const [rows] = await collectionofficer.promise().query('SELECT * FROM retailpackageitemsadded WHERE retailpackageItemsId = ?', [retailpackageItemsId]);
  return rows;
};

exports.checkCartDetails = async (id) => {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM retailcart WHERE id = ?";
    collectionofficer.query(sql, [id], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.deleteCropTask = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = "DELETE FROM retailcart WHERE id = ?";
    const values = [cartId];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        return reject(err); // Reject promise if an error occurs
      }
      resolve(results);
    });
  });
};

exports.validateCart = (cartId, userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT id FROM cart 
      WHERE id = ? AND userId = ?
    `;
    const values = [cartId, userId];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error validating cart:', err);
        reject(err);
      } else {
        resolve(results.length > 0);
      }
    });
  });
};

exports.createOrderWithTransaction = (connection, orderData) => {
  return new Promise((resolve, reject) => {
    const {
      userId,
      orderApp,
      delivaryMethod,
      centerId,
      buildingType,
      title,
      fullName,
      phonecode1,
      phone1,
      phonecode2,
      phone2,
      isCoupon,
      couponValue,
      couponType,
      total,
      fullTotal,
      discount,
      sheduleType,
      sheduleTime,
      isPackage,
      latitude,
      longitude,
      companycenterId,
      deliveryCharge,
      isFinalizeImdt
    } = orderData;

    const formatDeliveryMethod = (method) => {
      if (!method || typeof method !== 'string') return method;
      if (method.toLowerCase() === 'home') {
        return 'Delivery';
      }
      return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
    };

    const formatBuildingType = (type) => {
      if (!type || typeof type !== 'string') return type;
      return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    };

    const formattedDelivaryMethod = formatDeliveryMethod(delivaryMethod);
    const formattedBuildingType = formatBuildingType(buildingType);
    const isPickup = delivaryMethod && delivaryMethod.toLowerCase() === 'pickup';

    const insertOrder = (assignCoMCenId) => {
      const sql = `
        INSERT INTO orders (
          userId, orderApp, delivaryMethod, centerId, buildingType,
          title, fullName, phonecode1, phone1, phonecode2, phone2,
          isCoupon, couponType, couponValue, total, fullTotal, discount,
          deliveryCharge,
          sheduleType, sheduleTime, isPackage, isFinalizeImdt,
          latitude, longitude, assignCoMCenId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        userId,
        "Marketplace",
        formattedDelivaryMethod,
        centerId,
        formattedBuildingType,
        title, fullName,
        phonecode1, phone1,
        phonecode2 || null,
        phone2 || null,
        isCoupon,
        couponType || null,
        couponValue,
        total, fullTotal, discount,
        parseFloat(deliveryCharge) || 0,
        sheduleType, sheduleTime,
        isPackage,
        isFinalizeImdt ? 1 : 0,
        latitude, longitude,
        assignCoMCenId
      ];

      console.log('SQL Query:', sql);
      console.log('Values being inserted:', values);
      console.log('Geolocation values - Latitude:', latitude, 'Longitude:', longitude);

      connection.query(sql, values, (err, results) => {
        if (err) {
          console.error('Error creating order in transaction:', err);
          reject(err);
        } else {
          console.log('Order created successfully with ID:', results.insertId);
          console.log('Geolocation saved - Latitude:', latitude, 'Longitude:', longitude);
          resolve(results.insertId);
        }
      });
    };

    if (isPickup) {
      if (!centerId) {
        console.error('Pickup order missing centerId; cannot resolve assignCoMCenId');
        return reject(new Error('centerId is required for pickup orders'));
      }

      // Look up the distributedcompanycenter row for this pickup center,
      // since assignCoMCenId is a FK to distributedcompanycenter.id, not distributedcenter.id.
      const lookupSql = `
        SELECT id FROM collection_officer.distributedcompanycenter
        WHERE centerId = ?
        LIMIT 1
      `;

      connection.query(lookupSql, [centerId], (lookupErr, lookupResults) => {
        if (lookupErr) {
          console.error('Error resolving distributedcompanycenter for centerId:', centerId, lookupErr);
          return reject(lookupErr);
        }

        if (!lookupResults || lookupResults.length === 0) {
          console.error('No distributedcompanycenter found for centerId:', centerId);
          return reject(new Error(`No distributedcompanycenter mapping found for centerId ${centerId}`));
        }

        const resolvedAssignCoMCenId = lookupResults[0].id;
        console.log('Resolved assignCoMCenId from distributedcompanycenter:', resolvedAssignCoMCenId);
        insertOrder(resolvedAssignCoMCenId);
      });
    } else {
      // Home delivery: companycenterId already comes from the city's assignment
      // and is expected to already be a distributedcompanycenter.id.
      insertOrder(companycenterId);
    }
  });
};
exports.createOrderAddressWithTransaction = (connection, orderId, addressData, buildingType) => {
  return new Promise((resolve, reject) => {
    if (buildingType === 'apartment') {
      const {
        buildingNo,
        buildingName,
        unitNo,
        floorNo,
        houseNo,
        streetName,
        city,
        saveAs // Add this
      } = addressData;

      const sql = `
        INSERT INTO orderapartment (
          orderId, saveAs, buildingNo, buildingName, unitNo, 
          floorNo, houseNo, streetName, city
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
        orderId,
        saveAs || null,
        buildingNo,
        buildingName,
        unitNo,
        floorNo,
        houseNo || null,
        streetName,
        city
      ];

      connection.query(sql, values, (err, results) => {
        if (err) {
          console.error('Error creating order apartment address in transaction:', err);
          reject(err);
        } else {
          resolve(results.insertId);
        }
      });
    } else if (buildingType === 'house') {
      const { houseNo, streetName, city, saveAs } = addressData; // Add saveAs here

      const sql = `
        INSERT INTO orderhouse (orderId, saveAs, houseNo, streetName, city) 
        VALUES (?, ?, ?, ?, ?)
      `;
      const values = [orderId, saveAs || null, houseNo, streetName, city];

      connection.query(sql, values, (err, results) => {
        if (err) {
          console.error('Error creating order house address in transaction:', err);
          reject(err);
        } else {
          resolve(results.insertId);
        }
      });
    } else {
      reject(new Error('Invalid building type'));
    }
  });
};

exports.getCartItems = (cartId) => {
  return new Promise((resolve, reject) => {
    const getAdditionalItems = () => {
      return new Promise((resolve, reject) => {
        const sql = `
          SELECT productId, qty, unit, 'additional' as itemType
          FROM cartadditionalitems 
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

    const getPackageItems = () => {
      return new Promise((resolve, reject) => {
        const sql = `
          SELECT packageId, qty, 'package' as itemType
          FROM cartpackage 
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

    Promise.all([getAdditionalItems(), getPackageItems()])
      .then(([additionalItems, packageItems]) => {
        resolve([...additionalItems, ...packageItems]);
      })
      .catch(reject);
  });
};

exports.checkCartItemsAvailability = (cartId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COUNT(*) as disabledProductCount
      FROM cartadditionalitems cai
      JOIN marketplaceitems mi ON cai.productId = mi.id
      WHERE cai.cartId = ? AND mi.isEnable = 0
    `;

    const packageSql = `
      SELECT COUNT(*) as invalidPackageCount
      FROM cartpackage cp
      JOIN marketplacepackages mp ON cp.packageId = mp.id
      WHERE cp.cartId = ? AND (mp.isValid = 0 OR mp.status = 'Disabled')
    `;

    Promise.all([
      new Promise((res, rej) => {
        collectionofficer.query(sql, [cartId], (err, results) => {
          if (err) rej(err);
          else res(results[0].disabledProductCount);
        });
      }),
      new Promise((res, rej) => {
        collectionofficer.query(packageSql, [cartId], (err, results) => {
          if (err) rej(err);
          else res(results[0].invalidPackageCount);
        });
      }),
    ])
      .then(([disabledProductCount, invalidPackageCount]) => {
        resolve({
          hasUnavailableItems: disabledProductCount > 0 || invalidPackageCount > 0,
          disabledProductCount,
          invalidPackageCount,
        });
      })
      .catch(reject);
  });
};


exports.saveOrderItemsWithTransaction = (connection, orderId, processOrderId, items) => {
  return new Promise((resolve, reject) => {
    const savePromises = items.map(item => {
      if (item.itemType === 'additional') {
        return exports.saveOrderAdditionalItemWithTransaction(connection, orderId, item);
      } else if (item.itemType === 'package') {
        return exports.saveOrderPackageWithTransaction(connection, processOrderId, item);
      }
    });

    Promise.all(savePromises)
      .then(() => resolve())
      .catch(reject);
  });
};

exports.saveOrderAdditionalItemWithTransaction = (connection, orderId, itemData) => {
  return new Promise((resolve, reject) => {
    const { productId, qty, unit } = itemData;


    const getPriceSQL = `
      SELECT normalPrice, discount, unitType 
      FROM marketplaceitems 
      WHERE id = ?
    `;

    connection.query(getPriceSQL, [productId], (err, priceResults) => {
      if (err) {
        console.error('Error fetching marketplace item price in transaction:', err);
        reject(err);
        return;
      }

      if (priceResults.length === 0) {
        reject(new Error(`Marketplace item with ID ${productId} not found`));
        return;
      }

      const marketplaceItem = priceResults[0];
      const { normalPrice, discount, unitType } = marketplaceItem;


      const normalPricePerKg = parseFloat(normalPrice) || 0;
      const discountPerKg = parseFloat(discount) || 0;

      let calculatedNormalPrice;
      let calculatedPrice;
      let calculatedDiscount;
      let quantityInKg;

      if (unit.toLowerCase() === 'kg') {
        quantityInKg = parseFloat(qty);
        calculatedNormalPrice = normalPricePerKg * quantityInKg;
        calculatedDiscount = discountPerKg * quantityInKg;
        calculatedPrice = calculatedNormalPrice - calculatedDiscount;
        console.log(`Normal Price calculation (kg): ${normalPricePerKg}/kg × ${qty}kg = ${calculatedNormalPrice}`);
        console.log(`Discount calculation (kg): ${discountPerKg}/kg × ${qty}kg = ${calculatedDiscount}`);
        console.log(`Final Price calculation (kg): ${calculatedNormalPrice} - ${calculatedDiscount} = ${calculatedPrice}`);
      } else if (unit.toLowerCase() === 'g') {
        quantityInKg = parseFloat(qty) / 1000; // Convert grams to kg
        calculatedNormalPrice = normalPricePerKg * quantityInKg;
        calculatedDiscount = discountPerKg * quantityInKg;
        calculatedPrice = calculatedNormalPrice - calculatedDiscount;
        console.log(`Normal Price calculation (grams): ${normalPricePerKg}/kg × ${qty}g (${quantityInKg}kg) = ${calculatedNormalPrice}`);
        console.log(`Discount calculation (grams): ${discountPerKg}/kg × ${qty}g (${quantityInKg}kg) = ${calculatedDiscount}`);
        console.log(`Final Price calculation (grams): ${calculatedNormalPrice} - ${calculatedDiscount} = ${calculatedPrice}`);
      } else {
        reject(new Error(`Unsupported unit: ${unit}. Only 'kg' and 'g' are supported.`));
        return;
      }

      const insertSQL = `
        INSERT INTO orderadditionalitems (orderId, productId, qty, unit, normalPrice, price, discount) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [orderId, productId, qty, unit, calculatedNormalPrice, calculatedPrice, calculatedDiscount];

      connection.query(insertSQL, values, (err, results) => {
        if (err) {
          console.error('Error saving order additional item in transaction:', err);
          reject(err);
        } else {
          console.log(`Order additional item saved in transaction: ProductID=${productId}, Qty=${qty}, Unit=${unit}, NormalPrice=${calculatedNormalPrice}, Price=${calculatedPrice}, Discount=${calculatedDiscount}`);
          resolve(results.insertId);
        }
      });
    });
  });
};

exports.saveOrderPackageWithTransaction = (connection, processOrderId, packageData) => {
  return new Promise((resolve, reject) => {
    const { packageId, qty } = packageData;

    const sql = `
      INSERT INTO orderpackage (orderId, packageId, qty) 
      VALUES (?, ?, ?)
    `;
    const values = [processOrderId, packageId, qty || 1];

    connection.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error saving order package in transaction:', err);
        reject(err);
      } else {
        console.log(`Order package saved in transaction: ProcessOrderID=${processOrderId}, PackageID=${packageId}, Qty=${qty || 1}`);
        resolve(results.insertId);
      }
    });
  });
};

exports.createProcessOrderWithTransaction = (connection, processOrderData) => {
  return new Promise((resolve, reject) => {
    const {
      orderId,
      transactionId,
      paymentMethod,
      isPaid,
      amount,
      creditPaid,
      moneyPaid,
      status,
      reportStatus,
      sheduleDate // now belongs to processorders
    } = processOrderData;

    const formatPaymentMethod = (method) => {
      if (!method || typeof method !== 'string') return method;
      return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
    };

    const generateAndUploadQRCode = async (invNo) => {
      try {
        const qrCodeBuffer = await QRCode.toBuffer(invNo, {
          errorCorrectionLevel: 'H',
          type: 'png',
          width: 300,
          margin: 1
        });

        const qrCodeUrl = await uploadFileToS3(
          qrCodeBuffer,
          `qr-${invNo}.png`,
          'qrcodes/invoices'
        );

        return qrCodeUrl;
      } catch (error) {
        console.error('Error generating or uploading QR code:', error);
        throw error;
      }
    };

    // Generate the invoice number directly via the stored procedure, inline.
    connection.query('CALL `generate_invoice_number`(@new_inv_no)', [], (err) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query('SELECT @new_inv_no AS inv_no', [], (err2, results) => {
        if (err2) {
          reject(err2);
          return;
        }

        const invNo = results?.[0]?.inv_no;
        if (!invNo) {
          reject(new Error('Failed to generate invoice number.'));
          return;
        }

        generateAndUploadQRCode(invNo)
          .then(qrCodeUrl => {
            const formattedPaymentMethod = formatPaymentMethod(paymentMethod);

            let finalIsPaid = isPaid || 0;
            let finalAmount = amount;
            let finalMoneyPaid = parseFloat(moneyPaid) || 0;
            const finalCreditPaid = parseFloat(creditPaid) || 0;

            let finalPaymentMethod = formattedPaymentMethod;

            const normalizedMethod = formattedPaymentMethod
              ? formattedPaymentMethod.toLowerCase()
              : '';

            if (normalizedMethod === 'cash') {
              finalIsPaid = 0;
              finalAmount = 0;
              finalMoneyPaid = 0;
            } else if (normalizedMethod === 'card') {
              finalIsPaid = 1;
            }

            if (normalizedMethod !== 'cash' && finalCreditPaid > 0 && finalMoneyPaid === 0) {
              finalIsPaid = 1;
              finalPaymentMethod = 'Card';
            }

            const sql = `
              INSERT INTO processorders (
                orderId, invNo, transactionId, paymentMethod, 
                isPaid, amount, creditPaid, moneyPaid, status, reportStatus, qrCode, sheduleDate
              ) VALUES (?, @new_inv_no, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
              orderId,
              transactionId || null,
              finalPaymentMethod,
              finalIsPaid,
              finalAmount,
              finalCreditPaid,
              finalMoneyPaid,
              status || 'pending',
              reportStatus || null,
              qrCodeUrl,
              sheduleDate || null
            ];

            connection.query(sql, values, (err3, insertResults) => {
              if (err3) {
                if (err3.code === 'ER_DUP_ENTRY' && err3.message.includes('invNo')) {
                  exports.createProcessOrderWithTransaction(connection, processOrderData)
                    .then(resolve)
                    .catch(reject);
                } else {
                  console.error('Error creating process order in transaction:', err3);
                  reject(err3);
                }
              } else {
                resolve({
                  insertId: insertResults.insertId,
                  invNo: invNo,
                  qrCodeUrl: qrCodeUrl
                });
              }
            });
          })
          .catch(reject);
      });
    });
  });
};


exports.deductUserCreditWithTransaction = (connection, userId, creditPaid) => {
  return new Promise((resolve, reject) => {
    if (!creditPaid || creditPaid <= 0) {
      // Nothing to deduct
      return resolve({ deducted: 0 });
    }

    // Lock the row to avoid race conditions with concurrent orders
    const selectSql = `
      SELECT creditBalance FROM marketplaceusers 
      WHERE id = ? 
      FOR UPDATE
    `;

    connection.query(selectSql, [userId], (err, results) => {
      if (err) {
        console.error('Error fetching user credit balance:', err);
        return reject(err);
      }

      if (!results || results.length === 0) {
        return reject(new Error("User not found for credit deduction"));
      }

      const currentBalance = parseFloat(results[0].creditBalance) || 0;

      if (creditPaid > currentBalance) {
        return reject(new Error("Insufficient credit balance"));
      }

      const newBalance = Math.round((currentBalance - creditPaid) * 100) / 100;

      const updateSql = `
        UPDATE marketplaceusers 
        SET creditBalance = ? 
        WHERE id = ?
      `;

      connection.query(updateSql, [newBalance, userId], (updateErr) => {
        if (updateErr) {
          console.error('Error deducting credit balance:', updateErr);
          return reject(updateErr);
        }

        resolve({ deducted: creditPaid, newBalance });
      });
    });
  });
};

exports.clearCart = (cartId) => {
  return new Promise((resolve, reject) => {

    const deleteAdditionalItemsSql = `DELETE FROM cartadditionalitems WHERE cartId = ?`;
    collectionofficer.query(deleteAdditionalItemsSql, [cartId], (err) => {
      if (err) {
        console.error('Error deleting cart additional items:', err);
        reject(err);
        return;
      }


      const deletePackagesSql = `DELETE FROM cartpackage WHERE cartId = ?`;
      collectionofficer.query(deletePackagesSql, [cartId], (err) => {
        if (err) {
          console.error('Error deleting cart packages:', err);
          reject(err);
          return;
        }

        const deleteCartSql = `DELETE FROM cart WHERE id = ?`;
        collectionofficer.query(deleteCartSql, [cartId], (err, results) => {
          if (err) {
            console.error('Error deleting cart:', err);
            reject(err);
          } else {
            resolve(results.affectedRows > 0);
          }
        });
      });
    });
  });
};

exports.getOrderById = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT o.*, po.paymentMethod, po.status as paymentStatus, po.isPaid
      FROM orders o
      LEFT JOIN processorders po ON o.id = po.orderId
      WHERE o.id = ?
    `;
    const values = [orderId];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error getting order by ID:', err);
        reject(err);
      } else {
        resolve(results[0] || null);
      }
    });
  });
};

exports.getOrdersByUserId = (userId, limit = 10, offset = 0) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT o.*, po.paymentMethod, po.status as paymentStatus, po.isPaid
      FROM orders o
      LEFT JOIN processorders po ON o.id = po.orderId
      WHERE o.userId = ?
      ORDER BY o.createdAt DESC
      LIMIT ? OFFSET ?
    `;
    const values = [userId, limit, offset];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error getting orders by user ID:', err);
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

exports.updateOrderStatus = (orderId, status) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE processorders 
      SET status = ? 
      WHERE orderId = ?
    `;
    const values = [status, orderId];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error updating order status:', err);
        reject(err);
      } else {
        resolve(results.affectedRows > 0);
      }
    });
  });
};

exports.updatePaymentStatus = (orderId, isPaid, transactionId = null) => {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE processorders 
      SET isPaid = ?, transactionId = ? 
      WHERE orderId = ?
    `;
    const values = [isPaid, transactionId, orderId];

    collectionofficer.query(sql, values, (err, results) => {
      if (err) {
        console.error('Error updating payment status:', err);
        reject(err);
      } else {
        resolve(results.affectedRows > 0);
      }
    });
  });
};

exports.getPickupCenters = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        dc.id as centerId,
        dc.centerName,
        dc.longitude,
        dc.latitude,
        dc.city,
        dc.district,
        dc.province,
        dc.country
      FROM distributedcenter dc
      WHERE dc.longitude IS NOT NULL 
        AND dc.latitude IS NOT NULL 
        AND dc.centerName IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM distributedcompanycenter dcc
          INNER JOIN centerowncity coc ON coc.companyCenterId = dcc.id
          WHERE dcc.centerId = dc.id
        )
      ORDER BY dc.centerName ASC
    `;

    collectionofficer.query(query, (error, results) => {
      if (error) {
        console.error('Error fetching pickup centers:', error);
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getNearestCitiesDao = () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        dc.id,
        dc.city,
        dc.charge,
        coc.companyCenterId AS companycenterId,
        dc.createdAt
      FROM deliverycharge dc
      INNER JOIN centerowncity coc ON dc.id = coc.cityId
      ORDER BY dc.city ASC
    `;

    collectionofficer.query(sql, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

// Sum of amount from all orders (delivery or pickup) that were successfully
// completed by this user — used to determine their cash-payment limit tier.
exports.getUserCompletedOrdersTotal = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT COALESCE(SUM(po.amount), 0) AS totalAmount
      FROM processorders po
      INNER JOIN orders o ON o.id = po.orderId
      WHERE o.userId = ?
        AND po.status IN ('Delivered', 'Picked Up')
    `;

    collectionofficer.query(sql, [userId], (err, results) => {
      if (err) {
        console.error('Error getting user completed orders total:', err);
        reject(err);
      } else {
        resolve(parseFloat(results[0].totalAmount) || 0);
      }
    });
  });
};