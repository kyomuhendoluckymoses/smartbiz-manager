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

function buildIdMap(records) {
  return new Map(records.map(record => [record.id, record.syncId]));
}

function addLinks(tableName, record, maps) {
  const links = {};

  if (tableName === "sales") {
    links.customerSyncId = maps.customers.get(record.customerId) || null;
    links.productSyncId = maps.products.get(record.productId) || null;
  }

  if (tableName === "payments") {
    links.customerSyncId = maps.customers.get(record.customerId) || null;
    links.saleSyncId = maps.sales.get(record.saleId) || null;
  }

  if (tableName === "stockPurchases") {
    links.productSyncId = maps.products.get(record.productId) || null;
    links.financialAccountSyncId =
      maps.financialAccounts.get(record.financialAccountId) || null;
  }

  if (tableName === "stockBatches") {
    links.productSyncId = maps.products.get(record.productId) || null;
    links.purchaseSyncId = maps.stockPurchases.get(record.purchaseId) || null;
  }

  if (tableName === "financialTransactions") {
    links.accountSyncId = maps.financialAccounts.get(record.accountId) || null;

    if (record.category === "Customer Payment") {
      links.referenceType = "sales";
      links.referenceSyncId = maps.sales.get(record.referenceId) || null;
    } else if (String(record.category || "").startsWith("Bank ")) {
      links.referenceType = "bankTransactions";
      links.referenceSyncId =
        maps.bankTransactions.get(record.referenceId) || null;
    } else if (record.category === "Stock Purchase") {
      links.referenceType = "stockPurchases";
      links.referenceSyncId =
        maps.stockPurchases.get(record.referenceId) || null;
    }
  }

  if (tableName === "stockTransfers") {
    links.productSyncId = maps.products.get(record.productId) || null;
  }

  return { ...record, _syncLinks: links };
}

export async function syncLocalToCloud() {
  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session) {
    throw new Error("Please sign in with the SmartBiz owner account before syncing.");
  }

  const local = {};

  for (const tableName of TABLES) {
    local[tableName] = await db.table(tableName).toArray();

    for (const record of local[tableName]) {
      if (!record.syncId || !UUID_PATTERN.test(record.syncId)) {
        throw new Error(
          "Missing or invalid stable ID in " + tableName +
          ". No cloud records were changed."
        );
      }
    }
  }

  const maps = {};
  for (const tableName of TABLES) {
    maps[tableName] = buildIdMap(local[tableName]);
  }

  // Check ALL existing cloud records before uploading anything.
  for (const tableName of TABLES) {
    let offset = 0;
    let legacyCount = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("business_records")
        .select("record_id")
        .eq("business_id", BUSINESS_ID)
        .eq("entity_type", tableName)
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(
          "Cloud preflight failed for " + tableName + ": " + error.message
        );
      }

      const rows = data || [];
      legacyCount += rows.filter(
        row => !UUID_PATTERN.test(row.record_id)
      ).length;

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    if (legacyCount > 0) {
      throw new Error(
        "Sync paused: " + tableName + " has " + legacyCount +
        " legacy cloud records using numeric IDs. Migrate these records before syncing. No records were uploaded."
      );
    }
  }

  const results = {};

  for (const tableName of TABLES) {
    const records = local[tableName];

    if (records.length === 0) {
      results[tableName] = 0;
      continue;
    }

    const cloudRecords = records.map(record => ({
      business_id: BUSINESS_ID,
      entity_type: tableName,
      record_id: record.syncId,
      record_data: addLinks(tableName, record, maps),
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < cloudRecords.length; i += 250) {
      const batch = cloudRecords.slice(i, i + 250);

      const { error } = await supabase
        .from("business_records")
        .upsert(batch, {
          onConflict: "business_id,entity_type,record_id",
        });

      if (error) {
        throw new Error("Sync failed for " + tableName + ": " + error.message);
      }
    }

    results[tableName] = records.length;
  }

  return {
    success: true,
    business: "Friend New",
    uploaded: results,
  };
}
