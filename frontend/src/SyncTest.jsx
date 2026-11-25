import { useState } from "react";
import { supabase } from "./lib/supabase";
import { previewSmartBizSync } from "./lib/syncPreview";
import { syncLocalToCloud } from "./lib/sync";
import { db } from "./db";

export default function SyncTest() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      setSignedIn(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await previewSmartBizSync();
      setResult(data);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runTwoWaySync() {
    const confirmed = window.confirm(
      "Run two-way synchronization for Friend New? This will upload local-only records and import cloud-only records. Continue?"
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await syncLocalToCloud();
      setResult(data);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }


  async function inspectStockLinks() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const products = await db.products.toArray();
      const batches = await db.stockBatches.toArray();

      setResult({
        mode: "READ ONLY STOCK RELATIONSHIP DIAGNOSTIC",
        products: products.map(p => ({ ...p })),
        stockBatches: batches.map(b => ({ ...b })),
        unmatchedBatches: batches
          .filter(b => !products.some(p => p.id === b.productId))
          .map(b => ({
            batchId: b.id,
            productId: b.productId
          }))
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function checkMissingProduct() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const tables = [
        "products",
        "sales",
        "stockPurchases",
        "stockTransfers",
        "stockBatches"
      ];

      const local = {};

      for (const name of tables) {
        local[name] = await db.table(name).toArray();
      }

      const { data: cloudProducts, error: cloudError } = await supabase
        .from("business_records")
        .select("record_id, record_data, updated_at")
        .eq("business_id", "a7c8c68a-58fd-4277-a291-aca3b6320e27")
        .eq("entity_type", "products");

      if (cloudError) throw cloudError;

      setResult({
        mode: "READ ONLY MISSING PRODUCT INVESTIGATION",
        localProducts: local.products,
        cloudProducts,
        recordsReferencingProductId1: {
          sales: local.sales.filter(x => x.productId === 1),
          stockPurchases: local.stockPurchases.filter(x => x.productId === 1),
          stockTransfers: local.stockTransfers.filter(x => x.productId === 1),
          stockBatches: local.stockBatches.filter(x => x.productId === 1)
        }
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function inspectProductHistory() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const names = [
        "sales",
        "stockPurchases",
        "stockBatches",
        "stockTransfers"
      ];

      const local = {};

      for (const name of names) {
        local[name] = await db.table(name).toArray();
      }

      const businessId = "a7c8c68a-58fd-4277-a291-aca3b6320e27";
      const cloud = {};

      for (const name of names) {
        const { data, error } = await supabase
          .from("business_records")
          .select("record_id, record_data, updated_at")
          .eq("business_id", businessId)
          .eq("entity_type", name);

        if (error) throw error;
        cloud[name] = data;
      }

      setResult({
        mode: "READ ONLY PRODUCT HISTORY",
        local,
        cloud
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div style={{
      padding: 30,
      fontFamily: "Arial",
      maxWidth: 1000,
      margin: "0 auto"
    }}>
      <h1>SmartBiz Cloud Sync Test</h1>
      <p>Friend New — Two-way synchronization</p>

      {!signedIn ? (
        <>
          <h3>Owner sign-in</h3>

          <input
            placeholder="Owner email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <br /><br />

          <input
            type="password"
            placeholder="Owner password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <br /><br />

          <button onClick={signIn} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "green" }}>Owner authenticated.</p>

          <br /><br />
          <button onClick={inspectStockLinks} disabled={loading}>
            Inspect Stock Relationships (Read Only)
          </button>
          <br /><br />
          <button onClick={checkMissingProduct} disabled={loading}>
            Check Missing Product (Local + Cloud)
          </button>
          <br /><br />
          <button onClick={inspectProductHistory} disabled={loading}>
            Inspect Product History (Read Only)
          </button>
          <button onClick={runTest} disabled={loading}>
            {loading ? "Working..." : "Run Read-only Test"}
          </button>

          <br /><br />

          <button
            onClick={runTwoWaySync}
            disabled={loading}
            style={{
              padding: "12px 22px",
              background: "#1677d2",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "wait" : "pointer"
            }}
          >
            {loading ? "Synchronizing..." : "Run Two-Way Sync"}
          </button>

          <p style={{ color: "#666", fontSize: 13 }}>
            Synchronizes local-only and cloud-only records.
            Restore is not available on this test page.
          </p>
        </>
      )}

      {error && (
        <pre style={{
          color: "red",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere"
        }}>
          {error}
        </pre>
      )}

      {result && (
        <>
          <h2>
            {result.success ? "Synchronization result" : "Test result"}
          </h2>

          <pre style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            background: "#f3f4f6",
            color: "#111",
            padding: 15,
            borderRadius: 8
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}





