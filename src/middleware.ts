import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { HttpError } from "./errors";
import { getDb } from "./store";
import { readToken } from "./tokens";

export function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function parentIdOf(res: Response) {
  const parentId = res.locals.parentId;
  if (typeof parentId !== "string" || !parentId) throw new HttpError(401, "Sign in required.");
  return parentId;
}

export function requireParent(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    next(new HttpError(401, "Sign in required."));
    return;
  }

  try {
    const session = readToken(token);
    const parent = getDb().parents.find((item) => item.id === session.parentId);
    if (!parent || parent.tokenVersion !== session.tokenVersion) {
      next(new HttpError(401, "Sign in required."));
      return;
    }
    res.locals.parentId = parent.id;
    next();
  } catch {
    next(new HttpError(401, "Sign in required."));
  }
}

export function requireGate(req: Request, _res: Response, next: NextFunction) {
  const key = req.header("x-gate-key") ?? "";
  if (key !== config.gateKey) {
    next(new HttpError(401, "Gate key is not valid."));
    return;
  }
  next();
}
