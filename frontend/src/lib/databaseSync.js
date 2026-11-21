import { syncLocalToCloud } from "./sync";
import { restoreCloudToLocal } from "./restore";

export async function syncSmartBiz() {
  return await syncLocalToCloud();
}

export async function restoreSmartBiz() {
  return await restoreCloudToLocal();
}
