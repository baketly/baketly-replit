import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyIngredientRecordBehavior } from "./ingredient-template";
import { applyRecipeRecordBehavior } from "./recipe-template";
import { applyAnalyticsBehavior } from "./analytics-template";
import { scanIngredientLabel } from "./ingredient-label-scan";
import { applyChatBehavior } from "./chat-template";
import { applyWatchBehavior } from "./watch-template";
import { applyHomeBehavior } from "./home-template";
import { applyOnboardingBehavior } from "./onboarding-template";
import { applyCurrencyBehavior } from "./currency";
import { applyEventBehavior } from "./event-template";
import { applySaleBehavior } from "./sale-template";
import { applySingleSalesBehavior } from "./single-sales-template";
import { marketCheckIsDue, runMarketCheck, suggestPlaces } from "./market-check";
import { askBaketly, buildAskContext } from "./ask-baketly";
import { AuthGate, fetchCurrentUser, signOut, type SignedInUser } from "./auth-ui";
import { buildSampleWorkspace, emptyWorkspace } from "./sample-data";

type WorkspaceState = Record<string, unknown>;
type PersistenceStatus = "loading" | "ready" | "offline";

declare global {
  interface Window {
    __baketlyReady: Promise<void>;
    __baketlyServerState: WorkspaceState;
    __baketlyPersist: (state: WorkspaceState) => void;
    __baketlyApplyRecipeRecords: (template: string) => string;
    __baketlyMarketCheck: (
      location: string,
      products: Array<{ name: string; price: number }>,
    ) => Promise<import("./market-check").MarketCheck>;
    __baketlyMarketCheckDue: (check: unknown) => boolean;
    __baketlySuggestPlaces: (query: string) => Promise<string[]>;
    __baketlySignOut: () => Promise<void>;
    __baketlySignedInEmail: string;
    __baketlySampleWorkspace: (
      ingredientMeta: Record<string, { name?: string; unit?: string; per?: number } | undefined>,
      packagingMeta: Record<string, { name?: string; unit?: string; per?: number } | undefined>,
    ) => Record<string, unknown>;
    __baketlyEmptyWorkspace: () => Record<string, unknown>;
    __baketlyAsk: (
      question: string,
      context: Record<string, unknown>,
      history: Array<{ who: string; text: string }>,
    ) => Promise<import("./ask-baketly").AskAnswer>;
    __baketlyAskContext: (
      state: Record<string, unknown>,
      ingredientMeta: Record<string, { name?: string; unit?: string; per?: number } | undefined>,
      packagingMeta: Record<string, { name?: string; unit?: string; per?: number } | undefined>,
      eventMeta?: Array<{ k?: string; name?: string; price?: number }>,
    ) => Record<string, unknown>;
    __baketlyScanIngredientLabel: (
      file: File,
    ) => Promise<import("./ingredient-label-scan").IngredientLabelScan>;
  }
}

const durableFields = [
  "price",
  "chatMsgs",
  "sampleDataLoaded",
  "bakeryName",
  "bakeryLocation",
  "bakerySpecialties",
  "currency",
  "hourlyRate",
  "targetMargin",
  "onboardingComplete",
  "priceHistory",
  "marketCheck",
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
  "evPicked",
  "shopNeed",
  "saleEventId",
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

  return applyCurrencyBehavior(
    applyOnboardingBehavior(
      applyHomeBehavior(
        applyWatchBehavior(
          applyChatBehavior(
            applySingleSalesBehavior(
              applySaleBehavior(
              applyEventBehavior(
                  applyAnalyticsBehavior(applyIngredientRecordBehavior(recipeTemplate)),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
};
window.__baketlyScanIngredientLabel = scanIngredientLabel;
window.__baketlyMarketCheck = runMarketCheck;
window.__baketlyMarketCheckDue = (check) =>
  marketCheckIsDue(check as { checkedAt?: unknown } | null);
window.__baketlySuggestPlaces = suggestPlaces;
window.__baketlyAsk = askBaketly;
window.__baketlyAskContext = buildAskContext;
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

// The generated page replaces the body, so it cannot be relied on to leave a
// mount point behind. The gate gets a container of its own.
function AuthBoundary() {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetchCurrentUser().then((found) => {
      // the generated Settings screen reads this to show who is signed in
      window.__baketlySignedInEmail = found ? found.email : "";
      setUser(found);
      setChecked(true);
    });
  }, []);

  // Nothing is shown until the answer is known, so the app never flashes into
  // view for someone who turns out not to be signed in.
  if (!checked) return null;
  if (user) return null;
  return (
    <AuthGate
      onSignedIn={() => {
        // Reload so the workspace is fetched fresh as the signed-in baker.
        window.location.reload();
      }}
    />
  );
}

const gate = document.createElement("div");
gate.id = "baketly-auth-gate";
// The generated page rewrites document.body once it renders, which detaches
// anything mounted inside it. Sitting on documentElement survives that, and the
// observer puts it back if some later render removes it anyway.
document.documentElement.appendChild(gate);
new MutationObserver(() => {
  if (!gate.isConnected) document.documentElement.appendChild(gate);
}).observe(document.documentElement, { childList: true, subtree: true });
createRoot(gate).render(<AuthBoundary />);

window.__baketlySignOut = signOut;
window.__baketlySampleWorkspace = buildSampleWorkspace;
window.__baketlyEmptyWorkspace = emptyWorkspace;