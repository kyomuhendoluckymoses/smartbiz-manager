import { db } from "../db";
import { supabase } from "./supabase";

export async function syncLocalToCloud() {
  const tables = [
    "products", "customers", "sales", "expenses", "payments",
    "bankTransactions", "stockPurchases", "stockBatches",
    "financialAccounts", "financialTransactions", "stockTransfers"
  ];

  for (const table of tables) {
    try {
      const localData = await db.table(table).toArray();
      if (localData.length > 0) {
        const { error } = await supabase.from(table).upsert(localData);
        if (error) console.error(`Error syncing ${table}:`, error.message);
      }
    } catch (err) {
      console.error(`Failed to sync ${table}:`, err);
    }
  }
}
