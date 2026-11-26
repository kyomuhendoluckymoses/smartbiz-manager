
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import SyncTest from "./SyncTest.jsx";
import ProtectedCleanup from "./ProtectedCleanup.jsx";

const params = new URLSearchParams(window.location.search);

const isCleanup = params.get("cleanup") === "1";
const isSyncTest = params.get("sync-test") === "1";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isCleanup ? (
      <ProtectedCleanup />
    ) : isSyncTest ? (
      <SyncTest />
    ) : (
      <App />
    )}
  </StrictMode>
);

