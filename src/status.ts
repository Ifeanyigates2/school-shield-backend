import type { Authorization, DisplayState } from "./types";
import { formatClock } from "./time";

const EXPIRING_MS = 15 * 60 * 1000;

export function displayState(auth: Authorization, now = new Date()): DisplayState {
  if (auth.status === "cancelled") return "CANCELLED";
  if (auth.status === "used") return "ALREADY USED";

  const time = now.getTime();
  const start = new Date(auth.windowStart).getTime();
  const end = new Date(auth.windowEnd).getTime();
  if (time > end) return "EXPIRED";
  if (time >= start && end - time <= EXPIRING_MS) return "EXPIRING SOON";
  if (time >= start) return "ACTIVE";
  return "NOT YET ACTIVE";
}

export function stateMessage(auth: Authorization, state = displayState(auth)) {
  const opens = formatClock(auth.windowStart);
  const closes = formatClock(auth.windowEnd);

  if (state === "NOT YET ACTIVE") return `Becomes active at ${opens}`;
  if (state === "ACTIVE") return `Code is live at the ${auth.gateName} now`;
  if (state === "EXPIRING SOON") {
    const minutes = Math.max(1, Math.ceil((new Date(auth.windowEnd).getTime() - Date.now()) / 60000));
    return `Window closes in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (state === "EXPIRED") return `Window closed at ${closes} · issue a new one`;
  if (state === "CANCELLED") {
    const when = auth.cancelledAt ? formatClock(auth.cancelledAt) : "earlier";
    return `You cancelled this at ${when}`;
  }

  const used = auth.usedAt ? formatClock(auth.usedAt) : closes;
  return `Used at ${used} · handover complete`;
}

export function gateAllows(state: DisplayState) {
  return state === "ACTIVE" || state === "EXPIRING SOON";
}
