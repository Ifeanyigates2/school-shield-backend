import bcrypt from "bcryptjs";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password needs an uppercase letter.")
  .regex(/\d/, "Password needs a number.")
  .regex(/[^A-Za-z0-9]/, "Password needs a special character.");

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function checkPassword(password: string, passwordHash: string) {
  return bcrypt.compareSync(password, passwordHash);
}
