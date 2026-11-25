import React from "react";
import { createRoot } from "react-dom/client";
import OwnerSyncPanel from "./OwnerSyncPanel";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerSyncPanel />
  </React.StrictMode>
);
