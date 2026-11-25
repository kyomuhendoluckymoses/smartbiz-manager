import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { syncSmartBiz, restoreSmartBiz } from "./lib/databaseSync";

export default function OwnerSyncPanel() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      setPassword("");
      setMessage("Owner signed in successfully.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    setMessage("");

    try {
      const result = await syncSmartBiz();
      const total = Object.values(result.uploaded)
        .reduce((sum, count) => sum + count, 0);

      setMessage(`Cloud upload completed. ${total} records uploaded or updated.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runRestore() {
    if (!window.confirm(
      "Restore cloud records to this device? This works only when all local tables are empty."
    )) return;

    setBusy(true);
    setMessage("");

    try {
      const result = await restoreSmartBiz();
      const total = Object.values(result.restored)
        .reduce((sum, count) => sum + count, 0);

      setMessage(`Cloud restore completed. ${total} records restored.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMessage("Owner signed out.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{
      maxWidth: 460,
      margin: "24px auto",
      padding: 24,
      border: "1px solid #ddd",
      borderRadius: 14,
      background: "#fff"
    }}>
      <h2>SmartBiz Cloud Connection</h2>
      <p>Friend New · Owner account</p>

      {!session ? (
        <form onSubmit={login}>
          <label>Email address</label>
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            autoComplete="username"
            style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px" }}
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px" }}
          />

          <button disabled={busy} type="submit">
            {busy ? "Signing in..." : "Owner Login"}
          </button>
        </form>
      ) : (
        <>
          <p>Signed in as: {session.user.email}</p>

          <button disabled={busy} onClick={runSync}>
            {busy ? "Working..." : "Sync Now"}
          </button>

          <button
            disabled={busy}
            onClick={runRestore}
            style={{ marginLeft: 8 }}
          >
            Restore from Cloud
          </button>

          <button
            disabled={busy}
            onClick={logout}
            style={{ display: "block", marginTop: 16 }}
          >
            Sign Out
          </button>
        </>
      )}

      {message && <p role="status">{message}</p>}
    </section>
  );
}
