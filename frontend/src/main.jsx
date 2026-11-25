import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import SyncTest from "./SyncTest.jsx";

const isSyncTest =
  new URLSearchParams(window.location.search).get("sync-test") === "1";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isSyncTest ? <SyncTest /> : <App />}
  </StrictMode>
);
