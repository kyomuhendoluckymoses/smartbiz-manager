import { db, syncTables, syncState } from "../db";
import { supabase } from "./supabase";
import { getAuthorizedBusiness } from "./businessAccess";

const TABLES = [...syncTables];
const DELETION_ENTITY = "syncDeletions";

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

// Which cloud link fields point to which table.
const LINK_TARGETS = {
  sales: { customerSyncId: "customers", productSyncId: "products" },
  payments: { customerSyncId: "customers", saleSyncId: "sales" },
  stockPurchases: {
    productSyncId: "products",
    financialAccountSyncId: "financialAccounts",
  },
  stockBatches: {
    productSyncId: "products",
  },
  financialTransactions: { accountSyncId: "financialAccounts" },
  stockTransfers: { productSyncId: "products" },
  productVariants: { productSyncId: "products" },
};

function omit(record, keys) {
  const result = { ...record };
  for (const key of keys) delete result[key];
  return result;
}

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

// Content used to decide whether two versions differ.
// updatedAt is excluded: it only says WHICH version is newer.
function comparable(record) {
  return omit(record, ["id", "updatedAt", ...FOREIGN_KEYS]);
}

function timeOf(record) {
  const t = Date.parse(record?.updatedAt || record?.createdAt || "");
  return Number.isNaN(t) ? 0 : t;
}

function getBaseRecord(record) {
  return omit(record, ["id", "_syncLinks", ...FOREIGN_KEYS]);
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

// Returns undefined when the parent record cannot be found (orphan).
function linkFor(map, id) {
  if (id == null || id === "") return null;

  const syncId = map.get(id) ?? map.get(Number(id));

  return syncId || undefined;
}

// Builds the cloud relationship metadata for a local record.
// Returns null if one of its parent records is missing (orphan record).
function addLinks(table, record, maps) {
  const links = {};
  const ok = (key, map, id) => {
    const syncId = linkFor(map, id);
    if (syncId === undefined) return false;
    links[key] = syncId;
    return true;
  };

  let valid = true;

  if (table === "sales") {
    valid = ok("customerSyncId", maps.customers, record.customerId) &&
      ok("productSyncId", maps.products, record.productId);
  } else if (table === "productVariants") {
    valid = ok("productSyncId", maps.products, record.productId);
  } else if (table === "payments") {
    valid = ok("customerSyncId", maps.customers, record.customerId) &&
      ok("saleSyncId", maps.sales, record.saleId);
  } else if (table === "stockPurchases") {
    valid = ok("productSyncId", maps.products, record.productId) &&
      ok("financialAccountSyncId", maps.financialAccounts,
        record.financialAccountId);
  } else if (table === "stockBatches") {
    // A stock batch must always belong to an existing product.
    valid = ok("productSyncId", maps.products, record.productId);

    // Purchase history is optional. A purchase can be deleted while
    // its FIFO stock batch remains in inventory.
    if (valid && record.purchaseId != null && record.purchaseId !== "") {
      const purchaseSyncId = linkFor(
        maps.stockPurchases,
        record.purchaseId
      );

      if (purchaseSyncId) {
        links.purchaseSyncId = purchaseSyncId;
      }
    }
  } else if (table === "stockTransfers") {
    valid = ok("productSyncId", maps.products, record.productId);
  } else if (table === "financialTransactions") {
    valid = ok("accountSyncId", maps.financialAccounts, record.accountId);

    if (valid && record.referenceId != null && record.referenceId !== "") {
      const category = String(record.category || "");
      let referenceType = null;

      if (category === "Customer Payment") referenceType = "sales";
      else if (category.startsWith("Bank ")) referenceType = "bankTransactions";
      else if (category === "Stock Purchase") referenceType = "stockPurchases";

      if (referenceType) {
        links.referenceType = referenceType;
        valid = ok("referenceSyncId", maps[referenceType], record.referenceId);
      }
    }
  }

  if (!valid) return null;

  return { ...record, _syncLinks: links };
}

// True when every parent record named in the cloud record exists.
function cloudLinksResolvable(table, record, knownIds) {
  const links = record._syncLinks || {};

  for (const [field, target] of Object.entries(LINK_TARGETS[table] || {})) {
    if (links[field] && !knownIds[target].has(links[field])) return false;
  }

  if (table === "financialTransactions" && links.referenceSyncId) {
    if (!knownIds[links.referenceType]?.has(links.referenceSyncId)) {
      return false;
    }
  }

  return true;
}

function relationshipChanges(table, record, maps) {
  const links = record._syncLinks || {};
  const changes = {};
  const get = (target, syncId) =>
    syncId ? maps[target]?.get(syncId) ?? null : null;

  if (table === "sales") {
    changes.customerId = get("customers", links.customerSyncId);
    changes.productId = get("products", links.productSyncId);
  } else if (table === "productVariants") {
    changes.productId = get("products", links.productSyncId);
  } else if (table === "payments") {
    changes.customerId = get("customers", links.customerSyncId);
    changes.saleId = get("sales", links.saleSyncId);
  } else if (table === "stockPurchases") {
    changes.productId = get("products", links.productSyncId);
    changes.financialAccountId =
      get("financialAccounts", links.financialAccountSyncId);
  } else if (table === "stockBatches") {
    changes.productId = get("products", links.productSyncId);
    if (links.purchaseSyncId) {
      const purchaseId = get("stockPurchases", links.purchaseSyncId);
      if (purchaseId != null) {
        changes.purchaseId = purchaseId;
      }
    }
  } else if (table === "stockTransfers") {
    changes.productId = get("products", links.productSyncId);
  } else if (table === "financialTransactions") {
    changes.accountId = get("financialAccounts", links.accountSyncId);
    changes.referenceId = links.referenceSyncId
      ? get(links.referenceType, links.referenceSyncId)
      : null;
  }

  return changes;
}

async function fetchCloudRows(businessId, entityType) {
  const rows = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("business_records")
      .select("record_id, record_data, updated_at")
      .eq("business_id", businessId)
      .eq("entity_type", entityType)
      .order("record_id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        "Cloud download failed for " + entityType + ": " + error.message
      );
    }

    const page = data || [];
    rows.push(...page);
    offset += page.length;

    if (page.length < pageSize) break;
  }

  return rows;
}

let running = null;

// Two-way synchronization.
//  - Records that exist on only one side are copied to the other side.
//  - Records that exist on both sides but differ: the NEWEST edit wins.
//  - Deletions are shared between devices.
//  - A problem record is skipped and reported; it never blocks the others.
export function syncLocalToCloud() {
  if (running) return running;

  running = runSync().finally(() => {
    running = null;
  });

  return running;
}

async function runSync() {
  const business = await getAuthorizedBusiness();

  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) throw new Error("Please sign in before syncing.");

  const warnings = [];
  const results = {};

  // 1. Read local records.
  const local = {};

  for (const table of TABLES) {
    local[table] = await db.table(table).toArray();
    const seen = new Set();

    for (const record of local[table]) {
      if (!UUID_PATTERN.test(record.syncId || "")) {
        throw new Error(
          "Invalid local ID in " + table + ". No records were changed."
        );
      }

      if (seen.has(record.syncId)) {
        throw new Error("Duplicate local syncId in " + table);
      }

      seen.add(record.syncId);
    }
  }

  // 2. Read cloud records and cloud deletions.
  const cloud = {};
  const cloudById = {};

  for (const table of TABLES) {
    cloud[table] = [];
    cloudById[table] = new Map();

    const rows = await fetchCloudRows(business.id, table);

    for (const row of rows) {
      let record = row.record_data;

      if (
        !UUID_PATTERN.test(row.record_id || "") ||
        !record || typeof record !== "object" ||
        record.syncId !== row.record_id
      ) {
        warnings.push("Skipped an invalid cloud record in " + table + ".");
        continue;
      }

      if (!record._syncLinks || typeof record._syncLinks !== "object") {
        record = { ...record, _syncLinks: {} };
      }

      cloud[table].push(record);
      cloudById[table].set(record.syncId, record);
    }
  }

  const deletedIds = {};
  for (const table of TABLES) deletedIds[table] = new Set();

  const cloudDeletionRows = await fetchCloudRows(business.id, DELETION_ENTITY);

  for (const row of cloudDeletionRows) {
    const info = row.record_data;

    if (info && deletedIds[info.entityType]) {
      deletedIds[info.entityType].add(row.record_id);
    }
  }

  // 3. Share deletions made on this device.
  const pendingDeletions = await db.syncDeletions.toArray();
  const uploadedDeletionIds = [];

  if (pendingDeletions.length) {
    const tombstones = pendingDeletions
      .filter(item => TABLES.includes(item.entityType) &&
        UUID_PATTERN.test(item.syncId || ""))
      .map(item => ({
        business_id: business.id,
        entity_type: DELETION_ENTITY,
        record_id: item.syncId,
        record_data: {
          syncId: item.syncId,
          entityType: item.entityType,
          deletedAt: item.deletedAt,
        },
        updated_at: item.deletedAt || new Date().toISOString(),
      }));

    // Never bring a deleted record back, even if sharing the deletion fails.
    for (const item of pendingDeletions) {
      if (deletedIds[item.entityType]) {
        deletedIds[item.entityType].add(item.syncId);
      }
    }

    const { error } = await supabase
      .from("business_records")
      .upsert(tombstones, { onConflict: "business_id,entity_type,record_id" });

    if (error) {
      warnings.push(
        "Deletions could not be shared with the cloud yet: " + error.message
      );
    } else {
      uploadedDeletionIds.push(...pendingDeletions.map(item => item.id));

      for (const item of pendingDeletions) {
        await supabase
          .from("business_records")
          .delete()
          .eq("business_id", business.id)
          .eq("entity_type", item.entityType)
          .eq("record_id", item.syncId);
      }
    }
  }

  // 4. Ignore cloud copies of deleted records; remove deleted records here.
  const localToDelete = {};

  for (const table of TABLES) {
    cloud[table] = cloud[table].filter(
      record => !deletedIds[table].has(record.syncId)
    );
    cloudById[table] = new Map(cloud[table].map(r => [r.syncId, r]));

    localToDelete[table] = local[table].filter(
      record => deletedIds[table].has(record.syncId)
    );
    local[table] = local[table].filter(
      record => !deletedIds[table].has(record.syncId)
    );
  }

  // 5. Decide what to upload and what to import.
  const localMaps = buildMaps(local);
  const knownIds = {};

  for (const table of TABLES) {
    knownIds[table] = new Set([
      ...local[table].map(r => r.syncId),
      ...cloud[table].map(r => r.syncId),
    ]);
  }

  const uploads = {};
  const imports = {};
  const updates = {};

  for (const table of TABLES) {
    uploads[table] = [];
    imports[table] = [];
    updates[table] = [];

    const localIds = new Set();

    for (const record of local[table]) {
      localIds.add(record.syncId);

      const linked = addLinks(table, record, localMaps);

      if (!linked) {
        warnings.push(
          "A " + table + " record is linked to a missing record and was not synced."
        );
        continue;
      }

      const cloudRecord = cloudById[table].get(record.syncId);

      if (!cloudRecord) {
        uploads[table].push(linked);
        continue;
      }

      if (
        stableStringify(comparable(linked)) ===
        stableStringify(comparable(cloudRecord))
      ) {
        continue;
      }

      // Same record, different content: the newest edit wins.
      const localTime = timeOf(record);
      const cloudTime = timeOf(cloudRecord);
      const localContent = stableStringify(comparable(linked));
      const cloudContent = stableStringify(comparable(cloudRecord));

      // Use a stable content tie-breaker when device clocks produce the same
      // updatedAt timestamp. This ensures both devices converge to one version.
      const localWins = localTime > cloudTime ||
        (localTime === cloudTime && localContent > cloudContent);

      if (localWins) {
        uploads[table].push(linked);
      } else if (cloudLinksResolvable(table, cloudRecord, knownIds)) {
        updates[table].push({ cloudRecord, localRecord: record });
      }
    }

    for (const record of cloud[table]) {
      if (localIds.has(record.syncId)) continue;

      if (!cloudLinksResolvable(table, record, knownIds)) {
        warnings.push(
          "A cloud " + table + " record is linked to a missing record and was not imported."
        );
        continue;
      }

      imports[table].push(record);
    }
  }

  // 6. Upload new and newer-here records.
  for (const table of TABLES) {
    const rows = uploads[table].map(record => ({
      business_id: business.id,
      entity_type: table,
      record_id: record.syncId,
      record_data: record,
      updated_at: record.updatedAt || record.createdAt ||
        new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 250) {
      const { error } = await supabase
        .from("business_records")
        .upsert(rows.slice(i, i + 250), {
          onConflict: "business_id,entity_type,record_id",
        });

      if (error) {
        throw new Error("Upload failed for " + table + ": " + error.message);
      }
    }

    results[table] = {
      uploaded: rows.length,
      downloaded: imports[table].length,
      updated: updates[table].length,
    };
  }

  // 7. Apply cloud changes to this device.
  syncState.applying = true;

  try {
    await db.transaction(
      "rw",
      ...TABLES.map(table => db.table(table)),
      db.syncDeletions,
      async () => {
        for (const table of TABLES) {
          const ids = localToDelete[table].map(record => record.id);
          if (ids.length) await db.table(table).bulkDelete(ids);
        }

        for (const table of TABLES) {
          const records = imports[table].map(getBaseRecord);
          if (records.length) await db.table(table).bulkAdd(records);
        }

        const maps = {};

        for (const table of TABLES) {
          const records = await db.table(table).toArray();
          maps[table] = new Map(records.map(r => [r.syncId, r.id]));
        }

        for (const table of TABLES) {
          for (const record of imports[table]) {
            const id = maps[table].get(record.syncId);
            const changes = relationshipChanges(table, record, maps);

            if (id != null && Object.keys(changes).length) {
              await db.table(table).update(id, changes);
            }
          }

          for (const { cloudRecord, localRecord } of updates[table]) {
            const current = await db.table(table).get(localRecord.id);

            // Skip if it was edited on this device while syncing.
            if (!current || current.updatedAt !== localRecord.updatedAt) {
              continue;
            }

            await db.table(table).update(localRecord.id, {
              ...getBaseRecord(cloudRecord),
              ...relationshipChanges(table, cloudRecord, maps),
            });
          }
        }

        if (uploadedDeletionIds.length) {
          await db.syncDeletions.bulkDelete(uploadedDeletionIds);
        }
      }
    );
  } finally {
    syncState.applying = false;
  }

  return {
    success: true,
    business: business.name,
    mode: "TWO-WAY MERGE",
    tables: results,
    warnings,
    message: warnings.length
      ? "Sync finished with " + warnings.length + " warning(s)."
      : "Two-way sync completed.",
  };
}

export async function syncSmartBiz() {
  return syncLocalToCloud();
}

export async function syncToCloud() {
  return syncLocalToCloud();
}



