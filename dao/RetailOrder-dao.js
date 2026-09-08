const {
  plantcare,
  collectionofficer,
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

    collectionofficer.query(sql, [userId], (err, results) => {
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

const getRetailOrderHistoryDao = async (userId, filter, page = 1, limit = 10) => {
  return new Promise((resolve, reject) => {
    if (!userId) {
      return reject('Invalid userId');
    }

    let whereClause = ` WHERE o.userId = ?`;

    if (filter === 'this-week') {
      whereClause += ` AND o.createdAt >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) 
                      AND o.createdAt < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)`;
    } else if (filter === 'last-week') {
      whereClause += ` AND o.createdAt >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)
                      AND o.createdAt < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
    } else if (filter === 'last-2-weeks') {
      whereClause += ` AND o.createdAt >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 14 DAY)
                      AND o.createdAt < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`;
    } else if (filter === 'this-month') {
      whereClause += ` AND o.createdAt >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                      AND o.createdAt < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`;
    } else if (filter === 'last-3-months') {
      whereClause += ` AND o.createdAt >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 3 MONTH)
                      AND o.createdAt < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
    }

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM orders o
      LEFT JOIN processorders po ON o.id = po.orderId
      ${whereClause}
    `;

    const offset = (page - 1) * limit;

    const orderQuery = `
      SELECT 
        po.id AS orderId,
        po.sheduleDate AS scheduleDate,
        po.createdAt AS createdAt,
        o.sheduleTime AS scheduleTime,
        o.delivaryMethod AS delivaryMethod,
        o.discount AS orderDiscount,
        o.fulltotal AS fullTotal,
        po.invNo AS invoiceNo,
        po.status AS processStatus
      FROM orders o
      LEFT JOIN processorders po ON o.id = po.orderId
      ${whereClause}
      ORDER BY po.createdAt DESC
      LIMIT ? OFFSET ?
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

    // Step 1: Get total count
    collectionofficer.query(countQuery, [userId], (countErr, countResult) => {
      if (countErr) {
        return reject('Count query error: ' + countErr);
      }

      const total = countResult[0]?.total || 0;

      // Step 2: Get paginated orders
      collectionofficer.query(orderQuery, [userId, limit, offset], async (err, orders) => {
        if (err) {
          return reject('Error fetching retail order history: ' + err);
        }

        try {
          const normalizedOrders = await Promise.all(
            orders.map(async (order) => {
              const familyPackItems = await new Promise((res, rej) => {
                collectionofficer.query(familyPackItemsQuery, [order.orderId], (err, items) => {
                  if (err) return rej('Family pack query error: ' + err);
                  res(items || []);
                });
              });

              const additionalItems = await new Promise((res, rej) => {
                collectionofficer.query(additionalItemsQuery, [order.orderId], (err, items) => {
                  if (err) return rej('Additional items query error: ' + err);
                  res(items || []);
                });
              });

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

          resolve({
            orders: normalizedOrders,
            pagination: {
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit),
              hasMore: page * limit < total,
            },
          });
        } catch (processingErr) {
          reject('Error processing order totals: ' + processingErr);
        }
      });
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
    collectionofficer.query(sql, values, (err, result) => {
      if (err) return reject(err);
      resolve(result); // result.insertId contains the new ID
    });
  });
};


// check and remove this dao - Tharaka ---------------------------------------------------------
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
    collectionofficer.query(sql, values, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

//------------------------------------------------------------------------------------------

const getLastAddress = (userId) => {
  return new Promise((resolve, reject) => {

    const userQuery = `
        SELECT 
                id as userId,
                buildingType,
                billingTitle as title,
                billingName as fullName,
                billingPhone1 as phone1,
                billingPhone2 as phone2,
                billingPhoneCode1 as phonecode1,
                billingPhoneCode2 as phonecode2,
                longitude,
                latitude
              FROM marketplaceusers
              WHERE id = ?
            `;

    collectionofficer.query(userQuery, [userId], (err, userResults) => {
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

        collectionofficer.query(apartmentQuery, [userId], (err, apartmentResults) => {
          if (err) {
            return reject(err);
          }

          if (apartmentResults.length === 0) {
            return resolve(null); // No address found
          }

          const addressData = apartmentResults[0];

          const result = {
            buildingType: userData.buildingType,
            title: userData.title,
            fullName: userData.fullName,
            phone1: userData.phone1,
            phone2: userData.phone2,
            phonecode1: userData.phonecode1,
            phonecode2: userData.phonecode2,
            longitude: userData.longitude,
            latitude: userData.latitude,
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

        collectionofficer.query(houseQuery, [userId], (err, houseResults) => {
          if (err) {
            return reject(err);
          }

          if (houseResults.length === 0) {
            return resolve(null); // No address found
          }

          const addressData = houseResults[0];

          const result = {
            buildingType: userData.buildingType,
            title: userData.title,
            fullName: userData.fullName,
            phone1: userData.phone1,
            phone2: userData.phone2,
            phonecode1: userData.phonecode1,
            phonecode2: userData.phonecode2,
            longitude: userData.longitude,
            latitude: userData.latitude,
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
        // No building type set - return null as no address found
        return resolve(null);
      }
    });
  });
};

const getLatestOrderAddress = (userId) => {
  return new Promise((resolve, reject) => {
    const orderQuery = `
      SELECT 
        o.id as orderId,
        o.buildingType,
        o.title,
        o.fullName,
        o.phone1,
        o.phone2,
        o.phonecode1,
        o.phonecode2,
        o.longitude,
        o.latitude,
        o.createdAt,
        p.deliveredTime
      FROM orders o
      INNER JOIN processorders p ON p.orderId = o.id
      WHERE o.userId = ?
        AND o.delivaryMethod = 'Delivery'
        AND o.buildingType IN ('Apartment', 'House')
        AND p.status = 'Delivered'
      ORDER BY p.deliveredTime DESC, o.createdAt DESC
      LIMIT 1
    `;

    collectionofficer.query(orderQuery, [userId], (err, orderResults) => {
      if (err) return reject(err);
      if (orderResults.length === 0) return resolve(null);

      const orderData = orderResults[0];

      if (orderData.buildingType === 'Apartment') {
        const apartmentQuery = `
          SELECT saveAs, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city
          FROM orderapartment
          WHERE orderId = ?
          ORDER BY id DESC
          LIMIT 1
        `;
        collectionofficer.query(apartmentQuery, [orderData.orderId], (err, apartmentResults) => {
          if (err) return reject(err);
          if (apartmentResults.length === 0) return resolve(null);

          const addressData = apartmentResults[0];

          // Cross-check against the customer's CURRENT saved apartment addresses,
          // so the boolean reflects reality even if orderapartment.saveAs is stale/empty.
          const matchQuery = `
            SELECT saveAs FROM apartment
            WHERE customerId = ?
              AND buildingNo = ?
              AND buildingName = ?
              AND unitNo = ?
              AND floorNo = ?
              AND streetName = ?
              AND city = ?
            LIMIT 1
          `;
          collectionofficer.query(
            matchQuery,
            [
              userId,
              addressData.buildingNo || '',
              addressData.buildingName || '',
              addressData.unitNo || '',
              addressData.floorNo || '',
              addressData.streetName || '',
              addressData.city || '',
            ],
            (matchErr, matchResults) => {
              if (matchErr) return reject(matchErr);

              const matchedSaveAs = matchResults.length > 0 ? matchResults[0].saveAs : null;
              const isSavedAddress = !!matchedSaveAs || !!addressData.saveAs;

              resolve({
                orderId: orderData.orderId,
                buildingType: 'Apartment',
                saveAs: matchedSaveAs || addressData.saveAs || '',
                isSavedAddress,
                title: orderData.title,
                fullName: orderData.fullName,
                phone1: orderData.phone1,
                phone2: orderData.phone2,
                phonecode1: orderData.phonecode1,
                phonecode2: orderData.phonecode2,
                longitude: orderData.longitude,
                latitude: orderData.latitude,
                buildingNo: addressData.buildingNo || '',
                buildingName: addressData.buildingName || '',
                unitNo: addressData.unitNo || '',
                floorNo: addressData.floorNo || '',
                houseNo: addressData.houseNo || '',
                streetName: addressData.streetName || '',
                city: addressData.city || '',
              });
            }
          );
        });
      } else {
        const houseQuery = `
          SELECT saveAs, houseNo, streetName, city
          FROM orderhouse
          WHERE orderId = ?
          ORDER BY id DESC
          LIMIT 1
        `;
        collectionofficer.query(houseQuery, [orderData.orderId], (err, houseResults) => {
          if (err) return reject(err);
          if (houseResults.length === 0) return resolve(null);

          const addressData = houseResults[0];

          const matchQuery = `
            SELECT saveAs FROM house
            WHERE customerId = ?
              AND houseNo = ?
              AND streetName = ?
              AND city = ?
            LIMIT 1
          `;
          collectionofficer.query(
            matchQuery,
            [userId, addressData.houseNo || '', addressData.streetName || '', addressData.city || ''],
            (matchErr, matchResults) => {
              if (matchErr) return reject(matchErr);

              const matchedSaveAs = matchResults.length > 0 ? matchResults[0].saveAs : null;
              const isSavedAddress = !!matchedSaveAs || !!addressData.saveAs;

              resolve({
                orderId: orderData.orderId,
                buildingType: 'House',
                saveAs: matchedSaveAs || addressData.saveAs || '',
                isSavedAddress,
                title: orderData.title,
                fullName: orderData.fullName,
                phone1: orderData.phone1,
                phone2: orderData.phone2,
                phonecode1: orderData.phonecode1,
                phonecode2: orderData.phonecode2,
                longitude: orderData.longitude,
                latitude: orderData.latitude,
                houseNo: addressData.houseNo || '',
                streetName: addressData.streetName || '',
                city: addressData.city || '',
                buildingNo: '',
                buildingName: '',
                unitNo: '',
                floorNo: '',
              });
            }
          );
        });
      }
    });
  });
};

const getSavedAddressesByCustomerId = (customerId) => {
  return new Promise((resolve, reject) => {
    const apartmentQuery = `
      SELECT 
        id,
        'Apartment' as buildingType,
        saveAs,
        billingTitle as title,
        billingName as fullName,
        billingPhoneCode1 as phonecode1,
        billingPhone1 as phone1,
        billingPhoneCode2 as phonecode2,
        billingPhone2 as phone2,
        longitude,
        latitude,
        buildingNo,
        buildingName,
        unitNo,
        floorNo,
        houseNo,
        streetName,
        city
      FROM apartment
      WHERE customerId = ?
    `;

    const houseQuery = `
      SELECT 
        id,
        'House' as buildingType,
        saveAs,
        billingTitle as title,
        billingName as fullName,
        billingPhoneCode1 as phonecode1,
        billingPhone1 as phone1,
        billingPhoneCode2 as phonecode2,
        billingPhone2 as phone2,
        longitude,
        latitude,
        NULL as buildingNo,
        NULL as buildingName,
        NULL as unitNo,
        NULL as floorNo,
        houseNo,
        streetName,
        city
      FROM house
      WHERE customerId = ?
    `;

    collectionofficer.query(apartmentQuery, [customerId], (err, apartmentResults) => {
      if (err) return reject(err);

      collectionofficer.query(houseQuery, [customerId], (err2, houseResults) => {
        if (err2) return reject(err2);

        // Give each row a unique composite key since apartment.id and house.id
        // can collide (both auto-increment independently)
        const combined = [
          ...apartmentResults.map((r) => ({
            ...r,
            addressKey: `apartment_${r.id}`,
          })),
          ...houseResults.map((r) => ({
            ...r,
            addressKey: `house_${r.id}`,
          })),
        ];

        // Sort alphabetically A-Z by saveAs (case-insensitive).
        // Rows with a null/empty saveAs are pushed to the end rather than
        // sorting first, since an unnamed address isn't meaningfully "A".
        combined.sort((a, b) => {
          const aName = (a.saveAs || '').trim();
          const bName = (b.saveAs || '').trim();

          if (!aName && !bName) return 0;
          if (!aName) return 1;
          if (!bName) return -1;

          return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        });

        resolve(combined);
      });
    });
  });
};

const getRetailOrderByIdDao = async (orderId, userId) => {
  return new Promise((resolve, reject) => {
    if (!orderId || !userId) {
      return reject("Invalid orderId or userId");
    }

    const orderSql = `
      SELECT 
        o.*,
        p.sheduleDate AS scheduleDate, 
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

    collectionofficer.query(orderSql, [orderId, userId], (err, orders) => {
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
          collectionofficer.query(houseSql, [order.id], (err, result) => {
            if (err) return reject("Error fetching house delivery: " + err);
            if (!result || result.length === 0) return reject("House delivery address not found");

            order.deliveryInfo = {
              buildingType: 'House',
              ...result[0]
            };
            return resolve(order);
          });

        } else if (order.buildingType === 'Apartment') {
          collectionofficer.query(apartmentSql, [order.id], (err, result) => {
            if (err) return reject("Error fetching apartment delivery: " + err);
            if (!result || result.length === 0) return reject("Apartment delivery address not found");

            const apartmentDetails = result[0]; // Get the apartment delivery details

            order.deliveryInfo = {
              // Delivery address from apartment details
              buildingType: apartmentDetails.buildingType || 'Apartment',
              houseNo: apartmentDetails.houseNo || '--',
              street: apartmentDetails.streetName || '--',
              city: apartmentDetails.city || '--',
              buildingNo: apartmentDetails.buildingNo || '--',
              buildingName: apartmentDetails.buildingName || '--',
              flatNo: apartmentDetails.unitNo || '--',
              floorNo: apartmentDetails.floorNo || '--',
              // Receiving person information from retailorder
              fullName: order.fullName || '--',
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
        op.qty AS packageQty,       -- quantity of this package in the order
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

    collectionofficer.query(sql, [orderId], (err, results) => {
      if (err) {
        return reject(new Error("Database error: " + err.message));
      }

      // First group by orderPackageId to get package details with products
      const groupedPackages = {};

      results.forEach(row => {
        const key = row.orderPackageId;

        if (!groupedPackages[key]) {
          groupedPackages[key] = {
            packageId: row.packageId,
            displayName: row.displayName,
            productPrice: parseFloat(row.productPrice || '0'),
            packageQty: parseInt(row.packageQty || '1'),
            products: []
          };
        }

        groupedPackages[key].products.push({
          typeName: row.typeName,
          qty: parseInt(row.itemQty || '1')
        });
      });

      // Now create separate entries for each package quantity
      const packages = [];

      Object.values(groupedPackages).forEach(pack => {
        // Create separate entries based on packageQty
        for (let i = 0; i < pack.packageQty; i++) {
          packages.push({
            packageId: pack.packageId,
            displayName: pack.displayName,
            productPrice: `Rs. ${pack.productPrice.toFixed(2)}`,
            products: pack.products.map(p => ({
              typeName: p.typeName,
              qty: String(p.qty).padStart(2, '0'),
            }))
          });
        }
      });

      resolve(packages);
    });
  });
};

const getOrderAdditionalItemsDao = async (processOrderId) => {
  console.log("getOrderAdditionalItemsDao called with processOrderId:", processOrderId);

  return new Promise((resolve, reject) => {
    if (!processOrderId) {
      return reject(new Error("Invalid processOrderId"));
    }

    // CORRECTED: Join on cv.id instead of cv.cropGroupId
    const sql = `
      SELECT
        oai.qty,
        oai.unit,
        oai.price,    
        oai.discount,
        mi.displayName,
        cv.image,
        oai.productId,
        mi.varietyId,
        cv.id as cropVarietyId,
        cv.cropGroupId
      FROM orderadditionalitems oai
      JOIN processorders po ON po.orderId = oai.orderId
      JOIN marketplaceitems mi ON oai.productId = mi.id
      LEFT JOIN plant_care.cropvariety cv ON mi.varietyId = cv.id
      WHERE po.id = ?
      ORDER BY oai.id
    `;

    console.log("Executing corrected query:", sql);
    console.log("With processOrderId:", processOrderId);

    collectionofficer.query(sql, [processOrderId], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return reject(new Error("Database error: " + err.message));
      }

      console.log("Query results count:", results?.length || 0);
      console.log("Query results:", JSON.stringify(results, null, 2));

      resolve(results || []);
    });
  });
};

const getRetailOrderInvoiceByOrderIdDao = async (processOrderId, userId) => {
  return new Promise((resolve, reject) => {
    if (!processOrderId || !userId) {
      return reject('Invalid processOrderId or userId');
    }

    const invoiceQuery = `
      SELECT 
        o.id AS actualOrderId,
        o.centerId,
        o.delivaryMethod AS deliveryMethod,
        o.discount AS orderDiscount,
        o.createdAt AS invoiceDate,
        po.sheduleDate AS scheduledDate,
        o.buildingType,
        o.fulltotal AS fullTotal,
        o.isCoupon,
        o.couponValue,
        o.couponType,
        po.id AS processOrderId,
        po.invNo AS invoiceNumber,
        po.paymentMethod AS paymentMethod,
        po.amount AS processOrderAmount,
        po.isPaid,
        po.creditPaid,
        po.moneyPaid
      FROM processorders po
      INNER JOIN orders o ON po.orderId = o.id
      WHERE po.id = ? AND o.userId = ?
    `;

    collectionofficer.query(invoiceQuery, [processOrderId, userId], (err, invoiceResult) => {
      if (err) return reject("Invoice query error: " + err);
      if (!invoiceResult || invoiceResult.length === 0) return resolve(null);

      const invoice = invoiceResult[0];
      const actualOrderId = invoice.actualOrderId;

      const familyPackItemsQuery = `
        SELECT 
          op.id,
          mp.id AS packageId,
          mp.displayName AS name,
          mp.productPrice,
          mp.packingFee,
          mp.serviceFee,
          (mp.productPrice + mp.packingFee + mp.serviceFee) AS unitPrice,
          op.qty AS quantity,
          ((mp.productPrice + mp.packingFee + mp.serviceFee) * op.qty) AS amount
        FROM orderpackage op
        JOIN marketplacepackages mp ON op.packageId = mp.id
        WHERE op.orderId = ?
      `;

      const additionalItemsQuery = `
        SELECT
          oai.id,
          mi.displayName AS name,
          oai.unit,
          mi.normalprice AS unitPrice,
          oai.qty AS quantity,
          oai.normalprice AS amount,
          oai.discount AS itemDiscount,
          oai.normalprice AS finalPrice,
          pc.image AS image
        FROM orderadditionalitems oai
        JOIN marketplaceitems mi ON oai.productId = mi.id
        LEFT JOIN (
          SELECT cropGroupId, MIN(image) AS image
          FROM plant_care.cropvariety
          GROUP BY cropGroupId
        ) pc ON mi.varietyId = pc.cropGroupId
        WHERE oai.orderId = ?
      `;

      const billingQuery = `
        SELECT 
          o.title,
          o.fullName,
          o.phonecode1 AS phoneCode1,
          o.phone1,
          o.buildingType,
          mu.email,
          COALESCE(oh.houseNo, oa.houseNo, 'N/A') AS houseNo,
          COALESCE(oh.streetName, oa.streetName, 'N/A') AS street,
          COALESCE(oh.city, oa.city, 'N/A') AS city,
          oa.buildingNo,
          oa.buildingName,
          oa.unitNo AS flatNo,
          oa.floorNo
        FROM orders o
        LEFT JOIN marketplaceusers mu ON o.userId = mu.id
        LEFT JOIN orderhouse oh ON o.id = oh.orderId
        LEFT JOIN orderapartment oa ON o.id = oa.orderId
        WHERE o.id = ?
        LIMIT 1 
      `;

      Promise.all([
        new Promise((res, rej) => {
          collectionofficer.query(familyPackItemsQuery, [processOrderId], (err, result) => {
            if (err) return rej("Family pack query error: " + err);
            res(result || []);
          });
        }),
        new Promise((res, rej) => {
          collectionofficer.query(additionalItemsQuery, [actualOrderId], (err, result) => {
            if (err) return rej("Additional items query error: " + err);
            res(result || []);
          });
        }),
        new Promise((res, rej) => {
          collectionofficer.query(billingQuery, [actualOrderId], (err, result) => {
            if (err) return rej("Billing query error: " + err);
            res(result?.[0] || {});
          });
        })
      ]).then(async ([familyPackItems, additionalItems, billingInfo]) => {

        console.log(`Found ${familyPackItems?.length || 0} family pack items`);
        console.log(`Found ${additionalItems?.length || 0} additional items`);
        console.log('Family pack items details:', familyPackItems);

        const isPickup = (invoice.deliveryMethod || '').toUpperCase() === 'PICKUP';
        const hasDeliveryItems =
          (Array.isArray(familyPackItems) && familyPackItems.length > 0) ||
          (Array.isArray(additionalItems) && additionalItems.length > 0);

        // Check if coupon type is Free Delivery (handles both spellings)
        const isFreeDeliveryCoupon =
          invoice.isCoupon &&
          (invoice.couponType === 'Free Delivery' || invoice.couponType === 'Free Delivary');

        const deliveryFee = await getDeliveryCharge(
          isPickup,
          hasDeliveryItems,
          billingInfo.city,
          isFreeDeliveryCoupon
        );

        const pickupInfo = await getPickupInfo(isPickup, invoice.centerId);

        const processedFamilyPackItems = [];
        if (Array.isArray(familyPackItems)) {
          familyPackItems.forEach(item => {
            const qty = parseInt(item.quantity) || 1;
            const unitPrice = parseFloat(item.unitPrice) || 0;

            for (let i = 0; i < qty; i++) {
              processedFamilyPackItems.push({
                id: `${item.id}_${i + 1}`,
                originalId: item.id,
                packageId: item.packageId,
                name: item.name || "Family Pack",
                unitPrice: unitPrice,
                quantity: 1,
                amount: unitPrice
              });
            }
          });
        }

        const packageDetailsMap = await getPackageDetailsForProcessedItems(processedFamilyPackItems);

        const familyPackTotal = processedFamilyPackItems
          .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toFixed(2);

        const additionalItemsTotal = additionalItems
          .reduce((sum, i) => sum + parseFloat(i.finalPrice || 0), 0).toFixed(2);

        const additionalItemsDiscount = Array.isArray(additionalItems)
          ? additionalItems.reduce((sum, item) => sum + parseFloat(item.itemDiscount || 0), 0).toFixed(2)
          : '0.00';

        const orderDiscount = parseFloat(invoice.orderDiscount || 0).toFixed(2);
        const couponDiscount = invoice.isCoupon && invoice.couponValue
          ? parseFloat(invoice.couponValue || 0).toFixed(2)
          : '0.00';

        const calculatedGrandTotal = (
          parseFloat(additionalItemsTotal) +
          parseFloat(familyPackTotal) +
          parseFloat(deliveryFee || 0) -
          parseFloat(orderDiscount) -
          parseFloat(couponDiscount)
        ).toFixed(2);

        let formattedDeliveryMethod = invoice.deliveryMethod || 'N/A';
        if (formattedDeliveryMethod.toUpperCase() === 'PICKUP') {
          formattedDeliveryMethod = 'Instore Pickup';
        } else if (formattedDeliveryMethod.toUpperCase() === 'DELIVERY') {
          formattedDeliveryMethod = 'Home Delivery';
        }

        const invoiceData = {
          invoiceNumber: invoice.invoiceNumber || `INV-${new Date(invoice.invoiceDate).getFullYear()}-${String(processOrderId).padStart(3, '0')}`,
          invoiceDate: invoice.invoiceDate || 'N/A',
          scheduledDate: invoice.scheduledDate || 'N/A',
          deliveryMethod: formattedDeliveryMethod,
          paymentMethod: invoice.paymentMethod || 'N/A',
          isPaid: invoice.isPaid,
          creditPaid: invoice.creditPaid,
          moneyPaid: invoice.moneyPaid, 
          amountDue: `Rs. ${parseFloat(invoice.fullTotal || 0).toFixed(2)}`,
          isFreeDeliveryCoupon: !!isFreeDeliveryCoupon,
          familyPackItems: processedFamilyPackItems.map(item => ({
            id: item.id,
            name: item.name,
            unitPrice: `Rs. ${parseFloat(item.unitPrice).toFixed(2)}`,
            quantity: String(item.quantity).padStart(2, '0'),
            amount: `Rs. ${parseFloat(item.amount).toFixed(2)}`,
            packageDetails: packageDetailsMap[item.originalId] || []
          })),
          additionalItems: Array.isArray(additionalItems)
            ? additionalItems.map(item => ({
              id: item.id,
              name: item.name || "Unknown",
              unit: item.unit || "Unknown",
              unitPrice: `Rs. ${parseFloat(item.unitPrice || 0).toFixed(2)}`,
              quantity: String(item.quantity || 0).padStart(2, '0'),
              amount: `Rs. ${parseFloat(item.finalPrice || 0).toFixed(2)}`,
              image: item.image || null
            }))
            : [],
          familyPackTotal: `Rs. ${familyPackTotal}`,
          additionalItemsTotal: `Rs. ${additionalItemsTotal}`,
          deliveryFee: `Rs. ${deliveryFee || '0.00'}`,
          discount: `Rs. ${orderDiscount}`,
          couponDiscount: `Rs. ${couponDiscount}`,
          grandTotal: `Rs. ${calculatedGrandTotal}`,
          billingInfo: formatBillingInfo(billingInfo),
          pickupInfo: pickupInfo
        };

        resolve({ status: true, invoice: invoiceData });

      }).catch(err => reject(err));
    });
  });
};

// Modified helper function to get package details for processed items
const getPackageDetailsForProcessedItems = (processedFamilyPackItems) => {
  return new Promise((resolve, reject) => {
    const packageDetailsMap = {};

    if (!Array.isArray(processedFamilyPackItems) || processedFamilyPackItems.length === 0) {
      return resolve(packageDetailsMap);
    }

    // Get unique package IDs to avoid duplicate queries
    const uniquePackageIds = [...new Set(processedFamilyPackItems.map(item => item.packageId))];

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

    const promises = uniquePackageIds.map(packageId => {
      return new Promise((res, rej) => {
        collectionofficer.query(packageDetailsQuery, [packageId], (err, details) => {
          if (err) return rej("Package details query error: " + err);

          // Map details to all original IDs that have this packageId
          processedFamilyPackItems.forEach(item => {
            if (item.packageId === packageId) {
              packageDetailsMap[item.originalId] = details || [];
            }
          });

          res();
        });
      });
    });

    Promise.all(promises)
      .then(() => resolve(packageDetailsMap))
      .catch(reject);
  });
};

const getDeliveryCharge = (isPickup, hasDeliveryItems, city, isFreeDelivery = false) => {
  return new Promise((resolve) => {
    // Free delivery coupon overrides all other logic
    if (isFreeDelivery) {
      return resolve('0.00');
    }

    if (isPickup || !hasDeliveryItems) {
      return resolve('0.00');
    }

    if (!city || city === 'N/A') {
      return resolve('50.00');
    }

    const deliveryChargeQuery = `SELECT charge FROM deliverycharge WHERE LOWER(city) LIKE LOWER(?)`;
    collectionofficer.query(deliveryChargeQuery, [`%${city}%`], (err, chargeResult) => {
      if (err || !chargeResult || chargeResult.length === 0) {
        return resolve('50.00');
      }
      const charge = parseFloat(chargeResult[0].charge || 50.00).toFixed(2);
      resolve(charge);
    });
  });
};

// Helper function to get pickup info
const getPickupInfo = (isPickup, centerId) => {
  return new Promise((resolve) => {
    if (!isPickup || !centerId) {
      return resolve(null);
    }

    const pickupCenterQuery = `SELECT * FROM distributedcenter WHERE id = ?`;
    collectionofficer.query(pickupCenterQuery, [centerId], (err, centers) => {
      if (err || !centers || centers.length === 0) {
        return resolve(null);
      }
      const center = centers[0];
      resolve({
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
  });
};

// Helper function to format billing info
const formatBillingInfo = (billingInfo) => {
  return {
    title: billingInfo.title || "N/A",
    fullName: billingInfo.fullName || "N/A",
    email: billingInfo.email || "N/A",
    buildingType: billingInfo.buildingType || "N/A",
    houseNo: billingInfo.houseNo || "N/A",
    street: billingInfo.street || "N/A",
    city: billingInfo.city || "N/A",
    buildingName: billingInfo.buildingName || null,
    buildingNo: billingInfo.buildingNo || null,
    flatNo: billingInfo.flatNo || null,
    floorNo: billingInfo.floorNo || null,
    phone: billingInfo.phone1
      ? `+${(billingInfo.phoneCode1 || '').replace(/^\+/, '')} ${billingInfo.phone1}`
      : "N/A"
  };
};

const getCouponDetailsDao = async (coupon) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT *
      FROM coupon
      WHERE code LIKE ?
    `;

    collectionofficer.query(sql, [coupon], (err, results) => {
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
  getRetailOrderInvoiceByOrderIdDao,
  getOrderPackageDetailsDao, // Include the existing function
  getOrderAdditionalItemsDao,
  getLastAddress,
  getCouponDetailsDao,
  getLatestOrderAddress,
  getSavedAddressesByCustomerId
};

