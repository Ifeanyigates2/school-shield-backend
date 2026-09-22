import { Router } from "express";
import { z } from "zod";
import {
  assertHandlerCanCollect,
  cancelAuthorization,
  childForParent,
  createAuthorization,
  handlerForParent,
  nextHandlerColor,
  notify,
  ownedAuthorization,
  parentOrThrow,
  removeHandler,
  resendCode,
  syncHandlerOnAuthorizations,
} from "../domain";
import { HttpError } from "../errors";
import { newId } from "../ids";
import { asyncRoute, parentIdOf, requireParent } from "../middleware";
import { normalizePhone } from "../phone";
import { presentAuthorization, presentChild, presentHandler, presentParent, recentPickups } from "../present";
import { getDb, update } from "../store";
import { greeting, lagosToday, WEEKDAYS } from "../time";
import type { Database, HandoverKind } from "../types";

export const parentRouter = Router();

parentRouter.use(requireParent);

const weekdaySchema = z.enum(["Mon", "Tues", "Wed", "Thurs", "Fri"]);
const kindSchema = z.enum(["pickup", "dropoff"]);
const photoSchema = z.string().trim().min(1, "A photo is required.").max(500_000, "That photo is too large.");

const collectorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("handler"), handlerId: z.string().min(1) }),
  z.object({ type: z.literal("self") }),
  z.object({
    type: z.literal("one_time"),
    name: z.string().trim().min(2, "Enter the handler's full name."),
    phone: z.string().min(7, "Enter the handler's phone number."),
    relationship: z.string().trim().min(2, "Enter a relationship."),
    photoDataUrl: photoSchema,
  }),
]);

const prefsSchema = z
  .object({
    push: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
    childCheckedIn: z.boolean(),
    pickupReminder: z.boolean(),
    pickupCompleted: z.boolean(),
    authorizationChanged: z.boolean(),
  })
  .strict();

function latestToday(db: Database, parentId: string, childId: string, kind: HandoverKind) {
  const auth = db.authorizations.find(
    (item) => item.parentId === parentId && item.childId === childId && item.kind === kind && item.date === lagosToday(),
  );
  return auth ? presentAuthorization(auth, db) : null;
}

function scheduleFor(db: Database, parentId: string, childId: string, kind: HandoverKind) {
  const parent = parentOrThrow(db, parentId);
  const child = childForParent(db, parent, childId);
  return {
    child: presentChild(child, db),
    kind,
    days: WEEKDAYS.map((day) => {
      const assignment = db.assignments.find(
        (item) => item.parentId === parent.id && item.childId === child.id && item.kind === kind && item.day === day,
      );
      const handler = assignment
        ? db.handlers.find((item) => item.id === assignment.handlerId && item.parentId === parent.id)
        : undefined;
      return { day, handler: handler ? presentHandler(handler, db) : null };
    }),
  };
}

parentRouter.get(
  "/home",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    const parent = parentOrThrow(db, parentIdOf(res));
    const children = db.children.filter((child) => child.parentIds.includes(parent.id));
    const handlers = db.handlers.filter((handler) => handler.parentId === parent.id);
    res.json({
      greeting: greeting(),
      parent: presentParent(parent, db),
      unreadCount: db.notifications.filter((note) => note.parentId === parent.id && !note.read).length,
      children: children.map((child) => ({
        ...presentChild(child, db),
        todayPickup: latestToday(db, parent.id, child.id, "pickup"),
        todayDropoff: latestToday(db, parent.id, child.id, "dropoff"),
      })),
      handlers: {
        active: handlers.filter((handler) => handler.status === "ACTIVE").length,
        saved: handlers.length,
      },
    });
  }),
);

parentRouter.get(
  "/me",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    res.json(presentParent(parentOrThrow(db, parentIdOf(res)), db));
  }),
);

parentRouter.patch(
  "/me",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).optional(),
        email: z.string().trim().email().optional(),
        relationship: z.enum(["Parent", "Guardian"]).optional(),
        photoDataUrl: photoSchema.optional(),
      })
      .parse(req.body);

    const parent = update((db) => {
      const current = parentOrThrow(db, parentIdOf(res));
      if (body.email) {
        const email = body.email.toLowerCase();
        if (db.parents.some((item) => item.id !== current.id && item.email.toLowerCase() === email)) {
          throw new HttpError(409, "That email already has an account.");
        }
        current.email = email;
      }
      if (body.name) current.name = body.name;
      if (body.relationship) current.relationship = body.relationship;
      if (body.photoDataUrl) current.photoDataUrl = body.photoDataUrl;
      return current;
    });
    res.json(presentParent(parent, getDb()));
  }),
);

parentRouter.get(
  "/me/notifications",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    const prefs = parentOrThrow(db, parentIdOf(res)).notificationPrefs;
    res.json({ ...prefs, alertsAlwaysOn: ["security_alert", "emergency_authorization"] });
  }),
);

parentRouter.put(
  "/me/notifications",
  asyncRoute(async (req, res) => {
    const body = prefsSchema.parse(req.body);
    const prefs = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      parent.notificationPrefs = body;
      return parent.notificationPrefs;
    });
    res.json({ ...prefs, alertsAlwaysOn: ["security_alert", "emergency_authorization"] });
  }),
);

parentRouter.get(
  "/notifications",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    const notifications = db.notifications.filter((note) => note.parentId === parentIdOf(res));
    res.json({ notifications });
  }),
);

parentRouter.post(
  "/notifications/read-all",
  asyncRoute(async (_req, res) => {
    update((db) => {
      for (const note of db.notifications) {
        if (note.parentId === parentIdOf(res)) note.read = true;
      }
    });
    res.json({ ok: true });
  }),
);

parentRouter.post(
  "/notifications/:notificationId/read",
  asyncRoute(async (req, res) => {
    update((db) => {
      const note = db.notifications.find(
        (item) => item.id === req.params.notificationId && item.parentId === parentIdOf(res),
      );
      if (!note) throw new HttpError(404, "Notification not found.");
      note.read = true;
    });
    res.json({ ok: true });
  }),
);

parentRouter.get(
  "/children",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    const parent = parentOrThrow(db, parentIdOf(res));
    const children = db.children
      .filter((child) => child.parentIds.includes(parent.id))
      .map((child) => presentChild(child, db));
    res.json({ children });
  }),
);

parentRouter.get(
  "/children/:childId",
  asyncRoute(async (req, res) => {
    const db = getDb();
    const parent = parentOrThrow(db, parentIdOf(res));
    const child = childForParent(db, parent, req.params.childId);
    res.json({
      ...presentChild(child, db),
      todayPickup: latestToday(db, parent.id, child.id, "pickup"),
      todayDropoff: latestToday(db, parent.id, child.id, "dropoff"),
    });
  }),
);

parentRouter.get(
  "/children/:childId/schedule",
  asyncRoute(async (req, res) => {
    const kind = kindSchema.parse(req.query.kind ?? "pickup");
    res.json(scheduleFor(getDb(), parentIdOf(res), req.params.childId, kind));
  }),
);

parentRouter.put(
  "/children/:childId/schedule",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        kind: kindSchema,
        days: z.array(z.object({ day: weekdaySchema, handlerId: z.string().min(1) })).length(5),
      })
      .parse(req.body);

    const schedule = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const child = childForParent(db, parent, req.params.childId);
      const seen = new Set(body.days.map((day) => day.day));
      if (seen.size !== WEEKDAYS.length) throw new HttpError(400, "Include every school day, Monday to Friday.");

      for (const day of body.days) {
        const handler = handlerForParent(db, parent, day.handlerId);
        assertHandlerCanCollect(handler, child, body.kind);
      }

      db.assignments = db.assignments.filter(
        (item) => !(item.parentId === parent.id && item.childId === child.id && item.kind === body.kind),
      );
      for (const day of body.days) {
        db.assignments.push({
          id: newId("asn"),
          parentId: parent.id,
          childId: child.id,
          kind: body.kind,
          day: day.day,
          handlerId: day.handlerId,
        });
      }
      return scheduleFor(db, parent.id, child.id, body.kind);
    });
    res.json(schedule);
  }),
);

parentRouter.get(
  "/handlers",
  asyncRoute(async (_req, res) => {
    const db = getDb();
    const handlers = db.handlers
      .filter((handler) => handler.parentId === parentIdOf(res))
      .map((handler) => presentHandler(handler, db))
      .sort((a, b) => b.pickupCount - a.pickupCount || a.name.localeCompare(b.name));
    res.json({ handlers });
  }),
);

parentRouter.post(
  "/handlers",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2, "Enter the handler's full name."),
        phone: z.string().min(7),
        relationship: z.string().trim().min(2),
        pickup: z.boolean(),
        dropoff: z.boolean(),
        childIds: z.array(z.string()).min(1, "Choose at least one child."),
        days: z.string().trim().min(1).optional(),
        recurring: z.boolean().optional(),
        photoDataUrl: photoSchema,
      })
      .parse(req.body);
    if (!body.pickup && !body.dropoff) throw new HttpError(400, "Allow pickup, drop-off, or both.");
    const phone = normalizePhone(body.phone);

    const handler = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const owned = new Set(db.children.filter((child) => child.parentIds.includes(parent.id)).map((child) => child.id));
      if (body.childIds.some((id) => !owned.has(id))) throw new HttpError(400, "Choose children linked to you.");
      const created = {
        id: newId("han"),
        parentId: parent.id,
        name: body.name,
        relationship: body.relationship,
        phone,
        status: "ACTIVE" as const,
        pickup: body.pickup,
        dropoff: body.dropoff,
        childIds: [...new Set(body.childIds)],
        days: body.days ?? "Any school day",
        recurring: body.recurring ?? false,
        color: nextHandlerColor(db, parent.id),
        photoDataUrl: body.photoDataUrl,
        createdAt: new Date().toISOString(),
      };
      db.handlers.push(created);
      return created;
    });
    res.status(201).json(presentHandler(handler, getDb()));
  }),
);

parentRouter.get(
  "/handlers/:handlerId",
  asyncRoute(async (req, res) => {
    const db = getDb();
    const handler = handlerForParent(db, parentOrThrow(db, parentIdOf(res)), req.params.handlerId);
    res.json({ ...presentHandler(handler, db), recentPickups: recentPickups(handler, db) });
  }),
);

parentRouter.patch(
  "/handlers/:handlerId",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).optional(),
        phone: z.string().min(7).optional(),
        relationship: z.string().trim().min(2).optional(),
        pickup: z.boolean().optional(),
        dropoff: z.boolean().optional(),
        childIds: z.array(z.string()).min(1).optional(),
        days: z.string().trim().min(1).optional(),
        recurring: z.boolean().optional(),
        photoDataUrl: photoSchema.optional(),
      })
      .parse(req.body);

    const handler = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const current = handlerForParent(db, parent, req.params.handlerId);
      const phone = body.phone ? normalizePhone(body.phone) : current.phone;
      const phoneChanged = phone !== current.phone;
      if (body.childIds) {
        const owned = new Set(db.children.filter((child) => child.parentIds.includes(parent.id)).map((child) => child.id));
        if (body.childIds.some((id) => !owned.has(id))) throw new HttpError(400, "Choose children linked to you.");
        current.childIds = [...new Set(body.childIds)];
      }
      if (body.name) current.name = body.name;
      if (body.relationship) current.relationship = body.relationship;
      if (body.pickup !== undefined) current.pickup = body.pickup;
      if (body.dropoff !== undefined) current.dropoff = body.dropoff;
      if (!current.pickup && !current.dropoff) throw new HttpError(400, "Allow pickup, drop-off, or both.");
      if (body.days) current.days = body.days;
      if (body.recurring !== undefined) current.recurring = body.recurring;
      if (body.photoDataUrl) current.photoDataUrl = body.photoDataUrl;
      current.phone = phone;
      syncHandlerOnAuthorizations(db, current, phoneChanged);
      return current;
    });
    res.json(presentHandler(handler, getDb()));
  }),
);

parentRouter.post(
  "/handlers/:handlerId/pause",
  asyncRoute(async (req, res) => {
    const handler = update((db) => {
      const current = handlerForParent(db, parentOrThrow(db, parentIdOf(res)), req.params.handlerId);
      current.status = "PAUSED";
      return current;
    });
    res.json(presentHandler(handler, getDb()));
  }),
);

parentRouter.post(
  "/handlers/:handlerId/resume",
  asyncRoute(async (req, res) => {
    const handler = update((db) => {
      const current = handlerForParent(db, parentOrThrow(db, parentIdOf(res)), req.params.handlerId);
      current.status = "ACTIVE";
      return current;
    });
    res.json(presentHandler(handler, getDb()));
  }),
);

parentRouter.delete(
  "/handlers/:handlerId",
  asyncRoute(async (req, res) => {
    const result = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const handler = handlerForParent(db, parent, req.params.handlerId);
      return { removed: true, cancelledAuthorizations: removeHandler(db, parent, handler) };
    });
    res.json(result);
  }),
);

parentRouter.get(
  "/authorizations",
  asyncRoute(async (req, res) => {
    const query = z
      .object({
        childId: z.string().optional(),
        kind: kindSchema.optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query);
    const db = getDb();
    const authorizations = db.authorizations
      .filter((auth) => auth.parentId === parentIdOf(res))
      .filter((auth) => !query.childId || auth.childId === query.childId)
      .filter((auth) => !query.kind || auth.kind === query.kind)
      .filter((auth) => !query.date || auth.date === query.date)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((auth) => presentAuthorization(auth, db));
    res.json({ authorizations });
  }),
);

parentRouter.post(
  "/authorizations",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        childId: z.string().min(1),
        kind: kindSchema,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        gateId: z.string().optional(),
        collector: collectorSchema,
      })
      .parse(req.body);

    const collector =
      body.collector.type === "one_time"
        ? { ...body.collector, phone: normalizePhone(body.collector.phone) }
        : body.collector;

    const authorization = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      return presentAuthorization(createAuthorization(db, parent, { ...body, collector }), db);
    });
    res.status(201).json(authorization);
  }),
);

parentRouter.get(
  "/authorizations/:authorizationId",
  asyncRoute(async (req, res) => {
    const db = getDb();
    const auth = ownedAuthorization(db, parentIdOf(res), req.params.authorizationId);
    res.json(presentAuthorization(auth, db));
  }),
);

parentRouter.post(
  "/authorizations/:authorizationId/cancel",
  asyncRoute(async (req, res) => {
    const authorization = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const auth = ownedAuthorization(db, parent.id, req.params.authorizationId);
      cancelAuthorization(db, parent, auth);
      return presentAuthorization(auth, db);
    });
    res.json(authorization);
  }),
);

parentRouter.post(
  "/authorizations/:authorizationId/resend",
  asyncRoute(async (req, res) => {
    const authorization = update((db) => {
      const parent = parentOrThrow(db, parentIdOf(res));
      const auth = ownedAuthorization(db, parent.id, req.params.authorizationId);
      resendCode(db, auth);
      notify(db, parent, {
        kind: "authorization",
        title: "Code sent again",
        body: `A fresh code was sent to ${auth.collector.name}.`,
        authorizationId: auth.id,
      });
      return presentAuthorization(auth, db);
    });
    res.json(authorization);
  }),
);
