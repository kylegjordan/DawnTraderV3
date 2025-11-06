import { Request, Response, NextFunction } from "express";
import { env } from "../config";

export function singleTenantGuard(req: Request, _res: Response, next: NextFunction) {
  if (!env.SINGLE_TENANT) {
    return next();
  }

  // Allow userId in auth routes (login, register, etc.)
  if (req.path.startsWith("/api/auth")) {
    return next();
  }

  // Check request body and query for userId violations
  const raw = JSON.stringify({ 
    body: req.body, 
    query: req.query,
    params: req.params 
  });

  // Case-insensitive check for userId or user_id
  if (/"userId"\s*:/i.test(raw) || /"user_id"\s*:/i.test(raw)) {
    const violation = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      body: req.body,
      query: req.query,
      params: req.params,
    };

    console.error("[SingleTenantViolation] userId detected in request:", violation);

    // Log to diagnostics file
    try {
      const fs = require("fs");
      const logPath = "diagnostics/runtime_guard_violations.log";
      fs.appendFileSync(
        logPath,
        JSON.stringify(violation) + "\n",
        "utf8"
      );
    } catch (err) {
      console.error("[SingleTenantGuard] Failed to log violation:", err);
    }

    return next(
      new Error(
        `[SingleTenantViolation] userId detected in ${req.method} ${req.path}. ` +
        `Single-tenant mode does not support user-specific operations outside authentication.`
      )
    );
  }

  next();
}
