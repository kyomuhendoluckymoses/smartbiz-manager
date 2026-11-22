import { db } from "../db";
import { supabase } from "./supabase";

const BUSINESS_ID = "a7c8c68a-58fd-4277-a291-aca3b6320e27";

const TABLES = [
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
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBaseRecord(record) {
  const {
    id,
    _syncLinks,
    customerId,
    productId,
    saleId,
    purchaseId,
    financialAccountId,
    accountId,
    referenceId,
    ...base
  } = record;

  return base;
}

function resolveLink(maps, tableName, syncId) {
  if (!syncId) return null;

  const id = maps[tableName]?.get(syncId);

  if (!id) {
    throw new Error(
      "Missing relationship: " + tableName + " record " + syncId
    );
  }

  return id;
}

export async function restoreCloudToLocal() {
  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session) {
    throw new Error("Please sign in with the SmartBiz owner account before restoring.");
  }

  // Never mix a cloud restore with existing local business records.
  for (const tableName of TABLES) {
    const count = await db.table(tableName).count();

    if (count > 0) {
      throw new Error(
        "Restore stopped: local " + tableName +
        " contains " + count + " records. No records were changed."
      );
    }
  }

  // Download and validate every cloud record before changing local data.
  const cloud = {};

  for (const tableName of TABLES) {
    cloud[tableName] = [];
    let offset = 0;
    const pageSize = 500;

    while (true) {
      const { data, error } = await supabase
        .from("business_records")
        .select("record_id, record_data")
        .eq("business_id", BUSINESS_ID)
        .eq("entity_type", tableName)
        .order("record_id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(
          "Restore download failed for " + tableName + ": " + error.message
        );
      }

      if (!data || data.length === 0) break;

      for (const row of data) {
        const record = row.record_data;

        if (!UUID_PATTERN.test(row.record_id || "")) {
          throw new Error(
            "Restore paused: legacy cloud IDs found in " + tableName +
            ". Cloud migration is required first. No local records were changed."
          );
        }

        if (
          !record ||
          typeof record !== "object" ||
          record.syncId !== row.record_id ||
          !record._syncLinks
        ) {
          throw new Error(
            "Invalid or unmigrated cloud record in " + tableName +
            ". No local records were changed."
          );
        }

        cloud[tableName].push(record);
      }

      offset += data.length;
      if (data.length < pageSize) break;
    }
  }

  // Check all relationships before starting the local transaction.
  const cloudIds = {};

  for (const tableName of TABLES) {
    cloudIds[tableName] = new Set(
      cloud[tableName].map(record => record.syncId)
    );
  }

  function checkLink(tableName, sourceField, targetTable, linkField) {
    for (const record of cloud[tableName]) {
      const originalId = record[sourceField];
      const linkedId = record._syncLinks[linkField];

      if (originalId != null && !linkedId) {
        throw new Error(
          "Missing " + linkField + " for " + tableName +
          " record " + record.syncId + ". Restore stopped."
        );
      }

      if (linkedId && !cloudIds[targetTable].has(linkedId)) {
        throw new Error(
          "Unresolved " + targetTable + " relationship in " +
          tableName + ". Restore stopped."
        );
      }
    }
  }

  checkLink("sales", "customerId", "customers", "customerSyncId");
  checkLink("sales", "productId", "products", "productSyncId");
  checkLink("payments", "customerId", "customers", "customerSyncId");
  checkLink("payments", "saleId", "sales", "saleSyncId");
  checkLink("stockPurchases", "productId", "products", "productSyncId");
  checkLink("stockPurchases", "financialAccountId", "financialAccounts", "financialAccountSyncId");
  checkLink("stockBatches", "productId", "products", "productSyncId");
  checkLink("stockBatches", "purchaseId", "stockPurchases", "purchaseSyncId");
  checkLink("financialTransactions", "accountId", "financialAccounts", "accountSyncId");
  checkLink("stockTransfers", "productId", "products", "productSyncId");

  // Validate financial transaction reference relationships before insertion.
  for (const record of cloud.financialTransactions) {
    if (record.referenceId == null) continue;

    const links = record._syncLinks;
    let expectedType = null;

    if (record.category === "Customer Payment") {
      expectedType = "sales";
    } else if (String(record.category || "").startsWith("Bank ")) {
      expectedType = "bankTransactions";
    } else if (record.category === "Stock Purchase") {
      expectedType = "stockPurchases";
    }

    if (
      !expectedType ||
      links.referenceType !== expectedType ||
      !links.referenceSyncId
    ) {
      throw new Error(
        "Invalid financial transaction reference in record " +
        record.syncId + ". Restore stopped before inserting records."
      );
    }

    if (!cloudIds[expectedType].has(links.referenceSyncId)) {
      throw new Error(
        "Missing " + expectedType + " reference for financial transaction " +
        record.syncId + ". Restore stopped."
      );
    }
  }


  // Insert all records and restore their local numeric relationships atomically.
  const restored = {};

  await db.transaction(
    "rw",
    ...TABLES.map(name => db.table(name)),
    async () => {
      for (const tableName of TABLES) {
        const records = cloud[tableName].map(getBaseRecord);

        if (records.length) {
          await db.table(tableName).bulkAdd(records);
        }
      }

      const maps = {};

      for (const tableName of TABLES) {
        const records = await db.table(tableName).toArray();
        maps[tableName] = new Map(
          records.map(record => [record.syncId, record.id])
        );
      }

      for (const record of cloud.sales) {
        await db.sales.update(maps.sales.get(record.syncId), {
          customerId: resolveLink(maps, "customers", record._syncLinks.customerSyncId),
          productId: resolveLink(maps, "products", record._syncLinks.productSyncId),
        });
      }

      for (const record of cloud.payments) {
        await db.payments.update(maps.payments.get(record.syncId), {
          customerId: resolveLink(maps, "customers", record._syncLinks.customerSyncId),
          saleId: resolveLink(maps, "sales", record._syncLinks.saleSyncId),
        });
      }

      for (const record of cloud.stockPurchases) {
        await db.stockPurchases.update(maps.stockPurchases.get(record.syncId), {
          productId: resolveLink(maps, "products", record._syncLinks.productSyncId),
          financialAccountId: resolveLink(
            maps, "financialAccounts",
            record._syncLinks.financialAccountSyncId
          ),
        });
      }

      for (const record of cloud.stockBatches) {
        await db.stockBatches.update(maps.stockBatches.get(record.syncId), {
          productId: resolveLink(maps, "products", record._syncLinks.productSyncId),
          purchaseId: resolveLink(maps, "stockPurchases", record._syncLinks.purchaseSyncId),
        });
      }

      for (const record of cloud.stockTransfers) {
        await db.stockTransfers.update(maps.stockTransfers.get(record.syncId), {
          productId: resolveLink(maps, "products", record._syncLinks.productSyncId),
        });
      }

      for (const record of cloud.financialTransactions) {
        const links = record._syncLinks;
        const changes = {
          accountId: resolveLink(maps, "financialAccounts", links.accountSyncId),
        };

        if (links.referenceSyncId) {
          changes.referenceId = resolveLink(
            maps, links.referenceType, links.referenceSyncId
          );
        }

        await db.financialTransactions.update(
          maps.financialTransactions.get(record.syncId),
          changes
        );
      }

      for (const tableName of TABLES) {
        restored[tableName] = cloud[tableName].length;
      }
    }
  );

  return {
    success: true,
    business: "Friend New",
    restored,
  };
}
