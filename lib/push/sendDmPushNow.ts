import { triggerPushDispatchBestEffort } from "./triggerDispatchSoon";

// Kept for older callers. The transaction that creates the DM notification
// creates its outbox item; all delivery now passes through the claimed worker.
export async function sendDmPushNow(args: { threadId: string; senderId: string; body: string }) {
  void args;
  return triggerPushDispatchBestEffort("dm");
}
