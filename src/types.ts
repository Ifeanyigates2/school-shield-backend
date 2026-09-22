export type Weekday = "Mon" | "Tues" | "Wed" | "Thurs" | "Fri";

export type HandoverKind = "pickup" | "dropoff";

export type AuthorizationStatus = "scheduled" | "cancelled" | "used";

export type DisplayState =
  | "NOT YET ACTIVE"
  | "ACTIVE"
  | "EXPIRING SOON"
  | "EXPIRED"
  | "CANCELLED"
  | "ALREADY USED";

export type NotificationKind =
  | "security"
  | "emergency"
  | "checkin"
  | "reminder"
  | "completed"
  | "authorization";

export interface NotificationPrefs {
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
  childCheckedIn: boolean;
  pickupReminder: boolean;
  pickupCompleted: boolean;
  authorizationChanged: boolean;
}

export interface Gate {
  id: string;
  name: string;
  detail: string;
}

export interface School {
  id: string;
  name: string;
  campus: string;
  gates: Gate[];
  pickupWindow: { start: string; end: string };
  dropoffWindow: { start: string; end: string };
}

export interface Parent {
  id: string;
  schoolId: string;
  name: string;
  email: string;
  phone: string;
  relationship: "Parent" | "Guardian";
  passwordHash: string;
  tokenVersion: number;
  photoDataUrl?: string;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
}

export interface Child {
  id: string;
  schoolId: string;
  name: string;
  klass: string;
  color: string;
  parentIds: string[];
}

export interface Handler {
  id: string;
  parentId: string;
  name: string;
  relationship: string;
  phone: string;
  status: "ACTIVE" | "PAUSED";
  pickup: boolean;
  dropoff: boolean;
  childIds: string[];
  days: string;
  recurring: boolean;
  color: string;
  photoDataUrl?: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  parentId: string;
  childId: string;
  kind: HandoverKind;
  day: Weekday;
  handlerId: string;
}

export interface CollectorSnapshot {
  type: "handler" | "self" | "one_time";
  handlerId?: string;
  name: string;
  phone: string;
  relationship: string;
  hasPhoto: boolean;
}

export interface Authorization {
  id: string;
  parentId: string;
  childId: string;
  kind: HandoverKind;
  collector: CollectorSnapshot;
  date: string;
  windowStart: string;
  windowEnd: string;
  codeIssuesAt: string;
  gateId: string;
  gateName: string;
  gateDetail: string;
  code: string;
  status: AuthorizationStatus;
  cancelledAt?: string;
  usedAt?: string;
  reminderSent: boolean;
  createdAt: string;
  log: string[];
}

export interface Invitation {
  token: string;
  schoolId: string;
  childIds: string[];
  status: "open" | "completed";
  confirmedChildIds?: string[];
  name?: string;
  relationship?: "Parent" | "Guardian";
  phone?: string;
  email?: string;
  photoDataUrl?: string;
  otp?: string;
  otpExpiresAt?: string;
  otpSentAt?: string;
  otpAttempts?: number;
  phoneVerified?: boolean;
  completedParentId?: string;
  createdAt: string;
}

export interface PasswordReset {
  id: string;
  parentId: string;
  code: string;
  expiresAt: string;
  sentAt: string;
  attempts: number;
}

export interface AppNotification {
  id: string;
  parentId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  channels: string[];
  read: boolean;
  createdAt: string;
  authorizationId?: string;
}

export interface Database {
  version: 1;
  schools: School[];
  parents: Parent[];
  children: Child[];
  handlers: Handler[];
  assignments: Assignment[];
  authorizations: Authorization[];
  invitations: Invitation[];
  passwordResets: PasswordReset[];
  notifications: AppNotification[];
}
