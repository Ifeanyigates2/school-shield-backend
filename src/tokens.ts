import jwt from "jsonwebtoken";
import { config } from "./config";

export function signParent(parentId: string, tokenVersion: number) {
  return jwt.sign({ sub: parentId, v: tokenVersion }, config.jwtSecret, { expiresIn: "7d" });
}

export function readToken(token: string) {
  const payload = jwt.verify(token, config.jwtSecret) as { sub?: string; v?: number };
  if (!payload.sub || typeof payload.v !== "number") {
    throw new Error("Invalid token.");
  }
  return { parentId: payload.sub, tokenVersion: payload.v };
}
