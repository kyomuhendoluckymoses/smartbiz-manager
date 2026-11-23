import { db, syncTables } from "../db";
import { supabase } from "./supabase";
import { getAuthorizedBusiness } from "./businessAccess";

const TABLES = [...syncTables];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FOREIGN_KEYS = [
  "customerId",
  "productId",
  "saleId",
  "purchaseId",
  "financialAccountId",
  "accountId",
  "referenceId",
];

function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ":" + stableStringify(value[key]))
      .join(",") + "}";
  }

  return JSON.stringify(value);
}

function comparable(record) {
  const result = { ...record };
  delete result.id;

  for (const key of FOREIGN_KEYS) {
    delete result[key];
  }

  return result;
}

function buildMaps(records) {
  const maps = {};

  for (const table of TABLES) {
    maps[table] = new Map(
      records[table].map(record => [record.id, record.syncId])
    );
  }

  return maps;
}

function requiredLink(map, id, description) {
  if (id == null) return null;

  const syncId = map.get(id);

  if (!syncId) {
    throw new Error("Unresolved relationship: " + description);
  }

  return syncId;
}

function addLinks(table, record, maps) {
  const links = {};

  if (table === "sales") {
    links.customerSyncId = requiredLink(
      maps.customers, record.customerId, "sales customer"
    );
    links.productSyncId = requiredLink(
      maps.products, record.productId, "sales product"
    );
  }

  if (table === "payments") {
    links.customerSyncId = requiredLink(
      maps.customers, record.customerId, "payment customer"
    );
    links.saleSyncId = requiredLink(
      maps.sales, record.saleId, "payment sale"
    );
  }

  if (table === "stockPurchases") {
    links.productSyncId = requiredLink(
      maps.products, record.productId, "purchase product"
    );
    links.financialAccountSyncId = requiredLink(
      maps.financialAccounts,
      record.financialAccountId,
      "purchase financial account"
    );
  }

  if (table === "stockBatches") {
    links.productSyncId = requiredLink(
      maps.products, record.productId, "batch product"
    );
    links.purchaseSyncId = requiredLink(
      maps.stockPurchases, record.purchaseId, "batch purchase"
    );
  }

  if (table === "financialTransactions") {
    links.accountSyncId = requiredLink(
      maps.financialAccounts, record.accountId, "transaction account"
    );

    if (record.referenceId != null) {
      if (record.category === "Customer Payment") {
        links.referenceType = "sales";
        links.referenceSyncId = requiredLink(
          maps.sales, record.referenceId, "transaction sale reference"
        );
      } else if (String(record.category || "").startsWith("Bank ")) {
        links.referenceType = "bankTransactions";
        links.referenceSyncId = requiredLink(
          maps.bankTransactions,
          record.referenceId,
          "transaction bank reference"
        );
      } else if (record.category === "Stock Purchase") {
        links.referenceType = "stockPurchases";
        links.referenceSyncId = requiredLink(
          maps.stockPurchases,
          record.referenceId,
          "transaction purchase reference"
        );
      } else {
        throw new Error(
          "Unknown financial transaction reference category: " +
          record.category
        );
      }
    }
  }

  if (table === "stockTransfers") {
    links.productSyncId = requiredLink(
      maps.products, record.productId, "transfer product"
    );
  }

  return { ...record, _syncLinks: links };
}

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

function resolveLink(maps, table, syncId, description) {
  if (!syncId) return null;

  const id = maps[table]?.get(syncId);

  if (id == null) {
    throw new Error("Missing " + description + " relationship: " + syncId);
  }

  return id;
}

function relationshipChanges(table, record, maps) {
  const links = record._syncLinks || {};
  const changes = {};

  if (table === "sales") {
    changes.customerId = resolveLink(
      maps, "customers", links.customerSyncId, "customer"
    );
    changes.productId = resolveLink(
      maps, "products", links.productSyncId, "product"
    );
  }

  if (table === "payments") {
    changes.customerId = resolveLink(
      maps, "customers", links.customerSyncId, "customer"
    );
    changes.saleId = resolveLink(
      maps, "sales", links.saleSyncId, "sale"
    );
  }

  if (table === "stockPurchases") {
    changes.productId = resolveLink(
      maps, "products", links.productSyncId, "product"
    );
    changes.financialAccountId = resolveLink(
      maps,
      "financialAccounts",
      links.financialAccountSyncId,
      "financial account"
    );
  }

  if (table === "stockBatches") {
    changes.productId = resolveLink(
      maps, "products", links.productSyncId, "product"
    );
    changes.purchaseId = resolveLink(
      maps, "stockPurchases", links.purchaseSyncId, "purchase"
    );
  }

  if (table === "financialTransactions") {
    changes.accountId = resolveLink(
      maps, "financialAccounts", links.accountSyncId, "account"
    );

    if (links.referenceSyncId) {
      changes.referenceId = resolveLink(
        maps,
        links.referenceType,
        links.referenceSyncId,
        "financial reference"
      );
    }
  }

  if (table === "stockTransfers") {
    changes.productId = resolveLink(
      maps, "products", links.productSyncId, "product"
    );
  }

  return changes;
}

export async function syncLocalToCloud() {
  const business = await getAuthorizedBusiness();

  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) throw new Error("Please sign in before syncing.");

  // Do not silently discard or ignore pending deletions.
  const pendingDeletions = await db.syncDeletions.count();

  if (pendingDeletions > 0) {
    throw new Error(
      "Sync paused: " + pendingDeletions +
      " pending deletions need a separate safe deletion review. " +
      "No records were deleted."
    );
  }

  const local = {};
  const cloud = {};
  const localById = {};
  const cloudById = {};
  const results = {};

  for (const table of TABLES) {
    local[table] = await db.table(table).toArray();
    localById[table] = new Map();

    for (const record of local[table]) {
      if (!UUID_PATTERN.test(record.syncId || "")) {
        throw new Error(
          "Invalid local ID in " + table + ". No records were changed."
        );
      }

      if (localById[table].has(record.syncId)) {
        throw new Error("Duplicate local syncId in " + table);
      }

      localById[table].set(record.syncId, record);
    }
  }

  // Read and validate every cloud table before changing anything.
  for (const table of TABLES) {
    cloud[table] = [];
    cloudById[table] = new Map();

    let offset = 0;
    const pageSize = 500;

    while (true) {
      const { data, error } = await supabase
        .from("business_records")
        .select("record_id, record_data, updated_at")
        .eq("business_id", business.id)
        .eq("entity_type", table)
        .order("record_id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(
          "Cloud download failed for " + table + ": " + error.message
        );
      }

      const rows = data || [];

      for (const row of rows) {
        if (
          !UUID_PATTERN.test(row.record_id || "") ||
          !row.record_data ||
          typeof row.record_data !== "object" ||
          row.record_data.syncId !== row.record_id
        ) {
          throw new Error(
            "Invalid or legacy cloud record in " + table +
            ". No records were changed."
          );
        }

        if (cloudById[table].has(row.record_id)) {
          throw new Error("Duplicate cloud record ID in " + table);
        }

        let record = row.record_data;

        // Older product records did not contain relationship metadata.
        if (table === "products" && !record._syncLinks) {
          record = { ...record, _syncLinks: {} };
        } else if (
          table !== "products" &&
          (!record._syncLinks || typeof record._syncLinks !== "object")
        ) {
          throw new Error(
            "Missing relationship metadata in cloud " + table +
            " record " + row.record_id
          );
        }

        cloud[table].push({ ...row, record_data: record });
        cloudById[table].set(row.record_id, record);
      }

      offset += rows.length;
      if (rows.length < pageSize) break;
    }
  }

  // Check conflicts before changing local or cloud records.
  for (const table of TABLES) {
    for (const record of local[table]) {
      const cloudRecord = cloudById[table].get(record.syncId);

      if (!cloudRecord) continue;

      const localLinked = addLinks(
        table,
        record,
        buildMaps(local)
      );

      if (
        stableStringify(comparable(localLinked)) !==
        stableStringify(comparable(cloudRecord))
      ) {
        throw new Error(
          "Conflict detected in " + table +
          " record " + record.syncId +
          ". Both versions have been preserved. Resolve this conflict before syncing."
        );
      }
    }
  }

  // Prepare cloud-only records for local import.
  const cloudOnly = {};

  for (const table of TABLES) {
    cloudOnly[table] = [];

    for (const [syncId, record] of cloudById[table]) {
      if (!localById[table].has(syncId)) {
        cloudOnly[table].push(record);
      }
    }
  }

  // Validate every local relationship before importing anything.
  const localMaps = buildMaps(local);

  for (const table of TABLES) {
    for (const record of local[table]) {
      addLinks(table, record, localMaps);
    }
  }

  // Validate cloud-only relationship metadata against the combined IDs.
  const availableIds = {};

  for (const table of TABLES) {
    availableIds[table] = new Set([
      ...local[table].map(record => record.syncId),
      ...cloud[table].map(row => row.record_id),
    ]);
  }

  function validateCloudLink(record, targetTable, field) {
    const syncId = record._syncLinks?.[field];

    if (syncId && !availableIds[targetTable].has(syncId)) {
      throw new Error(
        "Unresolved cloud relationship " + field +
        " in record " + record.syncId +
        ". No records were changed."
      );
    }
  }

  for (const record of cloudOnly.sales) {
    validateCloudLink(record, "customers", "customerSyncId");
    validateCloudLink(record, "products", "productSyncId");
  }

  for (const record of cloudOnly.payments) {
    validateCloudLink(record, "customers", "customerSyncId");
    validateCloudLink(record, "sales", "saleSyncId");
  }

  for (const record of cloudOnly.stockPurchases) {
    validateCloudLink(record, "products", "productSyncId");
    validateCloudLink(record, "financialAccounts", "financialAccountSyncId");
  }

  for (const record of cloudOnly.stockBatches) {
    validateCloudLink(record, "products", "productSyncId");
    validateCloudLink(record, "stockPurchases", "purchaseSyncId");
  }

  for (const record of cloudOnly.financialTransactions) {
    validateCloudLink(record, "financialAccounts", "accountSyncId");

    if (record._syncLinks?.referenceSyncId) {
      const target = record._syncLinks.referenceType;

      if (!TABLES.includes(target)) {
        throw new Error("Invalid financial reference type.");
      }

      validateCloudLink(
        record,
        target,
        "referenceSyncId"
      );
    }
  }

  for (const record of cloudOnly.stockTransfers) {
    validateCloudLink(record, "products", "productSyncId");
  }

  // Upload local-only records before importing cloud-only records.
  const mergedLocal = local;
  const mergedMaps = localMaps;

  // Upload local-only records. Existing cloud records are never overwritten.
  for (const table of TABLES) {
    const upload = [];

    for (const record of mergedLocal[table]) {
      if (cloudById[table].has(record.syncId)) continue;

      upload.push({
        business_id: business.id,
        entity_type: table,
        record_id: record.syncId,
        record_data: addLinks(table, record, mergedMaps),
        updated_at: record.updatedAt || record.createdAt ||
          new Date().toISOString(),
      });
    }

    for (let i = 0; i < upload.length; i += 250) {
      const batch = upload.slice(i, i + 250);

      const { error } = await supabase
        .from("business_records")
        .upsert(batch, { onConflict: "business_id,entity_type,record_id" });

      if (error) {
        throw new Error(
          "Upload failed for " + table + ": " + error.message +
          ". Previously imported records were preserved."
        );
      }
    }

    results[table] = {
      downloaded: cloudOnly[table].length,
      uploaded: upload.length,
      unchanged: local[table].length - upload.length,
    };
  }

  // Import cloud-only records without numeric foreign keys first.
  await db.transaction(
    "rw",
    ...TABLES.map(table => db.table(table)),
    async () => {
      for (const table of TABLES) {
        const records = cloudOnly[table].map(getBaseRecord);

        if (records.length) {
          await db.table(table).bulkAdd(records);
        }
      }

      // Rebuild local numeric ID maps after import.
      const maps = {};

      for (const table of TABLES) {
        const records = await db.table(table).toArray();

        maps[table] = new Map(
          records.map(record => [record.syncId, record.id])
        );
      }

      // Restore numeric relationships for imported cloud records.
      for (const table of TABLES) {
        for (const record of cloudOnly[table]) {
          const id = maps[table].get(record.syncId);

          await db.table(table).update(
            id,
            relationshipChanges(table, record, maps)
          );
        }
      }
    }
  );

  return {
    success: true,
    business: business.name,
    mode: "TWO-WAY MERGE",
    tables: results,
    message: "Two-way merge completed. No existing records were overwritten or deleted.",
  };
}

export async function syncSmartBiz() {
  return syncLocalToCloud();
}

