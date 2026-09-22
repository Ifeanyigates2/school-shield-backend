import { Router } from "express";
import { z } from "zod";
import { notify } from "../domain";
import { HttpError } from "../errors";
import { asyncRoute, requireGate } from "../middleware";
import { displayState, gateAllows, stateMessage } from "../status";
import { getDb, update } from "../store";
import { formatClock, formatLongDate, lagosToday } from "../time";

export const gateRouter = Router();

gateRouter.use(requireGate);

function gateMessage(state: ReturnType<typeof displayState>) {
  if (state === "NOT YET ACTIVE") return "This code is not active yet.";
  if (state === "EXPIRED") return "This code has expired.";
  if (state === "CANCELLED") return "This authorization was cancelled.";
  return "This code has already been used.";
}

gateRouter.get(
  "/today",
  asyncRoute(async (_req, res) => {
    const today = lagosToday();
    const db = getDb();
    const handovers = db.authorizations
      .filter((auth) => auth.date === today)
      .map((auth) => {
        const child = db.children.find((item) => item.id === auth.childId);
        const state = displayState(auth);
        return {
          id: auth.id,
          kind: auth.kind,
          state,
          stateMessage: stateMessage(auth, state),
          child: child ? { name: child.name, klass: child.klass } : null,
          collector: {
            name: auth.collector.name,
            relationship: auth.collector.relationship,
            hasPhoto: auth.collector.hasPhoto,
          },
          windowLabel: `${formatClock(auth.windowStart)} – ${formatClock(auth.windowEnd)}`,
          gate: auth.gateName,
          dateLabel: formatLongDate(auth.date),
        };
      });
    res.json({ date: today, handovers });
  }),
);

gateRouter.post(
  "/verify",
  asyncRoute(async (req, res) => {
    const body = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") }).parse(req.body);

    const result = update((db) => {
      const auth = db.authorizations.find((item) => item.code === body.code);
      if (!auth) throw new HttpError(404, "That code does not match an authorization.");
      const state = displayState(auth);
      if (!gateAllows(state)) throw new HttpError(409, gateMessage(state), { state });

      auth.status = "used";
      auth.usedAt = new Date().toISOString();
      auth.log.push(`Handover completed at the ${auth.gateName}.`);

      const parent = db.parents.find((item) => item.id === auth.parentId);
      const child = db.children.find((item) => item.id === auth.childId);
      if (parent && child) {
        const pickedUp = auth.kind === "pickup";
        notify(db, parent, {
          kind: pickedUp ? "completed" : "checkin",
          title: pickedUp ? "Pickup completed" : "Child checked in",
          body: pickedUp
            ? `${auth.collector.name} collected ${child.name} at ${auth.gateName}.`
            : `${auth.collector.name} dropped off ${child.name} at ${auth.gateName}.`,
          authorizationId: auth.id,
        });
      }

      return {
        ok: true,
        kind: auth.kind,
        usedAt: auth.usedAt,
        child: child ? { name: child.name, klass: child.klass } : null,
        collector: {
          name: auth.collector.name,
          relationship: auth.collector.relationship,
          hasPhoto: auth.collector.hasPhoto,
        },
        gate: auth.gateName,
        windowLabel: `${formatClock(auth.windowStart)} – ${formatClock(auth.windowEnd)}`,
      };
    });

    res.json(result);
  }),
);
