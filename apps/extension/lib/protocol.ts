/**
 * Protocol between the new-tab page(s) and the service worker.
 *
 * The worker owns exactly one build at a time and is the single source of truth
 * for its state (see build-manager.ts). Tabs are thin, disposable views: they
 * connect on AGENT_PORT, receive a snapshot, then stream deltas.
 */
import type { RunPhase } from "@homepage/agent-core";

export const AGENT_PORT = "homepage-agent";

/** Live build state. The worker holds the canonical copy; tabs reduce into a mirror. */
export interface BuildState {
  running: boolean;
  phase: RunPhase | null;
  /** High-water index into BUILD_STEPS — only advances, so interleaved phases don't rewind the stepper. */
  stepIndex: number;
  detail: string;
  narration: string;
  logs: string[];
  error: string | null;
}

export const INITIAL_BUILD_STATE: BuildState = {
  running: false,
  phase: null,
  stepIndex: 0,
  detail: "",
  narration: "",
  logs: [],
  error: null,
};

/** How many recent log lines are kept (and shown). */
export const LOG_RETENTION = 40;

/**
 * Apply one worker → page message to a build state. The worker keeps its own
 * state with it, and each tab keeps its mirror with it, so both stay the same.
 */
export function reduce(state: BuildState, msg: BuildMsg): BuildState {
  switch (msg.kind) {
    case "snapshot":
      return msg.state;
    case "phase":
      return {
        ...state,
        running: true,
        phase: msg.phase,
        stepIndex: Math.max(state.stepIndex, msg.stepIndex),
        detail: msg.detail,
      };
    case "text":
      return { ...state, narration: state.narration + msg.chunk };
    case "log":
      return { ...state, logs: [...state.logs.slice(-LOG_RETENTION), msg.line] };
    case "done":
      return { ...state, running: false, phase: "done" };
    case "error":
      return { ...state, running: false, phase: "error", error: msg.message };
  }
}

// page → worker
export type PageMsg =
  | { kind: "subscribe" } //                    → replies with a snapshot
  | { kind: "startBuild"; resume?: boolean } // no-op if one is already running
  | { kind: "cancel" };

/** One-off requests from a page to the worker (runtime.sendMessage), for the Safari visit log. */
export type VisitLogRequest =
  | { kind: "importVisits"; visits: import("./history-import").ImportedVisit[] }
  | { kind: "exportVisits" };

/**
 * Sent by an open tab every PING_INTERVAL_MS while a build runs. Safari stops
 * an extension's worker that looks idle, and a long wait for the on-device
 * model looks idle; each incoming message counts as activity.
 */
export type PingRequest = { kind: "ping" };
export const PING_INTERVAL_MS = 10_000;

// worker → page (broadcast to every connected tab)
export type BuildMsg =
  | { kind: "snapshot"; state: BuildState }
  | { kind: "phase"; phase: RunPhase; stepIndex: number; detail: string }
  | { kind: "text"; chunk: string } // narration delta
  | { kind: "log"; line: string }
  | { kind: "done"; code: string } // edition saved; carries its HTML
  | { kind: "error"; message: string };

/**
 * The five stages a person cares about. The agent emits finer-grained phases
 * that interleave (thinking ↔ analyzing fire repeatedly); each maps to a step
 * here. `thinking` and `error` deliberately map to none, so they never move the
 * stepper.
 */
export const BUILD_STEPS: { label: string; phases: RunPhase[] }[] = [
  { label: "Preparing agent", phases: ["setup", "session-create"] },
  { label: "Reading your history", phases: ["history"] },
  { label: "Opening pages in your browser", phases: ["scraping"] },
  { label: "Analyzing pages", phases: ["analyzing"] },
  { label: "Writing your edition", phases: ["writing", "cleanup", "done"] },
];

/** Which step a phase belongs to, or `undefined` if it shouldn't move the stepper. */
export function stepForPhase(phase: RunPhase): number | undefined {
  const i = BUILD_STEPS.findIndex((step) => step.phases.includes(phase));
  return i === -1 ? undefined : i;
}
