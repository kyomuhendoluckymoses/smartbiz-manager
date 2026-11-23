import { db, syncTables } from "../db";
import { getAuthorizedBusiness } from "./businessAccess";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function buildMaps(local) {
  const maps = {};

  for (const table of syncTables) {
    maps[table] = new Map(
      local[table].map(record => [record.id, record.syncId])
    );
  }

  return maps;
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

function comparableRecord(record) {
  const {
    id,
    customerId,
    productId,
    saleId,
    purchaseId,
    financialAccountId,
    accountId,
    referenceId,
    ...stableFields
  } = record;

  return stableFields;
}

export async function previewSmartBizSync() {
  const business = await getAuthorizedBusiness();

  const local = {};
  const cloud = {};
  const report = {};
  const maps = {};

  for (const table of syncTables) {
    local[table] = await db.table(table).toArray();
  }

  const invalidLocal = [];

  for (const table of syncTables) {
    for (const record of local[table]) {
      if (!UUID_PATTERN.test(record.syncId || "")) {
        invalidLocal.push(table + ": invalid syncId");
      }
    }
  }

  if (invalidLocal.length) {
    throw new Error(
      "Preview stopped because local records have invalid IDs: " +
      invalidLocal.slice(0, 10).join("; ")
    );
  }

  Object.assign(maps, buildMaps(local));

  for (const table of syncTables) {
    cloud[table] = [];
    let offset = 0;
    const pageSize = 500;

    while (true) {
      const { data, error } = await (await import("./supabase"))
        .supabase
        .from("business_records")
        .select("record_id, record_data, updated_at")
        .eq("business_id", business.id)
        .eq("entity_type", table)
        .order("record_id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error("Read-only preview failed for " + table + ": " + error.message);
      }

      if (!data || data.length === 0) break;

      cloud[table].push(...data);
      offset += data.length;

      if (data.length < pageSize) break;
    }
  }

  for (const table of syncTables) {
    const localById = new Map(
      local[table].map(record => [record.syncId, record])
    );

    const cloudById = new Map();

    for (const row of cloud[table]) {
      if (!UUID_PATTERN.test(row.record_id || "")) {
        throw new Error(
          "Legacy or invalid cloud ID detected in " + table +
          ". Preview stopped; no records were changed."
        );
      }

      if (
        !row.record_data ||
        row.record_data.syncId !== row.record_id ||
        (table !== "products" && !row.record_data._syncLinks)
      ) {
        const details = {
          recordId: row.record_id,
          hasRecordData: !!row.record_data,
          syncIdMatches: !!row.record_data &&
            row.record_data.syncId === row.record_id,
          hasSyncLinks: !!row.record_data && !!row.record_data._syncLinks,
          recordFields: row.record_data &&
            typeof row.record_data === "object"
            ? Object.keys(row.record_data)
            : []
        };

        throw new Error(
          "Cloud record validation failed in " + table +
          ": " + JSON.stringify(details)
        );
      }

      cloudById.set(
        row.record_id,
        table === "products" && !row.record_data._syncLinks
          ? { ...row.record_data, _syncLinks: {} }
          : row.record_data
      );
    }

    const counts = {
      local: local[table].length,
      cloud: cloud[table].length,
      localOnly: 0,
      cloudOnly: 0,
      identical: 0,
      conflicts: 0,
    };

    for (const record of local[table]) {
      const cloudRecord = cloudById.get(record.syncId);

      if (!cloudRecord) {
        counts.localOnly++;
        continue;
      }

      const linkedLocal = addLinks(table, record, maps);

      if (stableStringify(comparableRecord(linkedLocal)) === stableStringify(comparableRecord(cloudRecord))) {
        counts.identical++;
      } else {
        counts.conflicts++;
      }
    }

    for (const cloudId of cloudById.keys()) {
      if (!localById.has(cloudId)) {
        counts.cloudOnly++;
      }
    }

    report[table] = {
  ...counts,
  localSyncIds: local[table].map(record => record.syncId).sort(),
  cloudSyncIds: [...cloudById.keys()].sort(),
};
  }

  const pendingDeletions = await db.syncDeletions.count();

  return {
    success: true,
    mode: "READ ONLY",
    business: business.name,
    tables: report,
    pendingDeletions,
    totalLocal: Object.values(report).reduce((n, r) => n + r.local, 0),
    totalCloud: Object.values(report).reduce((n, r) => n + r.cloud, 0),
    totalConflicts: Object.values(report).reduce((n, r) => n + r.conflicts, 0),
  };
}





