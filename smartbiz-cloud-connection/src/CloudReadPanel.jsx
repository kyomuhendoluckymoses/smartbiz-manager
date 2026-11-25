import { useState } from "react";
import { supabase } from "./lib/supabase";
import { syncLocalToCloud } from "./lib/sync";

const BUSINESS_ID = "a7c8c68a-58fd-4277-a291-aca3b6320e27";

export default function CloudReadPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState("");
  const [syncResult, setSyncResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ensureSignedIn() {
    if (user) return user;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user);
    return data.user;
  }

  async function readCloud() {
    setBusy(true);
    setMessage("");
    try {
      const currentUser = await ensureSignedIn();
      const { data: membership, error: memberError } = await supabase
        .from("business_members")
        .select("business_id, user_id, role")
        .eq("business_id", BUSINESS_ID)
        .eq("user_id", currentUser.id)
        .eq("role", "owner")
        .maybeSingle();
      if (memberError) throw memberError;
      if (!membership) throw new Error("This account is not the business owner.");
      const { data, error } = await supabase
        .from("business_records")
        .select("entity_type, record_id, record_data")
        .eq("business_id", BUSINESS_ID);
      if (error) throw error;
      setRecords(data || []);
      setMessage(`Successfully read ${data?.length || 0} records from Supabase.`);
    } catch (error) {
      setMessage(error.message || "Could not read cloud records.");
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    setMessage("Checking all local and cloud records. Existing records will not be overwritten or deleted.");
    setSyncResult(null);
    try {
      await ensureSignedIn();
      const result = await syncLocalToCloud();
      setSyncResult(result);
      const { data, error } = await supabase
        .from("business_records")
        .select("entity_type, record_id, record_data")
        .eq("business_id", BUSINESS_ID);
      if (error) throw error;
      setRecords(data || []);
      setMessage(result.message || "Two-way synchronization completed.");
    } catch (error) {
      setMessage(error.message || "Synchronization stopped safely.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setRecords([]);
    setSyncResult(null);
    setPassword("");
    setMessage("Signed out.");
  }

  const counts = records.reduce((result, record) => {
    result[record.entity_type] = (result[record.entity_type] || 0) + 1;
    return result;
  }, {});

  return (
    <div className="welcome-card">
      <h2>SmartBiz Cloud Sync</h2>
      <p>Connect this device to the shared SmartBiz cloud database.</p>
      {!user && (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <input type="email" placeholder="Owner email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Owner password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={readCloud} disabled={busy}>{busy ? "Working..." : "Read cloud records"}</button>
        <button type="button" onClick={syncAll} disabled={busy || (!user && (!email || !password))}>{busy ? "Synchronizing..." : "Connect and sync all 11 tables"}</button>
        {user && <button type="button" onClick={signOut} disabled={busy}>Sign out</button>}
      </div>
      {message && <p role="status" style={{ marginTop: 14 }}>{message}</p>}
      {syncResult?.tables && (
        <div style={{ marginTop: 18, overflowX: "auto" }}>
          <h3>Synchronization results</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Table</th><th>Downloaded</th><th>Uploaded</th><th>Unchanged</th></tr></thead>
            <tbody>{Object.entries(syncResult.tables).map(([name, item]) => (
              <tr key={name}><td>{name}</td><td align="center">{item.downloaded}</td><td align="center">{item.uploaded}</td><td align="center">{item.unchanged}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {records.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Cloud records by category</h3>
          {Object.entries(counts).map(([type, count]) => <p key={type}><strong>{type}:</strong> {count}</p>)}
          <h3>Cloud record preview</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 350, overflow: "auto", padding: 12, background: "#f3f4f6", borderRadius: 8 }}>{JSON.stringify(records.slice(0, 3), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
