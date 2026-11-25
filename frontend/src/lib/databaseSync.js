import { syncLocalToCloud } from "./sync";

export async function syncSmartBiz() {
  return await syncLocalToCloud();
}

export async function restoreSmartBiz() {
  throw new Error(
    "Restore is temporarily disabled while two-way synchronization is being implemented. Your records have not been changed."
  );
}
