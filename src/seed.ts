import { DEMO } from "./demo";
import { hashPassword } from "./passwords";
import { toDisplay } from "./phone";
import { lagosInstant, lagosToday, previousWeekday } from "./time";
import type { Authorization, Database, Handler, Weekday } from "./types";

const DEFAULT_PREFS = {
  push: true,
  sms: true,
  whatsapp: false,
  childCheckedIn: true,
  pickupReminder: true,
  pickupCompleted: true,
  authorizationChanged: false,
};

function collector(handler: Handler) {
  return {
    type: "handler" as const,
    handlerId: handler.id,
    name: handler.name,
    phone: handler.phone,
    relationship: handler.relationship,
    hasPhoto: true,
  };
}

function usedPickup(id: string, code: string, childId: string, handler: Handler, date: string): Authorization {
  const windowStart = lagosInstant(date, "14:30");
  return {
    id,
    parentId: "par_zara",
    childId,
    kind: "pickup",
    collector: collector(handler),
    date,
    windowStart,
    windowEnd: lagosInstant(date, "15:30"),
    codeIssuesAt: new Date(new Date(windowStart).getTime() - 15 * 60 * 1000).toISOString(),
    gateId: "gate_main",
    gateName: "Main Gate",
    gateDetail: "Primary 1–6",
    code,
    status: "used",
    usedAt: lagosInstant(date, "14:52"),
    reminderSent: true,
    createdAt: lagosInstant(date, "06:40"),
    log: [
      `Code sent by SMS to +234 ${toDisplay(handler.phone)}.`,
      "Handover completed at the Main Gate.",
    ],
  };
}

function week(
  childId: string,
  kind: "pickup" | "dropoff",
  days: Array<[Weekday, string]>,
) {
  return days.map(([day, handlerId]) => ({
    id: `asn_${kind}_${childId}_${day.toLowerCase()}`,
    parentId: "par_zara",
    childId,
    kind,
    day,
    handlerId,
  }));
}

export function buildSeed(): Database {
  const now = new Date().toISOString();
  const today = lagosToday();
  const chidinma: Handler = {
    id: "han_chidinma",
    parentId: "par_zara",
    name: "Chidinma Okafor",
    relationship: "Nanny",
    phone: "+2348052214478",
    status: "ACTIVE",
    pickup: true,
    dropoff: true,
    childIds: ["chi_amara", "chi_david"],
    days: "Mon, Wed, Fri",
    recurring: false,
    color: "#C45C6A",
    photoDataUrl: "seed-photo",
    createdAt: now,
  };
  const emeka: Handler = {
    id: "han_emeka",
    parentId: "par_zara",
    name: "Emeka Nwosu",
    relationship: "Driver",
    phone: "+2348067741120",
    status: "ACTIVE",
    pickup: true,
    dropoff: false,
    childIds: ["chi_amara"],
    days: "Any school day",
    recurring: false,
    color: "#0E7A6B",
    photoDataUrl: "seed-photo",
    createdAt: now,
  };
  const aisha: Handler = {
    id: "han_aisha",
    parentId: "par_zara",
    name: "Aisha Bello",
    relationship: "Grandmother",
    phone: "+2348021189043",
    status: "PAUSED",
    pickup: true,
    dropoff: false,
    childIds: ["chi_amara", "chi_david"],
    days: "Fridays only",
    recurring: false,
    color: "#5B8DEF",
    photoDataUrl: "seed-photo",
    createdAt: now,
  };

  const amaraWeek: Array<[Weekday, string]> = [
    ["Mon", chidinma.id],
    ["Tues", chidinma.id],
    ["Wed", emeka.id],
    ["Thurs", chidinma.id],
    ["Fri", aisha.id],
  ];
  const davidWeek: Array<[Weekday, string]> = [
    ["Mon", chidinma.id],
    ["Tues", chidinma.id],
    ["Wed", chidinma.id],
    ["Thurs", chidinma.id],
    ["Fri", aisha.id],
  ];
  const dropoffWeek: Array<[Weekday, string]> = [
    ["Mon", chidinma.id],
    ["Tues", chidinma.id],
    ["Wed", chidinma.id],
    ["Thurs", chidinma.id],
    ["Fri", chidinma.id],
  ];

  const todayStart = lagosInstant(today, "14:30");
  const todayAuth: Authorization = {
    id: "aut_today_amara",
    parentId: "par_zara",
    childId: "chi_amara",
    kind: "pickup",
    collector: collector(chidinma),
    date: today,
    windowStart: todayStart,
    windowEnd: lagosInstant(today, "15:30"),
    codeIssuesAt: lagosInstant(today, "14:15"),
    gateId: "gate_main",
    gateName: "Main Gate",
    gateDetail: "Primary 1–6",
    code: DEMO.todayPickupCode,
    status: "scheduled",
    reminderSent: false,
    createdAt: lagosInstant(today, "06:40"),
    log: [
      `Code sent by SMS to +234 ${toDisplay(chidinma.phone)}.`,
      "Main Gate can expect Chidinma Okafor during this window.",
    ],
  };

  const lastFriday = previousWeekday("Fri");
  const lastWednesday = previousWeekday("Wed");

  return {
    version: 1,
    schools: [
      {
        id: "sch_greenfield",
        name: "Greenfield Academy",
        campus: "Lekki Phase 1",
        gates: [{ id: "gate_main", name: "Main Gate", detail: "Primary 1–6" }],
        pickupWindow: { start: "14:30", end: "15:30" },
        dropoffWindow: { start: "07:30", end: "08:30" },
      },
    ],
    parents: [
      {
        id: "par_zara",
        schoolId: "sch_greenfield",
        name: "Zara Okafor",
        email: DEMO.email,
        phone: DEMO.phone,
        relationship: "Parent",
        passwordHash: hashPassword(DEMO.password),
        tokenVersion: 0,
        photoDataUrl: "seed-photo",
        notificationPrefs: DEFAULT_PREFS,
        createdAt: now,
      },
    ],
    children: [
      {
        id: "chi_amara",
        schoolId: "sch_greenfield",
        name: "Amara Okafor",
        klass: "Primary 4A",
        color: "#1C1917",
        parentIds: ["par_zara"],
      },
      {
        id: "chi_david",
        schoolId: "sch_greenfield",
        name: "David Okafor",
        klass: "Primary 1B",
        color: "#BE185D",
        parentIds: ["par_zara"],
      },
    ],
    handlers: [chidinma, emeka, aisha],
    assignments: [
      ...week("chi_amara", "pickup", amaraWeek),
      ...week("chi_amara", "dropoff", dropoffWeek),
      ...week("chi_david", "pickup", davidWeek),
      ...week("chi_david", "dropoff", dropoffWeek),
    ],
    authorizations: [
      todayAuth,
      usedPickup("aut_fri_amara", "100001", "chi_amara", chidinma, lastFriday),
      usedPickup("aut_wed_amara", "100002", "chi_amara", chidinma, lastWednesday),
      usedPickup("aut_wed_david", "100003", "chi_david", chidinma, lastWednesday),
      usedPickup("aut_old_amara", "100004", "chi_amara", emeka, previousWeekday("Mon")),
    ],
    invitations: [
      {
        token: DEMO.invitation,
        schoolId: "sch_greenfield",
        childIds: ["chi_amara", "chi_david"],
        status: "open",
        createdAt: now,
      },
    ],
    passwordResets: [],
    notifications: [],
  };
}
