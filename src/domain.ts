import { HttpError } from "./errors";
import { newId, newNumericCode } from "./ids";
import { toDisplay } from "./phone";
import { displayState } from "./status";
import { lagosInstant, lagosToday, weekdayKey } from "./time";
import type {
  AppNotification,
  Authorization,
  Child,
  CollectorSnapshot,
  Database,
  Handler,
  HandoverKind,
  Parent,
} from "./types";

const HANDLER_COLORS = ["#C45C6A", "#0E7A6B", "#5B8DEF", "#B45309", "#6D28D9"];

export function channelsFor(parent: Parent) {
  const channels = ["in_app"];
  if (parent.notificationPrefs.push) channels.push("push");
  if (parent.notificationPrefs.sms) channels.push("sms");
  if (parent.notificationPrefs.whatsapp) channels.push("whatsapp");
  return channels;
}

export function notify(
  db: Database,
  parent: Parent,
  note: {
    kind: AppNotification["kind"];
    title: string;
    body: string;
    authorizationId?: string;
  },
) {
  const prefs = parent.notificationPrefs;
  const allowed =
    note.kind === "security" ||
    note.kind === "emergency" ||
    (note.kind === "checkin" && prefs.childCheckedIn) ||
    (note.kind === "reminder" && prefs.pickupReminder) ||
    (note.kind === "completed" && prefs.pickupCompleted) ||
    (note.kind === "authorization" && prefs.authorizationChanged);

  if (!allowed) return;

  db.notifications.unshift({
    id: newId("ntf"),
    parentId: parent.id,
    kind: note.kind,
    title: note.title,
    body: note.body,
    channels: channelsFor(parent),
    read: false,
    createdAt: new Date().toISOString(),
    authorizationId: note.authorizationId,
  });
}

export function parentOrThrow(db: Database, parentId: string) {
  const parent = db.parents.find((item) => item.id === parentId);
  if (!parent) throw new HttpError(401, "Sign in required.");
  return parent;
}

export function childForParent(db: Database, parent: Parent, childId: string) {
  const child = db.children.find((item) => item.id === childId && item.parentIds.includes(parent.id));
  if (!child) throw new HttpError(404, "Child not found.");
  return child;
}

export function handlerForParent(db: Database, parent: Parent, handlerId: string) {
  const handler = db.handlers.find((item) => item.id === handlerId && item.parentId === parent.id);
  if (!handler) throw new HttpError(404, "Handler not found.");
  return handler;
}

export function newCode(db: Database, exceptId?: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = newNumericCode(6);
    const clash = db.authorizations.some((auth) => auth.code === code && auth.id !== exceptId);
    if (!clash) return code;
  }
  throw new HttpError(500, "Could not issue a code. Try again.");
}

function schoolFor(db: Database, parent: Parent) {
  const school = db.schools.find((item) => item.id === parent.schoolId);
  if (!school) throw new HttpError(500, "School record is missing.");
  return school;
}

export function assertHandlerCanCollect(handler: Handler, child: Child, kind: HandoverKind) {
  if (handler.status !== "ACTIVE") {
    throw new HttpError(400, `${handler.name} is paused. Resume them before authorizing a handover.`);
  }
  if (!handler.childIds.includes(child.id)) {
    throw new HttpError(400, `${handler.name} is not allowed to collect ${child.name}.`);
  }
  if (kind === "pickup" && !handler.pickup) {
    throw new HttpError(400, `${handler.name} is not allowed to collect at pickup.`);
  }
  if (kind === "dropoff" && !handler.dropoff) {
    throw new HttpError(400, `${handler.name} is not allowed to drop off.`);
  }
  if (!handler.photoDataUrl) {
    throw new HttpError(400, `Add a photo of ${handler.name} before authorizing a handover.`);
  }
}

export type CollectorInput =
  | { type: "handler"; handlerId: string }
  | { type: "self" }
  | { type: "one_time"; name: string; phone: string; relationship: string; photoDataUrl: string };

function resolveCollector(
  db: Database,
  parent: Parent,
  child: Child,
  kind: HandoverKind,
  input: CollectorInput,
): CollectorSnapshot {
  if (input.type === "self") {
    if (!parent.photoDataUrl) throw new HttpError(400, "Add your photo before collecting in person.");
    return {
      type: "self",
      name: parent.name,
      phone: parent.phone,
      relationship: parent.relationship,
      hasPhoto: true,
    };
  }

  if (input.type === "one_time") {
    return {
      type: "one_time",
      name: input.name.trim(),
      phone: input.phone,
      relationship: input.relationship.trim(),
      hasPhoto: true,
    };
  }

  const handler = handlerForParent(db, parent, input.handlerId);
  assertHandlerCanCollect(handler, child, kind);
  return {
    type: "handler",
    handlerId: handler.id,
    name: handler.name,
    phone: handler.phone,
    relationship: handler.relationship,
    hasPhoto: true,
  };
}

export function createAuthorization(
  db: Database,
  parent: Parent,
  input: {
    childId: string;
    kind: HandoverKind;
    date?: string;
    gateId?: string;
    collector: CollectorInput;
  },
) {
  const child = childForParent(db, parent, input.childId);
  const date = input.date ?? lagosToday();
  if (date < lagosToday()) throw new HttpError(400, "That date has already passed.");
  const day = weekdayKey(date);
  if (day === "Sat" || day === "Sun") throw new HttpError(400, "Choose a school day.");

  const clash = db.authorizations.some(
    (auth) =>
      auth.childId === child.id &&
      auth.kind === input.kind &&
      auth.date === date &&
      auth.status === "scheduled" &&
      displayState(auth) !== "EXPIRED",
  );
  if (clash) {
    throw new HttpError(409, "This child already has an authorization that day. Cancel it before choosing someone else.");
  }

  const school = schoolFor(db, parent);
  const gate = school.gates.find((item) => item.id === (input.gateId ?? school.gates[0]?.id));
  if (!gate) throw new HttpError(404, "Gate not found.");

  const collector = resolveCollector(db, parent, child, input.kind, input.collector);
  const window = input.kind === "pickup" ? school.pickupWindow : school.dropoffWindow;
  const windowStart = lagosInstant(date, window.start);
  const windowEnd = lagosInstant(date, window.end);
  const auth: Authorization = {
    id: newId("aut"),
    parentId: parent.id,
    childId: child.id,
    kind: input.kind,
    collector,
    date,
    windowStart,
    windowEnd,
    codeIssuesAt: new Date(new Date(windowStart).getTime() - 15 * 60 * 1000).toISOString(),
    gateId: gate.id,
    gateName: gate.name,
    gateDetail: gate.detail,
    code: newCode(db),
    status: "scheduled",
    reminderSent: false,
    createdAt: new Date().toISOString(),
    log: [
      `Code sent by SMS to +234 ${toDisplay(collector.phone)}.`,
      `${gate.name} can expect ${collector.name} during this window.`,
    ],
  };

  db.authorizations.push(auth);
  const label = input.kind === "pickup" ? "Pickup" : "Drop-off";
  notify(db, parent, {
    kind: "authorization",
    title: `${label} authorized`,
    body: `${collector.name} can ${input.kind === "pickup" ? "collect" : "drop off"} ${child.name} on ${date}.`,
    authorizationId: auth.id,
  });
  return auth;
}

export function cancelAuthorization(db: Database, parent: Parent, auth: Authorization) {
  if (auth.status === "used") throw new HttpError(409, "This handover is already complete.");
  if (auth.status === "cancelled") throw new HttpError(409, "This authorization is already cancelled.");
  if (displayState(auth) === "EXPIRED") throw new HttpError(409, "That window has already closed.");

  auth.status = "cancelled";
  auth.cancelledAt = new Date().toISOString();
  auth.log.push(`${auth.collector.name}'s code stopped working. ${auth.gateName} was told.`);
  const child = db.children.find((item) => item.id === auth.childId);
  notify(db, parent, {
    kind: "authorization",
    title: "Authorization cancelled",
    body: `${auth.collector.name}'s ${auth.kind} for ${child?.name ?? "your child"} was cancelled. ${auth.gateName} was updated.`,
    authorizationId: auth.id,
  });
}

export function resendCode(db: Database, auth: Authorization) {
  if (auth.status === "cancelled") throw new HttpError(409, "This authorization was cancelled.");
  if (auth.status === "used") throw new HttpError(409, "This code has already been used.");
  if (displayState(auth) === "EXPIRED") throw new HttpError(409, "That window has already closed.");

  auth.code = newCode(db, auth.id);
  auth.log.push(`Code sent again by SMS to +234 ${toDisplay(auth.collector.phone)}.`);
}

export function syncHandlerOnAuthorizations(db: Database, handler: Handler, phoneChanged: boolean) {
  for (const auth of db.authorizations) {
    if (auth.collector.handlerId !== handler.id || auth.status !== "scheduled") continue;
    if (displayState(auth) === "EXPIRED") continue;
    auth.collector.name = handler.name;
    auth.collector.relationship = handler.relationship;
    auth.collector.phone = handler.phone;
    auth.collector.hasPhoto = Boolean(handler.photoDataUrl);
    if (!phoneChanged) continue;
    auth.code = newCode(db, auth.id);
    auth.log.push(
      `Phone number changed. A fresh code was sent to +234 ${toDisplay(handler.phone)}. The previous code no longer works.`,
    );
  }
}

export function removeHandler(db: Database, parent: Parent, handler: Handler) {
  const cancelled: string[] = [];
  for (const auth of db.authorizations) {
    if (auth.collector.handlerId !== handler.id || auth.status !== "scheduled") continue;
    if (displayState(auth) === "EXPIRED") continue;
    cancelAuthorization(db, parent, auth);
    cancelled.push(auth.id);
  }
  db.assignments = db.assignments.filter((item) => item.handlerId !== handler.id);
  db.handlers = db.handlers.filter((item) => item.id !== handler.id);
  return cancelled;
}

export function nextHandlerColor(db: Database, parentId: string) {
  const count = db.handlers.filter((item) => item.parentId === parentId).length;
  return HANDLER_COLORS[count % HANDLER_COLORS.length];
}

export function ownedAuthorization(db: Database, parentId: string, authorizationId: string) {
  const auth = db.authorizations.find((item) => item.id === authorizationId && item.parentId === parentId);
  if (!auth) throw new HttpError(404, "Authorization not found.");
  return auth;
}
