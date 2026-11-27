
import Dexie from "dexie";

export const db = new Dexie("SmartBizDatabase");

const syncTables = [
  "products",
  "customers",
  "sales",
  "expenses",
  "payments",
  "bankTransactions",
  "stockPurchases",
  "stockBatches",
  "financialAccounts",
  "financialTransactions",
  "stockTransfers",
  "productVariants"
];

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

// DATABASE VERSION 3
db.version(3).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt"
});

// DATABASE VERSION 4
db.version(4).stores({
  products: "++id, name, category, sku, createdAt",
  customers: "++id, name, phone",
  sales: "++id, receiptNumber, customerId, createdAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, category, amount, createdAt",
  payments: "++id, customerId, saleId, receiptNumber, createdAt, paymentMethod",
  bankTransactions: "++id, transactionType, accountName, amount, transactionDate, createdAt",
  stockPurchases: "++id, productId, supplierName, purchaseDate, createdAt"
});

// DATABASE VERSION 5
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

// DATABASE VERSION 6
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

// DATABASE VERSION 7
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

// DATABASE VERSION 8
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
  for (const tableName of syncTables) {
    await tx.table(tableName).toCollection().modify(record => {
      if (!record.syncId) {
        record.syncId = crypto.randomUUID();
      }
    });
  }
});

// DATABASE VERSION 9 - TWO-WAY SYNC FOUNDATION
db.version(9).stores({
  products: "++id, syncId, name, category, sku, createdAt, updatedAt",
  customers: "++id, syncId, name, phone, createdAt, updatedAt",
  sales: "++id, syncId, receiptNumber, customerId, createdAt, updatedAt, saleType, fulfillmentStatus, paymentStatus",
  expenses: "++id, syncId, category, amount, createdAt, updatedAt",
  payments: "++id, syncId, customerId, saleId, receiptNumber, createdAt, updatedAt, paymentMethod",
  bankTransactions: "++id, syncId, transactionType, accountName, amount, transactionDate, createdAt, updatedAt",
  stockPurchases: "++id, syncId, productId, supplierName, purchaseDate, createdAt, updatedAt",
  stockBatches: "++id, syncId, productId, purchaseId, purchaseDate, createdAt, updatedAt, location",
  financialAccounts: "++id, syncId, name, type, provider, createdAt, updatedAt",
  financialTransactions: "++id, syncId, accountId, transactionType, category, referenceId, transactionDate, createdAt, updatedAt",
  stockTransfers: "++id, syncId, productId, fromLocation, toLocation, transferDate, createdAt, updatedAt",

  syncDeletions: "++id, syncId, entityType, deletedAt",
  syncMeta: "&key"
}).upgrade(async tx => {
  const now = new Date().toISOString();

  for (const tableName of syncTables) {
    await tx.table(tableName).toCollection().modify(record => {
      if (!record.syncId) {
        record.syncId = crypto.randomUUID();
      }

      if (!record.createdAt) {
        record.createdAt = now;
      }

      if (!record.updatedAt) {
        record.updatedAt = record.createdAt || now;
      }
    });
  }
});

// DATABASE VERSION 10 - USER-DEFINED PRODUCT SIZES
db.version(10).stores({
  productVariants: "++id, syncId, productId, name, sku, createdAt, updatedAt"
});

// While the sync engine writes records that came from the cloud it must keep
// the original updatedAt value, otherwise every device would think its copy is
// "newer" and the devices would keep overwriting each other.
export const syncState = { applying: false };

// AUTOMATIC UUID AND CHANGE TIMESTAMPS
for (const tableName of syncTables) {
  const table = db.table(tableName);

  table.hook("creating", function (primaryKey, record) {
    const now = new Date().toISOString();

    if (!record.syncId) {
      record.syncId = crypto.randomUUID();
    }

    if (!record.createdAt) {
      record.createdAt = now;
    }

    if (syncState.applying && record.updatedAt) return;

    record.updatedAt = now;
  });

  table.hook("updating", function (modifications) {
    if (syncState.applying) return undefined;

    return {
      ...modifications,
      updatedAt: new Date().toISOString()
    };
  });
}

// RECORD DELETION FOR LATER CLOUD SYNCHRONIZATION
// Use this helper instead of directly calling table.delete().
export async function deleteWithSync(tableName, id) {
  if (!syncTables.includes(tableName)) {
    throw new Error("Invalid synchronization table: " + tableName);
  }

  await db.transaction(
    "rw",
    db.table(tableName),
    db.syncDeletions,
    async () => {
      const record = await db.table(tableName).get(id);

      if (!record) return;

      await db.syncDeletions.add({
        syncId: record.syncId,
        entityType: tableName,
        deletedAt: new Date().toISOString()
      });

      await db.table(tableName).delete(id);
    }
  );
}

export { syncTables };
export default db;
