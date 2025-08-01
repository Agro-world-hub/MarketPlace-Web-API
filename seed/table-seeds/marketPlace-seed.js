const { createDistributedTargetTable, createDistributedTargetItemsTable } = require('../tables/collection-table');
const { createMarketPlaceUsersTable, createProcessRetailOrders, createBanners, createSalesAgentTable, createSalesAgentStarTable, createHouseTable, createApartmentTable, createDashcomplainTable, createtargetTable, createProductTypes, createCart, createCartAdditionalItems, createCartpackage, createOrder, createOrderApartmentTable, createOrderHouseTable, createOrderAdditionalItems, createOrderpackage, createOrderpackageItems, createResetPasswordTokenTable, createDashNotificationTable, createMarketPlaceComplainTable, createMarketPlaceComplainImagesTable, createReplaceRequests, createDefinePackageTable, createDefinePackageItemsTable, createExcludeList } = require('../tables/marketPlace-table');
const { createMarketPlacePackages } = require('../tables/marketPlace-table');
const { createCoupon } = require('../tables/marketPlace-table');
const { createMarketPlaceItems } = require('../tables/marketPlace-table');
const { createPackageDetails } = require('../tables/marketPlace-table');
const { createPromoItems } = require('../tables/marketPlace-table');


const seedMarketPlace = async () => {
  try {
    const messageCreateSalesAgentTable = await createSalesAgentTable();
    console.log(messageCreateSalesAgentTable);

    const messageCreateSalesAgentStarTable = await createSalesAgentStarTable();
    console.log(messageCreateSalesAgentStarTable);

    const messageCreateMarketPlaceUsersTable = await createMarketPlaceUsersTable();
    console.log(messageCreateMarketPlaceUsersTable);

    const messageCreateHouseTable = await createHouseTable();
    console.log(messageCreateHouseTable);

    const messageCreateApartmentTable = await createApartmentTable();
    console.log(messageCreateApartmentTable);

    const messageCreateDashcomplainTable = await createDashcomplainTable();
    console.log(messageCreateDashcomplainTable);

    const messageCreatetargetTable = await createtargetTable();
    console.log(messageCreatetargetTable);

    const messageCreateProductTypes = await createProductTypes();
    console.log(messageCreateProductTypes);

    const messageCreateMarketPlacePackages = await createMarketPlacePackages();
    console.log(messageCreateMarketPlacePackages);

    const messageCreatePackageDetails = await createPackageDetails();
    console.log(messageCreatePackageDetails);

    const messageCreateCoupon = await createCoupon();
    console.log(messageCreateCoupon);

    const messageCreateMarketPlaceItems = await createMarketPlaceItems();
    console.log(messageCreateMarketPlaceItems);

    const messageCreatePromoItems = await createPromoItems();
    console.log(messageCreatePromoItems);

    const messageCreateCart = await createCart();
    console.log(messageCreateCart);

    const messageCreateCartAdditionalItems = await createCartAdditionalItems();
    console.log(messageCreateCartAdditionalItems);

    const messageCreateCartpackage = await createCartpackage();
    console.log(messageCreateCartpackage);

    const messageCreateOrder = await createOrder();
    console.log(messageCreateOrder);

    const messageCreateOrderHouseTable = await createOrderHouseTable();
    console.log(messageCreateOrderHouseTable);

    const messageCreateOrderApartmentTable = await createOrderApartmentTable();
    console.log(messageCreateOrderApartmentTable);

    const messageCreateOrderAdditionalItems = await createOrderAdditionalItems();
    console.log(messageCreateOrderAdditionalItems);

    const messageCreateProcessRetailOrders = await createProcessRetailOrders();
    console.log(messageCreateProcessRetailOrders);

    const messageCreateOrderpackage = await createOrderpackage();
    console.log(messageCreateOrderpackage);

    const messageCreateDashNotificationTable = await createDashNotificationTable();
    console.log(messageCreateDashNotificationTable);

    const messageCreateBanners = await createBanners();
    console.log(messageCreateBanners);

    const messageCreateResetPasswordTokenTable = await createResetPasswordTokenTable();
    console.log(messageCreateResetPasswordTokenTable);

    const messagecreateMarketPlaceComplainTable = await createMarketPlaceComplainTable();
    console.log(messagecreateMarketPlaceComplainTable);

    const messagecreateMarketPlaceComplainImagesTable = await createMarketPlaceComplainImagesTable();
    console.log(messagecreateMarketPlaceComplainImagesTable);

    const messagecreateDefinePackageTableTable = await createDefinePackageTable();
    console.log(messagecreateDefinePackageTableTable);

    const messagecreateDefinePackageItemsTableTable = await createDefinePackageItemsTable();
    console.log(messagecreateDefinePackageItemsTableTable);

    const messagecreateExcludeListTable = await createExcludeList();
    console.log(messagecreateExcludeListTable);

    const messageCreateOrderpackageItems = await createOrderpackageItems();
    console.log(messageCreateOrderpackageItems);

    //collection officer table
    const messagecreateDistributedTargetTable = await createDistributedTargetTable();
    console.log(messagecreateDistributedTargetTable);

    const messagecreateDistributedTargetItemsTableTable = await createDistributedTargetItemsTable();
    console.log(messagecreateDistributedTargetItemsTableTable);

    const messagecreateReplaceRequestsTable = await createReplaceRequests();
    console.log(messagecreateReplaceRequestsTable);




  } catch (err) {
    console.error('Error seeding seedMarketPlace:', err);
  }
};


module.exports = seedMarketPlace;