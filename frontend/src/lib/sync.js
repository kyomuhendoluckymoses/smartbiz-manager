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

export async function syncLocalToCloud() {
  const { data: { session }, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session) {
    throw new Error("Please sign in with the SmartBiz owner account before syncing.");
  }

  const results = {};

  for (const tableName of TABLES) {
    const records = await db.table(tableName).toArray();

    if (records.length === 0) {
      results[tableName] = 0;
      continue;
    }

    const cloudRecords = records.map(record => ({
      business_id: BUSINESS_ID,
      entity_type: tableName,
      record_id: String(record.id),
      record_data: record,
      updated_at: new Date().toISOString(),
    }));

    const batchSize = 500;

    for (let i = 0; i < cloudRecords.length; i += batchSize) {
      const batch = cloudRecords.slice(i, i + batchSize);

      const { error } = await supabase
        .from("business_records")
        .upsert(batch, {
          onConflict: "business_id,entity_type,record_id",
        });

      if (error) {
        throw new Error(`Sync failed for ${tableName}: ${error.message}`);
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
