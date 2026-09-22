import { notify } from "./domain";
import { getDb, save } from "./store";
import { formatClock } from "./time";

export function sendDueReminders() {
  const db = getDb();
  const now = Date.now();
  let changed = false;

  for (const auth of db.authorizations) {
    if (auth.status !== "scheduled" || auth.reminderSent) continue;
    const start = new Date(auth.windowStart).getTime();
    const remindAt = start - 30 * 60 * 1000;
    if (now < remindAt || now >= start) continue;

    auth.reminderSent = true;
    changed = true;
    const parent = db.parents.find((item) => item.id === auth.parentId);
    const child = db.children.find((item) => item.id === auth.childId);
    if (!parent || !child) continue;
    notify(db, parent, {
      kind: "reminder",
      title: auth.kind === "pickup" ? "Pickup reminder" : "Drop-off reminder",
      body: `${auth.collector.name} is due at ${auth.gateName} at ${formatClock(auth.windowStart)} for ${child.name}.`,
      authorizationId: auth.id,
    });
  }

  if (changed) save();
}
