import { useState } from "react";
import { supabase } from "./lib/supabase";
import CleanupTest from "./CleanupTest";

export default function ProtectedCleanup() {
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);

  async function verifyPassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const email = data.session?.user?.email;

      if (!email) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password
        });

      if (authError) {
        throw new Error("Incorrect password. Please try again.");
      }

      setPassword("");
      setAuthorized(true);
    } catch (err) {
      setError(err.message || "Password verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (authorized) return <CleanupTest />;

  return (
    <div className="welcome-card" style={{ maxWidth: 650 }}>
      <h2>Reset Shop Data</h2>
      <p>
        Clear shop records while preserving your business account,
        login, application and settings.
      </p>

      {!opened ? (
        <button
          type="button"
          onClick={() => setOpened(true)}
          style={{
            padding: "12px 20px",
            background: "#b42318",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer"
          }}
        >
          Reset Shop Data
        </button>
      ) : (
        <form onSubmit={verifyPassword}>
          <label htmlFor="reset-owner-password">
            Confirm your SmartBiz account password
          </label>

          <input
            id="reset-owner-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              padding: 12,
              margin: "12px 0",
              boxSizing: "border-box"
            }}
          />

          {error && (
            <p style={{ color: "#b42318" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            style={{
              padding: "12px 20px",
              background: "#b42318",
              color: "#fff",
              border: 0,
              borderRadius: 8
            }}
          >
            {busy ? "Verifying..." : "Verify Password"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpened(false);
              setPassword("");
              setError("");
            }}
            disabled={busy}
            style={{ padding: 12, marginLeft: 10 }}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
