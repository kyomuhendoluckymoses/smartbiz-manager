import { db, syncTables } from "../db";
import { supabase } from "./supabase";
import { getAuthorizedBusiness } from "./businessAccess";

const DELETION_ENTITY = "syncDeletions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Produce consistent JSON for comparing records.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          key =>
            JSON.stringify(key) + ":" + stableStringify(value[key])
        )
        .join(",") +
      "}"
    );
  }

  return JSON.stringify(value);
}

// Ignore local database IDs and synchronization-only relationship metadata.
function comparableRecord(record) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const copy = { ...record };

  delete copy.id;
  delete copy._syncLinks;

  return copy;
}

// Read every cloud page without changing anything.
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
        "Could not read cloud records for " +
          entityType +
          ": " +
          error.message
      );
    }

    const page = data || [];

    rows.push(...page);

    offset += page.length;

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

// Compare local and cloud records by their stable syncId.
function compareTable(localRecords, cloudRows, table) {
  const localById = new Map();
  const cloudById = new Map();

  const report = {
    local: localRecords.length,
    cloud: 0,
    localOnly: 0,
    cloudOnly: 0,
    identical: 0,
    conflicts: 0,
    invalidCloud: 0,
    duplicateCloud: 0,
    invalidLocal: 0,
    duplicateLocal: 0,
  };

  for (const record of localRecords) {
    if (!UUID_PATTERN.test(record.syncId || "")) {
      report.invalidLocal++;
      continue;
    }

    if (localById.has(record.syncId)) {
      report.duplicateLocal++;
      continue;
    }

    localById.set(record.syncId, record);
  }

  for (const row of cloudRows) {
    const record = row.record_data;

    if (
      !UUID_PATTERN.test(row.record_id || "") ||
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      record.syncId !== row.record_id
    ) {
      report.invalidCloud++;
      continue;
    }

    if (cloudById.has(row.record_id)) {
      report.duplicateCloud++;
      continue;
    }

    cloudById.set(row.record_id, record);
  }

  report.cloud = cloudById.size;

  for (const [syncId, localRecord] of localById) {
    const cloudRecord = cloudById.get(syncId);

    if (!cloudRecord) {
      report.localOnly++;
      continue;
    }

    const localContent = stableStringify(
      comparableRecord(localRecord)
    );

    const cloudContent = stableStringify(
      comparableRecord(cloudRecord)
    );

    if (localContent === cloudContent) {
      report.identical++;
    } else {
      report.conflicts++;
    }
  }

  for (const syncId of cloudById.keys()) {
    if (!localById.has(syncId)) {
      report.cloudOnly++;
    }
  }

  return report;
}

// Main read-only preview.
export async function previewSmartBizSync() {
  try {
    // 1. Verify the signed-in business owner.
    const business = await getAuthorizedBusiness();

    if (!business || !business.id) {
      throw new Error("Business ownership could not be verified.");
    }

    // 2. Confirm an authenticated Supabase session.
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      throw new Error("Please sign in before checking cloud sync.");
    }

    const report = {};
    const warnings = [];

    let totalLocal = 0;
    let totalCloud = 0;
    let totalLocalOnly = 0;
    let totalCloudOnly = 0;
    let totalIdentical = 0;
    let totalConflicts = 0;
    let totalInvalid = 0;
    let totalDuplicates = 0;

    // 3. Read and compare every synchronized table.
    for (const table of syncTables) {
      const localRecords = await db.table(table).toArray();

      const cloudRows = await fetchCloudRows(
        business.id,
        table
      );

      const tableReport = compareTable(
        localRecords,
        cloudRows,
        table
      );

      report[table] = tableReport;

      totalLocal += tableReport.local;
      totalCloud += tableReport.cloud;
      totalLocalOnly += tableReport.localOnly;
      totalCloudOnly += tableReport.cloudOnly;
      totalIdentical += tableReport.identical;
      totalConflicts += tableReport.conflicts;

      totalInvalid +=
        tableReport.invalidLocal +
        tableReport.invalidCloud;

      totalDuplicates +=
        tableReport.duplicateLocal +
        tableReport.duplicateCloud;

      if (
        tableReport.invalidLocal ||
        tableReport.invalidCloud
      ) {
        warnings.push(
          table +
            " contains invalid synchronization records."
        );
      }

      if (
        tableReport.duplicateLocal ||
        tableReport.duplicateCloud
      ) {
        warnings.push(
          table +
            " contains duplicate synchronization IDs."
        );
      }
    }

    // 4. Read deletion information without changing it.
    const localDeletions = await db.syncDeletions.toArray();

    const cloudDeletionRows = await fetchCloudRows(
      business.id,
      DELETION_ENTITY
    );

    const validCloudDeletions = cloudDeletionRows.filter(row => {
      const info = row.record_data;

      return (
        UUID_PATTERN.test(row.record_id || "") &&
        info &&
        typeof info === "object" &&
        UUID_PATTERN.test(info.syncId || "") &&
        info.syncId === row.record_id &&
        syncTables.includes(info.entityType)
      );
    });

    const pendingDeletions = {
      local: localDeletions.length,
      cloud: validCloudDeletions.length,
      invalidCloud:
        cloudDeletionRows.length - validCloudDeletions.length,
    };

    if (pendingDeletions.invalidCloud > 0) {
      warnings.push(
        "Some cloud deletion records have invalid data."
      );
    }

    // 5. Return the report. Nothing has been modified.
    return {
      success: true,
      mode: "READ ONLY",
      business: business.name,
      businessId: business.id,

      tables: report,

      pendingDeletions,

      totals: {
        local: totalLocal,
        cloud: totalCloud,
        localOnly: totalLocalOnly,
        cloudOnly: totalCloudOnly,
        identical: totalIdentical,
        conflicts: totalConflicts,
        invalid: totalInvalid,
        duplicates: totalDuplicates,
      },

      totalLocal,
      totalCloud,
      totalConflicts,

      warnings,

      message:
        warnings.length > 0
          ? "Read-only preview completed with warnings. Review them before synchronizing."
          : "Read-only preview completed successfully. No records were changed.",
    };
  } catch (error) {
    console.error("SmartBiz sync preview failed:", error);

    throw new Error(
      error.message || "Could not complete the cloud sync preview."
    );
  }
}