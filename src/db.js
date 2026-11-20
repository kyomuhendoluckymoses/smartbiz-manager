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

export default db;
