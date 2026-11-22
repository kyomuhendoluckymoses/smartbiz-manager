import Dexie from "dexie";

export const db = new Dexie("SmartBizDatabase");

// DATABASE VERSION 1
db.version(1).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, createdAt"
});

// DATABASE VERSION 2
db.version(2).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod"
});

// DATABASE VERSION 3 - BANKING
db.version(3).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt"
});

// DATABASE VERSION 4 - STOCK PURCHASES
db.version(4).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, productId, supplierName, purchaseDate, createdAt"
});

// DATABASE VERSION 5 - FIFO STOCK BATCHES
db.version(5).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, productId, supplierName, purchaseDate, createdAt",
  stockBatches: "++id, productId, purchaseId, purchaseDate, createdAt"
});

// DATABASE VERSION 6 - FINANCIAL MANAGEMENT
db.version(6).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, productId, supplierName, purchaseDate, createdAt",
  stockBatches: "++id, productId, purchaseId, purchaseDate, createdAt",
  financialAccounts: "++id, name, type, provider, createdAt",
  financialTransactions: "++id, accountId, transactionType, category, referenceId, transactionDate, createdAt"
});


// DATABASE VERSION 7 - TWO SHOP STOCK TRANSFERS
db.version(7).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, productId, supplierName, purchaseDate, createdAt",
  stockBatches: "++id, productId, purchaseId, purchaseDate, createdAt, location",
  financialAccounts: "++id, name, type, provider, createdAt",
  financialTransactions: "++id, accountId, transactionType, category, referenceId, transactionDate, createdAt",
  stockTransfers: "++id, productId, fromLocation, toLocation, transferDate, createdAt"
}).upgrade(async tx => {
  await tx.table("stockBatches").toCollection().modify(batch => {
    if (!batch.location) batch.location = "Main Shop";
  });
});


 // DATABASE VERSION 8 - STABLE CLOUD IDENTITIES
db.version(8).stores({
  products: "++id, syncId, name, category, sku, createdAt",
  customers: "++id, syncId, name, phone",
  sales: "++id, syncId, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, syncId, category, amount, createdAt",
  payments: "++id, syncId, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, syncId, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, syncId, productId, supplierName, purchaseDate, createdAt",
  stockBatches: "++id, syncId, productId, purchaseId, purchaseDate, createdAt, location",
  financialAccounts: "++id, syncId, name, type, provider, createdAt",
  financialTransactions: "++id, syncId, accountId, transactionType, category, referenceId, transactionDate, createdAt",
  stockTransfers: "++id, syncId, productId, fromLocation, toLocation, transferDate, createdAt"
}).upgrade(async tx => {
  const tables = [
    "products", "customers", "sales", "expenses", "payments",
    "bankTransactions", "stockPurchases", "stockBatches",
    "financialAccounts", "financialTransactions", "stockTransfers"
  ];

  for (const tableName of tables) {
    await tx.table(tableName).toCollection().modify(record => {
      if (!record.syncId) record.syncId = crypto.randomUUID();
    });
  }
});


// AUTOMATIC STABLE IDS FOR NEW RECORDS
const syncTables = [
  "products", "customers", "sales", "expenses", "payments",
  "bankTransactions", "stockPurchases", "stockBatches",
  "financialAccounts", "financialTransactions", "stockTransfers"
];

for (const tableName of syncTables) {
  db.table(tableName).hook("creating", function (primaryKey, record) {
    if (!record.syncId) {
      record.syncId = crypto.randomUUID();
    }
  });
}

export default db;

