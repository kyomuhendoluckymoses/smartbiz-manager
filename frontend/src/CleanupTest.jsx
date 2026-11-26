
import { useState } from "react";
import { db, syncTables } from "./db";
import { supabase } from "./lib/supabase";
import { getAuthorizedBusiness } from "./lib/businessAccess";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getCloudRecords(businessId, table) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("business_records")
      .select("record_id, entity_type, record_data, updated_at")
      .eq("business_id", businessId)
      .eq("entity_type", table)
      .order("record_id")
      .range(offset, offset + 499);

    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < 500) break;
    offset += data.length;
  }

  return rows;
}

export default function CleanupTest() {
  const [loading, setLoading] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function prepareBackup() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const business = await getAuthorizedBusiness();
      const local = {};
      const cloud = {};

      for (const table of syncTables) {
        local[table] = await db.table(table).toArray();
        cloud[table] = await getCloudRecords(business.id, table);
      }

      const localDeletions = await db.syncDeletions.toArray();
      const localMeta = await db.syncMeta.toArray();
      const cloudDeletions = await getCloudRecords(
        business.id,
        "syncDeletions"
      );

      const backup = {
        application: "SmartBiz Manager",
        business: business.name,
        backupDate: new Date().toISOString(),
        local,
        cloud,
        localDeletions,
        localMeta,
        cloudDeletions
      };

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "smartbiz-backup-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json";

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBackupReady(true);
      setMessage(
        "Backup file prepared. Check your Downloads folder before resetting."
      );
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function resetShopData() {
    if (!backupReady) {
      setError("Create the backup before resetting.");
      return;
    }

    const confirmed = window.confirm(
      "FINAL CONFIRMATION: Clear all shop products, customers, sales, " +
      "expenses, payments, stock and financial records from this business? " +
      "Your account, app, settings and project will remain."
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const business = await getAuthorizedBusiness();
      const local = {};
      const cloud = {};
      const markerMap = new Map();

      for (const table of syncTables) {
        local[table] = await db.table(table).toArray();
        cloud[table] = await getCloudRecords(business.id, table);

        for (const record of local[table]) {
          if (!UUID.test(record.syncId || "")) {
            throw new Error(
              "Reset stopped: an invalid local ID exists in " + table
            );
          }

          markerMap.set(
            table + ":" + record.syncId,
            {
              business_id: business.id,
              entity_type: "syncDeletions",
              record_id: record.syncId,
              record_data: {
                syncId: record.syncId,
                entityType: table,
                deletedAt: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }
          );
        }

        for (const record of cloud[table]) {
          if (!UUID.test(record.record_id || "")) {
            throw new Error(
              "Reset stopped: an invalid cloud ID exists in " + table
            );
          }

          markerMap.set(
            table + ":" + record.record_id,
            {
              business_id: business.id,
              entity_type: "syncDeletions",
              record_id: record.record_id,
              record_data: {
                syncId: record.record_id,
                entityType: table,
                deletedAt: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }
          );
        }
      }

      const markers = [...markerMap.values()];

      for (let i = 0; i < markers.length; i += 250) {
        const { error } = await supabase
          .from("business_records")
          .upsert(markers.slice(i, i + 250), {
            onConflict: "business_id,entity_type,record_id"
          });

        if (error) throw error;
      }

      for (const table of syncTables) {
        const ids = cloud[table].map(row => row.record_id);

        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await supabase
            .from("business_records")
            .delete()
            .eq("business_id", business.id)
            .eq("entity_type", table)
            .in("record_id", ids.slice(i, i + 100));

          if (error) throw error;
        }
      }

      await db.transaction(
        "rw",
        ...syncTables.map(table => db.table(table)),
        db.syncDeletions,
        async () => {
          const existing = await db.syncDeletions.toArray();
          const existingKeys = new Set(
            existing.map(item => item.entityType + ":" + item.syncId)
          );

          const pending = [];

          for (const [key, marker] of markerMap) {
            if (!existingKeys.has(key)) {
              pending.push({
                syncId: marker.record_id,
                entityType: marker.record_data.entityType,
                deletedAt: marker.record_data.deletedAt
              });
            }
          }

          if (pending.length) {
            await db.syncDeletions.bulkAdd(pending);
          }

          for (const table of syncTables) {
            await db.table(table).clear();
          }
        }
      );

      setMessage(
        "Shop records cleared. Your account and app are preserved. " +
        "The cloud deletion markers will clear old records on other devices."
      );
      setBackupReady(false);
    } catch (err) {
      setError(
        "Reset did not finish completely: " +
        (err.message || String(err))
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      maxWidth: 650,
      margin: "40px auto",
      padding: 24,
      fontFamily: "Arial",
      color: "#222"
    }}>
      <h1>SmartBiz Shop Reset</h1>

      <p>
        Remove test shop records while preserving your app,
        business account, login and settings.
      </p>

      <h3>Data affected</h3>
      <ul>
        {syncTables.map(table => (
          <li key={table}>{table}</li>
        ))}
      </ul>

      <button
        onClick={prepareBackup}
        disabled={loading}
        style={{ padding: 14, marginRight: 10 }}
      >
        {loading ? "Working..." : "1. Download Backup"}
      </button>

      <button
        onClick={resetShopData}
        disabled={loading || !backupReady}
        style={{
          padding: 14,
          background: "#b42318",
          color: "white"
        }}
      >
        2. Reset Shop Data
      </button>

      {message && (
        <p style={{ color: "green", marginTop: 20 }}>
          {message}
        </p>
      )}

      {error && (
        <pre style={{
          color: "red",
          whiteSpace: "pre-wrap",
          marginTop: 20
        }}>
          {error}
        </pre>
      )}
    </div>
  );
}
