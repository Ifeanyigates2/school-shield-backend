import dotenv from "dotenv";

dotenv.config();

const production = process.env.NODE_ENV === "production";

if (production && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "schoolshield-dev-secret-change-me",
  gateKey: process.env.GATE_KEY ?? "gate-demo-key",
  revealCodes: !production,
  production,
};
