// What Ask Baketly did, and how long it took.
//
// One id per question, carried through every tool call, so a slow or wrong
// answer can be followed end to end. The baker's numbers are not written to
// the log: names of tools and shapes of results, not revenue and recipes.

import type { Logger } from "pino";

export type AskEvent =
  | "ASK_BAKETLY_REQUEST"
  | "ASK_BAKETLY_TOOL_REQUESTED"
  | "ASK_BAKETLY_TOOL_SUCCESS"
  | "ASK_BAKETLY_TOOL_FAILED"
  | "ASK_BAKETLY_TOOL_REFUSED"
  | "ASK_BAKETLY_RESPONSE"
  | "ASK_BAKETLY_GEMINI_ERROR"
  | "ASK_BAKETLY_EMPTY_WORKSPACE";

export interface AskLogFields {
  tool?: string;
  ms?: number;
  ok?: boolean;
  reason?: string;
  [key: string]: unknown;
}

export interface AskLogger {
  readonly requestId: string;
  event(name: AskEvent, fields?: AskLogFields): void;
}

export function askLogger(base: Logger, userId: string, requestId?: string): AskLogger {
  const id = requestId || "ask_" + Math.random().toString(36).slice(2, 10);
  return {
    requestId: id,
    event(name, fields) {
      const payload = { requestId: id, userId, event: name, ...(fields || {}) };
      if (name.endsWith("_FAILED") || name.endsWith("_ERROR") || name.endsWith("_REFUSED")) {
        base.warn(payload, name);
      } else {
        base.info(payload, name);
      }
    },
  };
}
