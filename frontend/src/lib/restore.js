import { db } from "../db";
import { supabase } from "./supabase";

const BUSINESS_ID = "a7c8c68a-58fd-4277-a291-aca3b6320e27";

const TABLES = [
  "products",
  "customers",
  "financialAccounts",
  "sales",
  "expenses",
  "payments",
  "bankTransactions",
  "stockPurchases",
  "stockBatches",
  "financialTransactions",
  "stockTransfers",
];

export async function restoreCloudToLocal() {
  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) {
    throw new Error("Please sign in with the SmartBiz owner account before restoring.");
  }

  for (const tableName of TABLES) {
    const count = await db.table(tableName).count();

    if (count > 0) {
      throw new Error(
        `Restore stopped: your local ${tableName} table already contains ${count} records. No local records were changed.`
      );
    }
  }

  const restored = {};

  for (const tableName of TABLES) {
    let offset = 0;
    let total = 0;
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
        throw new Error(`Restore failed for ${tableName}: ${error.message}`);
      }

      if (!data || data.length === 0) break;

      const records = data.map(row => {
        const record = row.record_data;

        if (!record || typeof record !== "object") {
          throw new Error(`Invalid cloud record found in ${tableName}.`);
        }

        const id = Number(row.record_id);

        if (!Number.isSafeInteger(id) || id <= 0) {
          throw new Error(`Invalid record ID found in ${tableName}.`);
        }

        return { ...record, id };
      });

      await db.table(tableName).bulkAdd(records);

      total += records.length;
      offset += data.length;

      if (data.length < pageSize) break;
    }

    restored[tableName] = total;
  }

  return {
    success: true,
    business: "Friend New",
    restored,
  };
}
