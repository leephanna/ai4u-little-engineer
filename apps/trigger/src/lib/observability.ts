/**
 * Observability utilities for Trigger.dev tasks.
 * Integrates Sentry for error tracking and structured logging.
 */

import { logger } from "@trigger.dev/sdk/v3";

let sentryInitialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || sentryInitialized) return;

  try {
    // Dynamic import to avoid hard dependency
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "production",
      tracesSampleRate: 0.1,
      release: process.env.RELEASE_VERSION ?? "0.1.0",
    });
    sentryInitialized = true;
    logger.log("Sentry initialized");
  } catch {
    logger.warn("Sentry not available — error tracking disabled");
  }
}

export function captureException(
  err: Error | unknown,
  context?: Record<string, unknown>
): void {
  try {
    const Sentry = require("@sentry/node");
    Sentry.withScope((scope: any) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureException(err);
    });
  } catch {
    // Sentry not available
  }
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
): void {
  try {
    const Sentry = require("@sentry/node");
    Sentry.withScope((scope: any) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureMessage(message, level);
    });
  } catch {
    // Sentry not available
  }
}

/**
 * Structured event logger for CAD pipeline events.
 * Writes to Trigger.dev logger and optionally to Sentry.
 */
export function logPipelineEvent(
  event: string,
  data: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info"
): void {
  const payload = { event, ...data, timestamp: new Date().toISOString() };

  if (level === "error") {
    logger.error(event, payload);
    captureMessage(event, "error", data);
  } else if (level === "warn") {
    logger.warn(event, payload);
  } else {
    logger.log(event, payload);
  }
}
