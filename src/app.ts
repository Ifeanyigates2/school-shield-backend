import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { HttpError } from "./errors";
import { authRouter } from "./routes/auth";
import { gateRouter } from "./routes/gate";
import { invitationRouter } from "./routes/invitations";
import { parentRouter } from "./routes/parent";

export const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "schoolshield-mobile-api" });
});

app.get("/api", (_req, res) => {
  res.json({
    name: "SchoolShield Mobile API",
    health: "/health",
    auth: ["/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password"],
    invitation: "/api/invitations/:token",
    parent: ["/api/home", "/api/children", "/api/handlers", "/api/authorizations", "/api/notifications"],
    gate: ["/api/gate/today", "/api/gate/verify"],
  });
});

app.use("/api/auth", authRouter);
app.use("/api/invitations", invitationRouter);
app.use("/api/gate", gateRouter);
app.use("/api", parentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, ...error.details });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong." });
});
