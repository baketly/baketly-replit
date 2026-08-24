import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyIngredientRecordBehavior } from "./ingredient-template";
import { applyRecipeRecordBehavior } from "./recipe-template";
import { applyAnalyticsBehavior } from "./analytics-template";
import { scanIngredientLabel } from "./ingredient-label-scan";

type WorkspaceState = Record<string, unknown>;
type PersistenceStatus = "loading" | "ready" | "offline";

declare global {
  interface Window {
    __baketlyReady: Promise<void>;
    __baketlyServerState: WorkspaceState;
    __baketlyPersist: (state: WorkspaceState) => void;
    __baketlyApplyRecipeRecords: (template: string) => string;
    __baketlyScanIngredientLabel: (
      file: File,
    ) => Promise<import("./ingredient-label-scan").IngredientLabelScan>;
  }
}

const durableFields = [
  "price",
  "chatMsgs",
  "recipeAmts",
  "recipeIngKeys",
  "recipePackKeys",
  "recipeYield",
  "recipeRecords",
  "ingredientRecords",
  "packagingRecords",
  "removedIngredientKeys",
  "removedPackagingKeys",
  "evQty",
  "evSold",
  "evStatus",
  "evSaved",
  "actualRev",
  "soldRev",
  "shopChecked",
  "cashQty",
  "cashPaid",
  "cashOrdersArr",
  "extraEvents",
  "todayArr",
  "saleRecords",
  "eventRecords",
  "eventCurrentId",
  "eventName",
  "eventDate",
  "eventBoothFee",
] as const;

function selectDurableState(state: WorkspaceState): WorkspaceState {
  return Object.fromEntries(
    durableFields
      .filter((field) => Object.hasOwn(state, field))
      .map((field) => [field, state[field]]),
  );
}

async function requestState(
  init?: RequestInit,
  timeoutMs = 1500,
): Promise<WorkspaceState> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/workspace-state", {
      ...init,
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Workspace request failed: ${response.status}`);
    const payload = (await response.json()) as { state?: WorkspaceState };
    return payload.state ?? {};
  } finally {
    window.clearTimeout(timeout);
  }
}

class WorkspaceStateClient {
  private status: PersistenceStatus = "loading";
  private queuedState: { revision: number; state: WorkspaceState } | null = null;
  private saving = false;
  private timer: number | null = null;
  private retryTimer: number | null = null;
  private revision = 0;
  private retryCount = 0;
  private listeners = new Set<(status: PersistenceStatus) => void>();

  subscribe(listener: (status: PersistenceStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: PersistenceStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  async hydrate(): Promise<void> {
    try {
      window.__baketlyServerState = await requestState();
      this.setStatus("ready");
    } catch {
      window.__baketlyServerState = {};
      this.setStatus("offline");
    }
  }

  queue(state: WorkspaceState) {
    this.queuedState = {
      revision: ++this.revision,
      state: selectDurableState(state),
    };
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.timer = window.setTimeout(() => this.flush(), 450);
  }

  retry = () => {
    this.retryCount = 0;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.flush();
  };

  private scheduleRetry() {
    if (!this.queuedState || this.retryCount >= 5) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.retryCount++);
    this.retryTimer = window.setTimeout(() => this.flush(), delay);
  }

  flush = () => {
    if (this.saving || !this.queuedState) return;

    const pendingSave = this.queuedState;
    this.queuedState = null;
    this.saving = true;
    requestState(
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: pendingSave.state }),
        keepalive: true,
      },
      5000,
    )
      .then(() => {
        this.retryCount = 0;
        this.setStatus("ready");
      })
      .catch(() => {
        if (
          !this.queuedState ||
          this.queuedState.revision < pendingSave.revision
        ) {
          this.queuedState = pendingSave;
        }
        this.setStatus("offline");
        this.scheduleRetry();
      })
      .finally(() => {
        this.saving = false;
        if (
          this.queuedState &&
          this.queuedState.revision > pendingSave.revision
        ) {
          this.flush();
        }
      });
  };
}

const workspaceClient = new WorkspaceStateClient();
window.__baketlyServerState = {};
const knownPackagingPlaceholders = [
  "{{ pp.name }}",
  "{{ pp.meta }}",
  "{{ pp.check }}",
  "{{ packagingDeleteName }}",
];

function removeKnownPackagingPlaceholders(template: string): string {
  return knownPackagingPlaceholders.reduce(
    (result, placeholder) => result.replaceAll(placeholder, ""),
    template,
  );
}

window.__baketlyApplyRecipeRecords = (template) => {
  let recipeTemplate = template;

  try {
    recipeTemplate = applyRecipeRecordBehavior(template);
  } catch (error) {
    // Packaging is optional. Keep the rest of the generated interface usable
    // if an imported template changes in a way that invalidates its section.
    console.error("[Baketly] Packaging transform fallback:", error);
    recipeTemplate = removeKnownPackagingPlaceholders(template);
  }

  return applyAnalyticsBehavior(applyIngredientRecordBehavior(recipeTemplate));
};
window.__baketlyScanIngredientLabel = scanIngredientLabel;
window.__baketlyReady = workspaceClient.hydrate();
window.__baketlyPersist = (state) => workspaceClient.queue(state);
window.addEventListener("pagehide", workspaceClient.flush);
window.addEventListener("online", workspaceClient.retry);

function PersistenceBridge() {
  const [status, setStatus] = useState<PersistenceStatus>("loading");

  useEffect(() => workspaceClient.subscribe(setStatus), []);

  return (
    <span
      aria-hidden="true"
      data-baketly-persistence={status}
      style={{ display: "none" }}
    />
  );
}

const root = document.getElementById("baketly-react-client");
if (root) createRoot(root).render(<PersistenceBridge />);