import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { HttpError } from "../errors";
import { newId, newNumericCode } from "../ids";
import { asyncRoute } from "../middleware";
import { checkPassword, hashPassword, passwordSchema } from "../passwords";
import { isEmail, normalizePhone } from "../phone";
import { presentParent } from "../present";
import { getDb, save, update } from "../store";
import { signParent } from "../tokens";
import type { Parent } from "../types";

export const authRouter = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 24 * 1000;

function findParent(identifier: string): Parent | undefined {
  const trimmed = identifier.trim();
  const db = getDb();
  if (isEmail(trimmed)) {
    const email = trimmed.toLowerCase();
    return db.parents.find((parent) => parent.email.toLowerCase() === email);
  }
  try {
    const phone = normalizePhone(trimmed);
    return db.parents.find((parent) => parent.phone === phone);
  } catch {
    return undefined;
  }
}

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        identifier: z.string().trim().min(1, "Enter your phone number or email."),
        password: z.string().min(1, "Enter your password."),
      })
      .parse(req.body);

    const parent = findParent(body.identifier);
    if (!parent || !checkPassword(body.password, parent.passwordHash)) {
      throw new HttpError(401, "Phone number, email, or password is incorrect.");
    }

    res.json({
      token: signParent(parent.id, parent.tokenVersion),
      parent: presentParent(parent, getDb()),
    });
  }),
);

authRouter.post(
  "/forgot-password",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        identifier: z.string().trim().min(1, "Enter the phone number or email on your account."),
      })
      .parse(req.body);

    const parent = findParent(body.identifier);
    if (!parent) {
      res.json({ message: "If an account exists, a code was sent." });
      return;
    }

    const code = newNumericCode(4);
    update((db) => {
      const current = db.parents.find((item) => item.id === parent.id);
      if (!current) return;
      const existing = db.passwordResets.find((item) => item.parentId === current.id);
      if (existing && Date.now() - new Date(existing.sentAt).getTime() < RESEND_WAIT_MS) {
        throw new HttpError(429, "Wait before requesting another code.");
      }
      db.passwordResets = db.passwordResets.filter((item) => item.parentId !== current.id);
      db.passwordResets.push({
        id: newId("rst"),
        parentId: current.id,
        code,
        expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        sentAt: new Date().toISOString(),
        attempts: 0,
      });
    });

    res.json({
      message: "If an account exists, a code was sent.",
      ...(config.revealCodes ? { demoCode: code } : {}),
    });
  }),
);

authRouter.post(
  "/reset-password",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        identifier: z.string().trim().min(1, "Enter the phone number or email on your account."),
        code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code."),
        password: passwordSchema,
      })
      .parse(req.body);

    const parent = findParent(body.identifier);
    const reset = parent ? getDb().passwordResets.find((item) => item.parentId === parent.id) : undefined;
    if (!parent || !reset) throw new HttpError(400, "That code does not match.");
    if (new Date(reset.expiresAt).getTime() < Date.now()) {
      throw new HttpError(400, "That code has expired. Request a new one.");
    }
    if (reset.attempts >= 5) throw new HttpError(429, "Request a new code.");
    if (reset.code !== body.code) {
      reset.attempts += 1;
      save();
      throw new HttpError(400, "That code does not match.");
    }

    const passwordHash = hashPassword(body.password);
    update((db) => {
      const current = db.parents.find((item) => item.id === parent.id);
      if (!current) throw new HttpError(400, "That code does not match.");
      current.passwordHash = passwordHash;
      current.tokenVersion += 1;
      db.passwordResets = db.passwordResets.filter((item) => item.parentId !== current.id);
    });

    res.json({ message: "Password updated. Sign in with it." });
  }),
);
