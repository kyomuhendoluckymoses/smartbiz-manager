import { db } from "./db";
import { supabase } from "./lib/supabase";

// Function to push local unsynced records to Supabase
export async function syncToCloud() {
  if (!navigator.onLine) return; // Don't run if offline

  try {
    // 1. Sync Products
    const localProducts = await db.products.toArray();
    if (localProducts.length > 0) {
      const { error } = await supabase
        .from('products')
        .upsert(localProducts, { onConflict: 'id' });
      if (error) console.error("Error syncing products:", error);
    }

    // 2. Sync Sales
    const localSales = await db.sales.toArray();
    if (localSales.length > 0) {
      const { error } = await supabase
        .from('sales')
        .upsert(localSales, { onConflict: 'id' });
      if (error) console.error("Error syncing sales:", error);
    }

    // 3. Sync Expenses
    const localExpenses = await db.expenses.toArray();
    if (localExpenses.length > 0) {
      const { error } = await supabase
        .from('expenses')
        .upsert(localExpenses, { onConflict: 'id' });
      if (error) console.error("Error syncing expenses:", error);
    }

    console.log("✅ Cloud sync complete.");
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

// Function to pull cloud data to local (e.g., when logging in on a new device)
export async function syncFromCloud() {
  if (!navigator.onLine) return;

  try {
    // Example for Products
    const { data: cloudProducts, error } = await supabase.from('products').select('*');
    if (!error && cloudProducts) {
      await db.products.bulkPut(cloudProducts);
    }
    
    // You would repeat this for sales, expenses, etc.
    console.log("✅ Cloud data downloaded to local.");
  } catch (err) {
    console.error("Failed to pull from cloud:", err);
  }
}
