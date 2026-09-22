import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { parentOrThrow } from "../domain";
import { HttpError } from "../errors";
import { newId, newNumericCode } from "../ids";
import { asyncRoute } from "../middleware";
import { hashPassword, passwordSchema } from "../passwords";
import { normalizePhone } from "../phone";
import { presentChild, presentParent } from "../present";
import { getDb, save, update } from "../store";
import { signParent } from "../tokens";
import type { Database, Invitation } from "../types";

export const invitationRouter = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 24 * 1000;
const DEFAULT_PREFS = {
  push: true,
  sms: true,
  whatsapp: false,
  childCheckedIn: true,
  pickupReminder: true,
  pickupCompleted: true,
  authorizationChanged: false,
};

function inviteFrom(db: Database, token: string) {
  const invitation = db.invitations.find((item) => item.token === token);
  if (!invitation) throw new HttpError(404, "Invitation not found.");
  if (invitation.status === "completed") throw new HttpError(410, "This invitation has already been used.");
  return invitation;
}

function presentInvitation(invitation: Invitation, db: Database) {
  const school = db.schools.find((item) => item.id === invitation.schoolId);
  const confirmed = new Set(invitation.confirmedChildIds ?? []);
  return {
    token: invitation.token,
    status: invitation.status,
    school: school ? { id: school.id, name: school.name, campus: school.campus } : null,
    children: invitation.childIds
      .map((id) => db.children.find((child) => child.id === id))
      .filter((child) => child !== undefined)
      .map((child) => ({ ...presentChild(child, db), confirmed: confirmed.has(child.id) })),
    progress: {
      childrenConfirmed: (invitation.confirmedChildIds?.length ?? 0) > 0,
      detailsSaved: Boolean(invitation.name && invitation.phone && invitation.email),
      photoSaved: Boolean(invitation.photoDataUrl),
      phoneVerified: Boolean(invitation.phoneVerified),
    },
  };
}

invitationRouter.get(
  "/:token",
  asyncRoute(async (req, res) => {
    const db = getDb();
    res.json(presentInvitation(inviteFrom(db, req.params.token), db));
  }),
);

invitationRouter.post(
  "/:token/children",
  asyncRoute(async (req, res) => {
    const body = z
      .object({ childIds: z.array(z.string()).min(1, "Choose at least one child.") })
      .parse(req.body);

    const invitation = update((db) => {
      const current = inviteFrom(db, req.params.token);
      const allowed = new Set(current.childIds);
      if (body.childIds.some((id) => !allowed.has(id))) {
        throw new HttpError(400, "Those children are not on this invitation.");
      }
      current.confirmedChildIds = [...new Set(body.childIds)];
      return current;
    });

    res.json(presentInvitation(invitation, getDb()));
  }),
);

invitationRouter.post(
  "/:token/details",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2, "Enter your full name."),
        relationship: z.enum(["Parent", "Guardian"]),
        phone: z.string().min(7, "Enter your phone number."),
        email: z.string().trim().email("Enter a valid email."),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);
    const email = body.email.toLowerCase();

    const invitation = update((db) => {
      const current = inviteFrom(db, req.params.token);
      const phoneTaken = db.parents.some((parent) => parent.phone === phone);
      const emailTaken = db.parents.some((parent) => parent.email.toLowerCase() === email);
      if (phoneTaken) throw new HttpError(409, "That phone number already has an account.");
      if (emailTaken) throw new HttpError(409, "That email already has an account.");
      if (current.phone && current.phone !== phone) current.phoneVerified = false;
      current.name = body.name.trim();
      current.relationship = body.relationship;
      current.phone = phone;
      current.email = email;
      return current;
    });

    res.json(presentInvitation(invitation, getDb()));
  }),
);

invitationRouter.post(
  "/:token/photo",
  asyncRoute(async (req, res) => {
    const body = z
      .object({ photoDataUrl: z.string().trim().min(1, "A photo is required.").max(500_000, "That photo is too large.") })
      .parse(req.body);

    const invitation = update((db) => {
      const current = inviteFrom(db, req.params.token);
      current.photoDataUrl = body.photoDataUrl;
      return current;
    });

    res.json(presentInvitation(invitation, getDb()));
  }),
);

invitationRouter.post(
  "/:token/otp",
  asyncRoute(async (req, res) => {
    const code = newNumericCode(4);
    update((db) => {
      const current = inviteFrom(db, req.params.token);
      if (!current.phone) throw new HttpError(400, "Save your phone number before requesting a code.");
      if (current.otpSentAt && Date.now() - new Date(current.otpSentAt).getTime() < RESEND_WAIT_MS) {
        throw new HttpError(429, "Wait before requesting another code.");
      }
      current.otp = code;
      current.otpSentAt = new Date().toISOString();
      current.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
      current.otpAttempts = 0;
      current.phoneVerified = false;
    });

    res.json({
      message: "Verification code sent.",
      ...(config.revealCodes ? { demoCode: code } : {}),
    });
  }),
);

invitationRouter.post(
  "/:token/otp/verify",
  asyncRoute(async (req, res) => {
    const body = z.object({ code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code.") }).parse(req.body);
    const db = getDb();
    const invitation = inviteFrom(db, req.params.token);
    if (!invitation.otp || !invitation.otpExpiresAt) throw new HttpError(400, "Request a code first.");
    if (new Date(invitation.otpExpiresAt).getTime() < Date.now()) {
      throw new HttpError(400, "That code has expired. Request a new one.");
    }
    if ((invitation.otpAttempts ?? 0) >= 5) throw new HttpError(429, "Request a new code.");
    if (invitation.otp !== body.code) {
      invitation.otpAttempts = (invitation.otpAttempts ?? 0) + 1;
      save();
      throw new HttpError(400, "Code entered is incorrect. Check input and try again.");
    }

    update((next) => {
      const current = inviteFrom(next, req.params.token);
      current.phoneVerified = true;
      current.otp = undefined;
      current.otpExpiresAt = undefined;
    });

    res.json(presentInvitation(inviteFrom(getDb(), req.params.token), getDb()));
  }),
);

invitationRouter.post(
  "/:token/account",
  asyncRoute(async (req, res) => {
    const body = z.object({ password: passwordSchema }).parse(req.body);
    const passwordHash = hashPassword(body.password);

    const result = update((db) => {
      const invitation = inviteFrom(db, req.params.token);
      if (!invitation.confirmedChildIds?.length) throw new HttpError(400, "Confirm your children first.");
      if (!invitation.name || !invitation.phone || !invitation.email || !invitation.relationship) {
        throw new HttpError(400, "Save your details first.");
      }
      if (!invitation.photoDataUrl) throw new HttpError(400, "Add your photo first.");
      if (!invitation.phoneVerified) throw new HttpError(400, "Verify your phone first.");
      if (db.parents.some((parent) => parent.phone === invitation.phone || parent.email === invitation.email)) {
        throw new HttpError(409, "An account already exists for those details.");
      }

      const parent = {
        id: newId("par"),
        schoolId: invitation.schoolId,
        name: invitation.name,
        email: invitation.email,
        phone: invitation.phone,
        relationship: invitation.relationship,
        passwordHash,
        tokenVersion: 0,
        photoDataUrl: invitation.photoDataUrl,
        notificationPrefs: { ...DEFAULT_PREFS },
        createdAt: new Date().toISOString(),
      };
      db.parents.push(parent);
      for (const child of db.children) {
        if (invitation.confirmedChildIds.includes(child.id) && !child.parentIds.includes(parent.id)) {
          child.parentIds.push(parent.id);
        }
      }
      invitation.status = "completed";
      invitation.completedParentId = parent.id;
      return parent;
    });

    const db = getDb();
    const parent = parentOrThrow(db, result.id);
    res.status(201).json({
      token: signParent(parent.id, parent.tokenVersion),
      parent: presentParent(parent, db),
    });
  }),
);
