import { db } from "../db";
import { supabase } from "./supabase";

export async function restoreCloudToLocal() {
  const tables = [
    "products", "customers", "sales", "expenses", "payments",
    "bankTransactions", "stockPurchases", "stockBatches",
    "financialAccounts", "financialTransactions", "stockTransfers"
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      
      if (data && data.length > 0) {
        await db.table(table).clear();
        await db.table(table).bulkPut(data);
      }
    } catch (err) {
      console.error(`Failed to restore ${table}:`, err);
    }
  }
}
