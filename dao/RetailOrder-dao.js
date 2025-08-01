const {
  plantcare,
  collectionofficer,
  marketPlace,
  dash,
} = require("../startup/database");


exports.getRetailCartDao = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT 
            RC.packageId,
            RC.packageItemId,
            RC.productId,
            RC.unit,
            RC.qty,
            RC.isPackage,
            MP.displayName AS packageName,
            MPI.displayName AS productName,
            MPI.normalPrice AS productPrice,
            MPI.discountedPrice AS productDiscountedPrice,
            MPI.discount as productDiscount,
            PD.quantity AS packageQuantity,
            PD.quantityType AS packageQuantityType,
            PD.price AS packagePrice,
            PD.discount AS packageDiscount,
            PD.discountedPrice AS packageDiscountedPrice
        FROM retailcart RC
        LEFT JOIN marketplacepackages MP ON RC.packageId = MP.id
        LEFT JOIN packagedetails PD ON RC.packageItemId = PD.id
        LEFT JOIN marketplaceitems MPI ON RC.productId = MPI.id
        WHERE RC.userId = ?
    `;

    marketPlace.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        console.log("getRetailCartDao raw results", results);

        // Transform the results into the desired format
        const formattedResults = [];
        const additionalItems = {
          packageName: "Additional Items",
          amountPackage: 0,
          Items: []
        };

        // First process packages
        const packageMap = new Map();

        results.forEach(item => {
          if (item.isPackage === 1) {
            if (!packageMap.has(item.packageId)) {
              // Calculate package amount based on your rules
              let packageAmount = 0;

              if (item.qty == item.packageQuantity) {
                // If quantity matches package quantity, use package price minus discount
                packageAmount = (item.packagePrice - (item.packageDiscount || 0));
              } else {
                // Otherwise calculate based on product prices
                const pricePerUnit = (item.productDiscountedPrice || item.productPrice);
                packageAmount = item.qty * pricePerUnit;
              }

              packageMap.set(item.packageId, {
                packageName: item.packageName,
                packageId: item.packageId,
                amountPackage: packageAmount,
                Items: []
              });
            }

            const packageObj = packageMap.get(item.packageId);
            packageObj.Items.push({
              packageItemId: item.packageItemId,
              productId: item.productId,
              unit: item.unit,
              qty: item.qty,
              productName: item.productName,
              productPrice: item.productPrice,
              productDiscountedPrice: item.productDiscountedPrice,
              productDiscount: item.productDiscount,
              packageQuantity: item.packageQuantity,
              packageQuantityType: item.packageQuantityType,
              packagePrice: item.packagePrice,
              packageDiscount: item.packageDiscount,
              packageDiscountedPrice: item.packageDiscountedPrice
            });
          } else {
            // Calculate amount for additional items
            const itemAmount = item.qty * (item.productDiscountedPrice || item.productPrice);

            additionalItems.Items.push({
              productId: item.productId,
              unit: item.unit,
              qty: item.qty,
              productName: item.productName,
              productPrice: item.productPrice,
              productDiscountedPrice: item.productDiscountedPrice,
              productDiscount: item.productDiscount
            });

            additionalItems.amountPackage += itemAmount;
          }
        });

        // Add packages to formatted results
        packageMap.forEach(pkg => {
          formattedResults.push(pkg);
        });

        // Add additional items if any
        if (additionalItems.Items.length > 0) {
          formattedResults.push(additionalItems);
        }

        console.log("Formatted cart data:", JSON.stringify(formattedResults, null, 2));
        resolve(formattedResults);
      }
    });
  });
};




const getRetailOrderHistoryDao = async (userId) => {
  return new Promise((resolve, reject) => {
    if (!userId) {
      return reject('Invalid userId');
    }

    const orderQuery = `
      SELECT 
        po.id AS orderId,
        o.sheduleDate AS scheduleDate,
        o.createdAt AS createdAt,
        o.sheduleTime AS scheduleTime,
        o.delivaryMethod AS delivaryMethod,
        o.discount AS orderDiscount,
        o.fulltotal AS fullTotal,
        po.invNo AS invoiceNo,
        po.status AS processStatus
      FROM orders o
      LEFT JOIN (
        SELECT *
        FROM processorders
        WHERE id IN (
          SELECT MAX(id)
          FROM processorders
          GROUP BY orderId
        )
      ) po ON o.id = po.orderId
      WHERE o.userId = ?
      ORDER BY o.createdAt DESC
    `;

    const familyPackItemsQuery = `
      SELECT 
        op.id,
        mp.productPrice AS amount
      FROM orderpackage op
      JOIN marketplacepackages mp ON op.packageId = mp.id
      WHERE op.orderId = ?
    `;

    const additionalItemsQuery = `
      SELECT
        oai.price AS unitPrice,
        oai.qty AS quantity,
        (oai.price * oai.qty) AS amount,
        oai.discount AS itemDiscount
      FROM orderadditionalitems oai
      JOIN marketplaceitems mi ON oai.productId = mi.id
      WHERE oai.orderId = ?
    `;

    marketPlace.query(orderQuery, [userId], async (err, orders) => {
      if (err) {
        return reject("Error fetching retail order history: " + err);
      }

      try {
        const normalizedOrders = await Promise.all(
          orders.map(async (order) => {
            // (Optional) Keep the below two fetches in case you want item breakdown later
            const familyPackItems = await new Promise((res, rej) => {
              marketPlace.query(familyPackItemsQuery, [order.orderId], (err, items) => {
                if (err) return rej("Family pack query error: " + err);
                res(items || []);
              });
            });

            const additionalItems = await new Promise((res, rej) => {
              marketPlace.query(additionalItemsQuery, [order.orderId], (err, items) => {
                if (err) return rej("Additional items query error: " + err);
                res(items || []);
              });
            });

            // ✅ Use fullTotal directly from DB
            const fullTotal = parseFloat(order.fullTotal || 0).toFixed(2);

            return {
              orderId: String(order.orderId) || 'N/A',
              invoiceNo: order.invoiceNo ? String(order.invoiceNo) : 'N/A',
              scheduleDate: order.scheduleDate || 'N/A',
              scheduleTime: order.scheduleTime || 'N/A',
              delivaryMethod: order.delivaryMethod || 'N/A',
              fullTotal: `Rs. ${fullTotal}`,
              createdAt: order.createdAt || 'N/A',
              processStatus: order.processStatus || 'Pending',
            };
          })
        );

        resolve(normalizedOrders);
      } catch (err) {
        reject("Error processing order totals: " + err);
      }
    });
  });
};


exports.insertHomeDeliveryDetails = (addressData) => {
  return new Promise((resolve, reject) => {
    const sql = `
          INSERT INTO homedeliverydetails (buildingType, houseNo, street, city, buildingName, buildingNo, flatNo, floorNo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
    const values = [
      addressData.buildingType,
      addressData.houseNo,
      addressData.street,
      addressData.city,
      addressData.buildingName,
      addressData.buildingNo,
      addressData.flatNo,
      addressData.floorNo
    ];
    marketPlace.query(sql, values, (err, result) => {
      if (err) return reject(err);
      resolve(result); // result.insertId contains the new ID
    });
  });
};

exports.insertRetailOrder = (data) => {
  return new Promise((resolve, reject) => {
    const sql = `
          INSERT INTO retailorder (
              userId, fullName, delivaryMethod, centerId, homedeliveryId,
              title, phonecode1, phone1, phonecode2, phone2,
              isCoupon, couponValue, total, discount,
              sheduleType, sheduleDate, sheduleTime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
    const values = [
      data.userId,
      data.fullName,
      data.deliveryMethod,
      data.centerId,
      data.homedeliveryId,
      data.title,
      data.phonecode1,
      data.phone1,
      data.phonecode2,
      data.phone2,
      data.isCoupon,
      data.couponValue,
      data.total,
      data.discount,
      data.scheduleType,
      data.scheduleDate,
      data.scheduleTime,
    ];
    marketPlace.query(sql, values, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};


const getLastAddress = (userId) => {
  return new Promise((resolve, reject) => {

    const userQuery = `
        SELECT 
                id as userId,
                buildingType,
                title,
                CONCAT(firstName, ' ', lastName) as fullName,
                phoneNumber as phone1,
                phoneNumber2 as phone2,
                phoneCode as phonecode1,
                phoneCode2 as phonecode2
              FROM marketplaceusers
              WHERE id = ?
            `;

    marketPlace.query(userQuery, [userId], (err, userResults) => {
      if (err) {
        return reject(err);
      }

      if (userResults.length === 0) {
        return resolve(null); // No user found
      }

      const userData = userResults[0];

      // Fetch address details based on building type
      if (userData.buildingType === 'Apartment') {
        const apartmentQuery = `
          SELECT 
            buildingNo,
            buildingName,
            unitNo,
            floorNo,
            houseNo,
            streetName,
            city
          FROM apartment
          WHERE customerId = ?
          ORDER BY id DESC
          LIMIT 1
        `;

        marketPlace.query(apartmentQuery, [userId], (err, apartmentResults) => {
          if (err) {
            return reject(err);
          }

          const addressData = apartmentResults.length > 0 ? apartmentResults[0] : {};
          
          const result = {
            buildingType: userData.buildingType,
            title: userData.title,
            fullName: userData.fullName,
            phone1: userData.phone1,
            phone2: userData.phone2,
            phonecode1: userData.phonecode1,
            phonecode2: userData.phonecode2,
            buildingNo: addressData.buildingNo || '',
            buildingName: addressData.buildingName || '',
            unitNo: addressData.unitNo || '',
            floorNo: addressData.floorNo || '',
            houseNo: addressData.houseNo || '',
            streetName: addressData.streetName || '',
            city: addressData.city || ''
          };

          resolve(result);
        });

      } else if (userData.buildingType === 'House') {
        const houseQuery = `
          SELECT 
            houseNo,
            streetName,
            city
          FROM house
          WHERE customerId = ?
          ORDER BY id DESC
          LIMIT 1
        `;

        marketPlace.query(houseQuery, [userId], (err, houseResults) => {
          if (err) {
            return reject(err);
          }

          const addressData = houseResults.length > 0 ? houseResults[0] : {};
          
          const result = {
            buildingType: userData.buildingType,
            title: userData.title,
            fullName: userData.fullName,
            phone1: userData.phone1,
            phone2: userData.phone2,
            phonecode1: userData.phonecode1,
            phonecode2: userData.phonecode2,
            houseNo: addressData.houseNo || '',
            streetName: addressData.streetName || '',
            city: addressData.city || '',
            // Set apartment fields as empty for house type
            buildingNo: '',
            buildingName: '',
            unitNo: '',
            floorNo: ''
          };

          resolve(result);
        });

      } else {
        // Unknown building type or no building type set, return basic user data
        const result = {
          buildingType: userData.buildingType || 'Apartment',
          title: userData.title,
          fullName: userData.fullName,
          phone1: userData.phone1,
          phone2: userData.phone2,
          phonecode1: userData.phonecode1,
          phonecode2: userData.phonecode2,
          buildingNo: '',
          buildingName: '',
          unitNo: '',
          floorNo: '',
          houseNo: '',
          streetName: '',
          city: ''
        };

        resolve(result);
      }
    });
  });
};




// exports.insertHomeDeliveryDetails = (addressData) => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//           INSERT INTO homedeliverydetails (buildingType, houseNo, street, city, buildingName, buildingNo, flatNo, floorNo)
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//       `;
//     const values = [
//       addressData.buildingType,
//       addressData.houseNo,
//       addressData.street,
//       addressData.city,
//       addressData.buildingName,
//       addressData.buildingNo,
//       addressData.flatNo,
//       addressData.floorNo
//     ];
//     marketPlace.query(sql, values, (err, result) => {
//       if (err) return reject(err);
//       resolve(result); // result.insertId contains the new ID
//     });
//   });
// };

// exports.insertRetailOrder = (data) => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//           INSERT INTO retailorder (
//               userId, fullName, delivaryMethod, centerId, homedeliveryId,
//               title, phonecode1, phone1, phonecode2, phone2,
//               isCoupon, couponValue, total, discount,
//               sheduleType, sheduleDate, sheduleTime
//           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `;
//     const values = [
//       data.userId,
//       data.fullName,
//       data.deliveryMethod,
//       data.centerId,
//       data.homedeliveryId,
//       data.title,
//       data.phonecode1,
//       data.phone1,
//       data.phonecode2,
//       data.phone2,
//       data.isCoupon,
//       data.couponValue,
//       data.total,
//       data.discount,
//       data.scheduleType,
//       data.scheduleDate,
//       data.scheduleTime,
//     ];
//     marketPlace.query(sql, values, (err, result) => {
//       if (err) return reject(err);
//       resolve(result);
//     });
//   });
// };

// const getCheckOutDao = () => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//     SELECT o.userId, o.orderApp, o.buildingType, o.title, o.fullName, o.phone1, o.phone2, o.createdAt,
//         o.phonecode1, o.phonecode2, 
//         oh.houseNo, oh.streetName, oh.city,
//         oa.buildingName, oa.buildingNo, oa.unitNo, oa.floorNo, oa.houseNo, oa.streetName, oa.city
//     FROM market_place.orders o
//     LEFT JOIN market_place.orderhouse oh ON o.id = oh.orderId
//     LEFT JOIN market_place.orderapartment oa ON o.id = oa.orderId
//     WHERE o.orderApp = 'MobileApp' AND o.delivaryMethod = 'HomeDelivery'
//     ORDER BY o.createdAt DESC
//     LIMIT 1
//     `;

//     marketPlace.query(sql, (err, results) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(results[0]); // return just the latest record
//         console.log(results[0])
//       }
//     });
//   });
// };




const getRetailOrderByIdDao = async (orderId, userId) => {
  return new Promise((resolve, reject) => {
    if (!orderId || !userId) {
      return reject("Invalid orderId or userId");
    }

    const orderSql = `
      SELECT 
        o.*, 
        p.status AS processStatus,
        p.invNo AS invoiceNo,  
        CASE 
          WHEN o.delivaryMethod = 'PICKUP' THEN 'PICKUP'
          WHEN o.delivaryMethod = 'DELIVERY' THEN 'DELIVERY'
          ELSE 'UNKNOWN'
        END AS deliveryType
      FROM orders o
      LEFT JOIN processorders p ON o.id = p.orderId
      
      WHERE p.id = ? AND o.userId = ?
    `;

    const houseSql = `SELECT * FROM orderhouse WHERE orderId = ?`;
    const apartmentSql = `SELECT * FROM orderapartment WHERE orderId = ?`;

    marketPlace.query(orderSql, [orderId, userId], (err, orders) => {
      if (err) return reject("Error fetching order: " + err);
      if (!orders || orders.length === 0) return reject("Order not found or unauthorized");

      const order = orders[0];

      // Handle Pickup Delivery
      if (order.deliveryType === 'PICKUP') {
        const pickupSql = `SELECT * FROM distributedcenter WHERE id = ?`;

        collectionofficer.query(pickupSql, [order.centerId], (err, centers) => {
          if (err) return reject("Error fetching distributed center: " + err);
          if (!centers || centers.length === 0) return reject("Distributed center not found");

          const center = centers[0];

          order.pickupInfo = {
            centerId: center.id,
            centerName: center.centerName || center.name || "Unknown",
            contact01: center.contact01 || center.phone || "Not Available",
            address: {
              street: center.street || "",
              city: center.city || "",
              district: center.district || "",
              province: center.province || "",
              country: center.country || "",
              zipCode: center.zipCode || ""
            },
            pickupPerson: {
              fullName: order.fullName || "Not specified",
              phoneCode: order.phoneCode || "+94", // fallback default
              phone1: order.phone1 || "Not provided",
              phone2: order.phone2 || "Not provided"
            }
          };

          return resolve(order);
        });

        // Handle Delivery
      } else if (order.deliveryType === 'DELIVERY') {
        if (order.buildingType === 'House') {
          marketPlace.query(houseSql, [order.id], (err, result) => {
            if (err) return reject("Error fetching house delivery: " + err);
            if (!result || result.length === 0) return reject("House delivery address not found");

            order.deliveryInfo = {
              buildingType: 'House',
              ...result[0]
            };
            return resolve(order);
          });

        } else if (order.buildingType === 'Apartment') {
          marketPlace.query(apartmentSql, [order.id], (err, result) => {
            if (err) return reject("Error fetching apartment delivery: " + err);
            if (!result || result.length === 0) return reject("Apartment delivery address not found");

            order.deliveryInfo = {
              // Delivery address from homedeliverydetails
              buildingType: deliveryDetails.buildingType || 'N/A',
              houseNo: deliveryDetails.houseNo || 'N/A',
              street: deliveryDetails.street || 'N/A',
              city: deliveryDetails.city || 'N/A',
              buildingNo: deliveryDetails.buildingNo || 'N/A',
              buildingName: deliveryDetails.buildingName || 'N/A',
              flatNo: deliveryDetails.flatNo || 'N/A',
              floorNo: deliveryDetails.floorNo || 'N/A',
              // Receiving person information from retailorder
              fullName: order.fullName || 'N/A',
              phone: order.phone1
                ? `+${order.phonecode1 || ''} ${order.phone1}`
                : order.userPhoneNumber
                  ? `+${order.userPhoneCode || ''} ${order.userPhoneNumber}`
                  : 'N/A', // Use retailorder phone, fallback to marketplaceusers
            };
            // Debug log to check deliveryInfo
            console.log('deliveryInfo at 03:40 PM +0530, May 27, 2025:', order.deliveryInfo);
            // Remove the old deliveryAddress field to avoid redundancy
            delete order.deliveryAddress;
            resolve(order);
          });

        } else {
          return reject("Invalid buildingType for delivery");
        }

      } else {
        return resolve(order); // Unknown delivery method
      }
    });
  });
};

const getOrderPackageDetailsDao = async (orderId) => {
  return new Promise((resolve, reject) => {
    if (!orderId) {
      return reject(new Error("Invalid orderId"));
    }

    const sql = `
      SELECT 
        op.id AS orderPackageId,    -- unique row for each package instance in the order
        op.packageId,
        mp.displayName,
         (mp.productPrice + mp.packingFee + mp.serviceFee) AS productPrice,
        pd.qty AS itemQty,
        pt.typeName
      FROM orderpackage op
      JOIN marketplacepackages mp ON op.packageId = mp.id
      JOIN packagedetails pd ON mp.id = pd.packageId
      JOIN producttypes pt ON pd.productTypeId = pt.id
      WHERE op.orderId = ?
      ORDER BY op.id
    `;

    marketPlace.query(sql, [orderId], (err, results) => {
      if (err) {
        return reject(new Error("Database error: " + err.message));
      }

      // Group by unique orderpackage row (orderPackageId)
      const groupedPackages = {};

      results.forEach(row => {
        const key = row.orderPackageId; // unique per package occurrence

        if (!groupedPackages[key]) {
          groupedPackages[key] = {
            packageId: row.packageId,
            displayName: row.displayName,
            productPrice: parseFloat(row.productPrice || '0'),
            products: []
          };
        }

        groupedPackages[key].products.push({
          typeName: row.typeName,
          qty: parseInt(row.itemQty || '1')
        });
      });

      // Convert grouped map to array, format output
      const packages = Object.values(groupedPackages).map(pack => ({
        packageId: pack.packageId,
        displayName: pack.displayName,
        productPrice: `Rs. ${pack.productPrice.toFixed(2)}`,
        products: pack.products.map(p => ({
          typeName: p.typeName,
          qty: String(p.qty).padStart(2, '0'),
        }))
      }));

      resolve(packages);
    });
  });
};



const getOrderAdditionalItemsDao = async (orderId) => {
  return new Promise((resolve, reject) => {
    if (!orderId) {
      return reject(new Error("Invalid orderId"));
    }

    const sql = `
      SELECT
        oai.qty,
        oai.unit,
        mi.discountedprice As price,
        oai.discount,
        mi.displayName,
        pc.image
      FROM orderadditionalitems oai
      JOIN marketplaceitems mi ON oai.productId = mi.id
      JOIN (
        SELECT cropGroupId, MIN(image) AS image
        FROM plant_care.cropvariety
        GROUP BY cropGroupId
      ) pc ON mi.varietyId = pc.cropGroupId
      WHERE oai.orderId = (SELECT orderId From processorders WHERE id = ?)
    `;

    marketPlace.query(sql, [orderId], (err, results) => {
      if (err) {
        return reject(new Error("Database error: " + err.message));
      }
      resolve(results);
    });
  });
};



const getRetailOrderInvoiceByIdDao = async (orderId, userId) => {
  return new Promise((resolve, reject) => {
    if (!orderId || !userId) {
      return reject('Invalid orderId or userId');
    }

    const invoiceQuery = `
      SELECT 
        o.id AS orderId,
        o.centerId,
        o.delivaryMethod AS deliveryMethod,
        o.discount AS orderDiscount,
        o.createdAt AS invoiceDate,
        o.sheduleDate AS scheduledDate,
        o.buildingType,
        o.fulltotal AS fullTotal,
        po.invNo AS invoiceNumber,
        po.paymentMethod AS paymentMethod
      FROM orders o
      LEFT JOIN processorders po ON o.id = po.orderId
      WHERE po.id = ? AND o.userId = ?
    `;

    const familyPackItemsQuery = `
      SELECT 
        op.id,
        mp.id AS packageId,
        mp.displayName AS name,
        mp.productPrice,
        mp.packingFee,
        mp.serviceFee,
        (mp.productPrice + mp.packingFee + mp.serviceFee) AS unitPrice,
        1 AS quantity,
        (mp.productPrice + mp.packingFee + mp.serviceFee) AS amount
      FROM orderpackage op
      JOIN marketplacepackages mp ON op.packageId = mp.id
      WHERE op.orderId = ?
    `;

    const additionalItemsQuery = `
      SELECT
        oai.id,
        mi.displayName AS name,
        oai.unit, 
        mi.discountedprice AS unitPrice,
        oai.qty AS quantity,
        (oai.price) AS amount,
        oai.discount AS itemDiscount,
        pc.image AS image
      FROM orderadditionalitems oai
      JOIN marketplaceitems mi ON oai.productId = mi.id
      JOIN (
        SELECT cropGroupId, MIN(image) AS image
        FROM plant_care.cropvariety
        GROUP BY cropGroupId
      ) pc ON mi.varietyId = pc.cropGroupId
      WHERE oai.orderId = (SELECT orderId FROM processorders WHERE id = ?)
    `;

    const billingQuery = `
      SELECT 
        o.title,
        o.fullName,
        o.phoneCode1,
        o.phone1,
        o.buildingType,
        COALESCE(oh.houseNo, oa.houseNo, 'N/A') AS houseNo,
        COALESCE(oh.streetName, oa.streetName, 'N/A') AS street,
        COALESCE(oh.city, oa.city, 'N/A') AS city
      FROM orders o
      LEFT JOIN orderhouse oh ON o.id = oh.orderId
      LEFT JOIN orderapartment oa ON o.id = oa.orderId
      WHERE o.id = (SELECT orderId FROM processorders WHERE id = ?) AND o.userId = ?
      LIMIT 1
    `;

    const pickupCenterQuery = `SELECT * FROM distributedcenter WHERE id = ?`;

    const deliveryChargeQuery = `SELECT charge FROM deliverycharge WHERE LOWER(city) LIKE LOWER(?)`;

    const packageDetailsQuery = `
      SELECT 
        pd.packageId,
        pt.id AS productTypeId,
        pt.typeName,
        pd.qty
      FROM packagedetails pd
      JOIN producttypes pt ON pd.productTypeId = pt.id
      WHERE pd.packageId = ?
    `;

    marketPlace.query(invoiceQuery, [orderId, userId], (err, invoiceResult) => {
      if (err) return reject("Invoice query error: " + err);
      if (!invoiceResult || invoiceResult.length === 0) return resolve(null);

      const invoice = invoiceResult[0];

      marketPlace.query(familyPackItemsQuery, [orderId], (err, familyPackItems) => {
        if (err) return reject("Family pack query error: " + err);

        marketPlace.query(additionalItemsQuery, [orderId], (err, additionalItems) => {
          if (err) return reject("Additional items query error: " + err);

          marketPlace.query(billingQuery, [orderId, userId], (err, billingResult) => {
            if (err) return reject("Billing query error: " + err);

            const billingInfo = billingResult[0] || {};
            const isPickup = (invoice.deliveryMethod || '').toUpperCase() === 'PICKUP';

            const hasDeliveryItems =
              (Array.isArray(familyPackItems) && familyPackItems.length > 0) ||
              (Array.isArray(additionalItems) && additionalItems.length > 0);

            const fetchDeliveryCharge = !isPickup && hasDeliveryItems
              ? new Promise((res) => {
                  if (!billingInfo.city || billingInfo.city === 'N/A') {
                    return res('50.00'); // default fallback
                  }
                  collectionofficer.query(deliveryChargeQuery, [`%${billingInfo.city}%`], (err, chargeResult) => {
                    if (err || !chargeResult || chargeResult.length === 0) {
                      return res('50.00');
                    }
                    const charge = parseFloat(chargeResult[0].charge || 50.00).toFixed(2);
                    res(charge);
                  });
                })
              : Promise.resolve('0.00');

            const fetchPickupInfo = isPickup && invoice.centerId
              ? new Promise((res) => {
                  collectionofficer.query(pickupCenterQuery, [invoice.centerId], (err, centers) => {
                    if (err || !centers || centers.length === 0) {
                      return res(null);
                    }
                    const center = centers[0];
                    res({
                      centerId: center.id,
                      centerName: center.centerName || center.name || "Unknown",
                      contact01: center.contact01 || center.phone || "Not Available",
                      address: {
                        street: center.street || "",
                        city: center.city || "",
                        district: center.district || "",
                        province: center.province || "",
                        country: center.country || "",
                        zipCode: center.zipCode || ""
                      }
                    });
                  });
                })
              : Promise.resolve(null);

            const packageDetailsMap = {};
            const fetchPackageDetails = Array.isArray(familyPackItems)
              ? familyPackItems.map(item => {
                  return new Promise((res, rej) => {
                    marketPlace.query(packageDetailsQuery, [item.packageId], (err, details) => {
                      if (err) return rej("Package details query error: " + err);
                      packageDetailsMap[item.id] = details || [];
                      res();
                    });
                  });
                })
              : [];

            Promise.all([...fetchPackageDetails, fetchDeliveryCharge, fetchPickupInfo])
              .then((results) => {
                const deliveryFee = results[fetchPackageDetails.length];
                const pickupInfo = results[fetchPackageDetails.length + 1];

                const familyPackTotal = Array.isArray(familyPackItems)
                  ? familyPackItems.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toFixed(2)
                  : '0.00';

                const additionalItemsTotal = Array.isArray(additionalItems)
                  ? additionalItems.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toFixed(2)
                  : '0.00';

                const additionalItemsDiscount = Array.isArray(additionalItems)
                  ? additionalItems.reduce((sum, item) => sum + parseFloat(item.itemDiscount || 0), 0).toFixed(2)
                  : '0.00';

                const orderDiscount = parseFloat(invoice.orderDiscount || 0).toFixed(2);

                const invoiceData = {
                  invoiceNumber: invoice.invoiceNumber || `INV-${new Date(invoice.invoiceDate).getFullYear()}-${String(orderId).padStart(3, '0')}`,
                  invoiceDate: invoice.invoiceDate || 'N/A',
                  scheduledDate: invoice.scheduledDate || 'N/A',
                  deliveryMethod: invoice.deliveryMethod || 'N/A',
                  paymentMethod: invoice.paymentMethod || 'N/A',
                  amountDue: `Rs. ${parseFloat(invoice.fullTotal || 0).toFixed(2)}`,
                  familyPackItems: Array.isArray(familyPackItems)
                    ? familyPackItems.map(item => ({
                        id: item.id,
                        name: item.name || "Family Pack",
                        unitPrice: `Rs. ${parseFloat(item.unitPrice || 0).toFixed(2)}`,
                        quantity: String(item.quantity || 1).padStart(2, '0'),
                        amount: `Rs. ${parseFloat(item.amount || 0).toFixed(2)}`,
                        packageDetails: packageDetailsMap[item.id] || []
                      }))
                    : [],
                  additionalItems: Array.isArray(additionalItems)
                    ? additionalItems.map(item => ({
                        id: item.id,
                        name: item.name || "Unknown",
                        unit: item.unit || "Unknown",
                        unitPrice: `Rs. ${parseFloat(item.unitPrice || 0).toFixed(2)}`,
                        quantity: String(item.quantity || 0).padStart(2, '0'),
                        amount: `Rs. ${parseFloat(item.amount || 0).toFixed(2)}`,
                        image: item.image || null
                      }))
                    : [],
                  familyPackTotal: `Rs. ${familyPackTotal}`,
                  additionalItemsTotal: `Rs. ${additionalItemsTotal}`,
                  deliveryFee: `Rs. ${deliveryFee || '0.00'}`,
                  discount: `Rs. ${orderDiscount}`, // Fetch discount directly from orders table
                  grandTotal: `Rs. ${parseFloat(invoice.fullTotal || 0).toFixed(2)}`,
                  billingInfo: {
                    title: billingInfo.title || "N/A",
                    fullName: billingInfo.fullName || "N/A",
                    buildingType: billingInfo.buildingType || "N/A",
                    houseNo: billingInfo.houseNo || "N/A",
                    street: billingInfo.street || "N/A",
                    city: billingInfo.city || "N/A",
                    phone: billingInfo.phone1
                      ? `+${billingInfo.phoneCode1 || ''} ${billingInfo.phone1}`
                      : "N/A"
                  },
                  pickupInfo: pickupInfo
                };

                resolve({ status: true, invoice: invoiceData });
              })
              .catch(err => reject(err));
          });
        });
      });
    });
  });
};

// const getCheckOutDao = async(userId) => {
//   return new Promise((resolve, reject) => {
//     // First, get the most recent order for the user
//     const getOrderSql = `
//       SELECT id, userId, orderApp, buildingType, title, fullName, 
//              phone1, phone2, phonecode1, phonecode2, createdAt
//       FROM orders 
//       WHERE userId = ? 
//       ORDER BY createdAt DESC 
//       LIMIT 1
//     `;

//     marketPlace.query(getOrderSql, [userId], (err, orderResults) => {
//       if (err) {
//         console.error('Error fetching order:', err);
//         reject(err);
//         return;
//       }

//       if (orderResults.length === 0) {
//         resolve(null);
//         return;
//       }

//       const order = orderResults[0];
//       const orderId = order.id;

//       // Check building type and get address accordingly
//       if (order.buildingType === 'House') {
//         const getHouseAddressSql = `
//           SELECT houseNo, streetName, city
//           FROM orderhouse 
//           WHERE orderId = ?
//         `;

//         marketPlace.query(getHouseAddressSql, [orderId], (err, houseResults) => {
//           if (err) {
//             console.error('Error fetching house address:', err);
//             reject(err);
//             return;
//           }

//           let result = { ...order };

//           if (houseResults.length > 0) {
//             result = {
//               ...result,
//               houseNo: houseResults[0].houseNo,
//               streetName: houseResults[0].streetName,
//               city: houseResults[0].city
//             };
//           }

//           resolve(result);
//         });

//       } else if (order.buildingType === 'Apartment') {
//         const getApartmentAddressSql = `
//           SELECT buildingNo, buildingName, unitNo, floorNo, 
//                  houseNo, streetName, city
//           FROM orderapartment 
//           WHERE orderId = ?
//         `;

//         marketPlace.query(getApartmentAddressSql, [orderId], (err, apartmentResults) => {
//           if (err) {
//             console.error('Error fetching apartment address:', err);
//             reject(err);
//             return;
//           }

//           let result = { ...order };

//           if (apartmentResults.length > 0) {
//             result = {
//               ...result,
//               buildingNo: apartmentResults[0].buildingNo,
//               buildingName: apartmentResults[0].buildingName,
//               unitNo: apartmentResults[0].unitNo,
//               floorNo: apartmentResults[0].floorNo,
//               houseNo: apartmentResults[0].houseNo,
//               streetName: apartmentResults[0].streetName,
//               city: apartmentResults[0].city
//             };
//           }

//           resolve(result);
//         });

//       } else {
//         // For pickup or other delivery methods without address
//         resolve(order);
//       }
//     });
//   });
// };

const getCouponDetailsDao = async (coupon) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT *
      FROM coupon
      WHERE code LIKE ?
    `;

    marketPlace.query(sql, [coupon], (err, results) => {
      if (err) {
        return reject(new Error("Database error: " + err.message));
      }
      resolve(results[0] || null);
    });
  });
};



// Export the DAO
module.exports = {
  getRetailOrderByIdDao,
  getRetailOrderHistoryDao,
  getRetailOrderInvoiceByIdDao,
  getOrderPackageDetailsDao, // Include the existing function
  getOrderAdditionalItemsDao,
  getLastAddress,
  getCouponDetailsDao
};

