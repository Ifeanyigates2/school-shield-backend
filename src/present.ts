import { config } from "./config";
import { toDisplay } from "./phone";
import { displayState, stateMessage } from "./status";
import { formatClock, formatLongDate, lagosToday } from "./time";
import type { Authorization, Child, Database, Handler, Parent } from "./types";

export function presentParent(parent: Parent, db: Database) {
  const school = db.schools.find((item) => item.id === parent.schoolId);
  return {
    id: parent.id,
    name: parent.name,
    firstName: parent.name.split(" ")[0] ?? parent.name,
    email: parent.email,
    phone: parent.phone,
    phoneDisplay: toDisplay(parent.phone),
    relationship: parent.relationship,
    hasPhoto: Boolean(parent.photoDataUrl),
    school: school ? { id: school.id, name: school.name, campus: school.campus } : null,
    notificationPrefs: parent.notificationPrefs,
    alertsAlwaysOn: ["security_alert", "emergency_authorization"],
  };
}

export function presentChild(child: Child, db: Database) {
  const school = db.schools.find((item) => item.id === child.schoolId);
  return {
    id: child.id,
    name: child.name,
    klass: child.klass,
    color: child.color,
    schoolName: school?.name ?? "",
    campus: school?.campus ?? "",
  };
}

export function presentHandler(handler: Handler, db: Database, now = new Date()) {
  const today = lagosToday(now);
  const pickupCount = db.authorizations.filter(
    (auth) => auth.collector.handlerId === handler.id && auth.status === "used",
  ).length;
  const authorizedToday = db.authorizations.some((auth) => {
    if (auth.collector.handlerId !== handler.id || auth.date !== today || auth.status !== "scheduled") return false;
    return displayState(auth, now) !== "EXPIRED";
  });

  return {
    id: handler.id,
    name: handler.name,
    relationship: handler.relationship,
    phone: handler.phone,
    phoneDisplay: toDisplay(handler.phone),
    status: handler.status,
    pickup: handler.pickup,
    dropoff: handler.dropoff,
    childIds: handler.childIds,
    days: handler.days,
    recurring: handler.recurring,
    color: handler.color,
    hasPhoto: Boolean(handler.photoDataUrl),
    pickupCount,
    authorizedToday,
  };
}

export function presentAuthorization(auth: Authorization, db: Database, now = new Date()) {
  const child = db.children.find((item) => item.id === auth.childId);
  const state = displayState(auth, now);
  return {
    id: auth.id,
    childId: auth.childId,
    childName: child?.name ?? "Child",
    klass: child?.klass ?? "",
    kind: auth.kind,
    collector: {
      type: auth.collector.type,
      handlerId: auth.collector.handlerId ?? null,
      name: auth.collector.name,
      relationship: auth.collector.relationship,
      phone: auth.collector.phone,
      phoneDisplay: toDisplay(auth.collector.phone),
      hasPhoto: auth.collector.hasPhoto,
    },
    date: auth.date,
    dateLabel: formatLongDate(auth.date),
    windowStart: auth.windowStart,
    windowEnd: auth.windowEnd,
    windowLabel: `${formatClock(auth.windowStart)} – ${formatClock(auth.windowEnd)}`,
    windowNote: auth.kind === "pickup" ? "Standard dismissal window" : "Morning drop-off window",
    codeIssuesAt: auth.codeIssuesAt,
    gate: { id: auth.gateId, name: auth.gateName, detail: auth.gateDetail },
    state,
    stateMessage: stateMessage(auth, state),
    oneTime: auth.collector.type === "one_time",
    log: auth.log,
    createdAt: auth.createdAt,
    ...(config.revealCodes ? { demoCode: auth.code } : {}),
  };
}

export function recentPickups(handler: Handler, db: Database) {
  return db.authorizations
    .filter((auth) => auth.collector.handlerId === handler.id && auth.status === "used" && auth.usedAt)
    .sort((a, b) => (a.usedAt! < b.usedAt! ? 1 : -1))
    .slice(0, 8)
    .map((auth) => {
      const child = db.children.find((item) => item.id === auth.childId);
      return {
        childId: auth.childId,
        childName: child?.name ?? "Child",
        at: auth.usedAt,
        when: `${formatLongDate(auth.date)} · ${formatClock(auth.usedAt!)}`,
        gateName: auth.gateName,
      };
    });
}
