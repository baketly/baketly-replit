// The baker's own workspace, read on the server.
//
// Ask Baketly used to be handed a snapshot built in the browser and posted up
// with the question. That put the browser in charge of what the assistant
// could see, made every message carry the whole bakery, and meant the answer
// was only ever as honest as the page that assembled it.
//
// The workspace is already stored per user and already behind a session. This
// reads it there, for the signed-in user and no one else: no tool takes a
// workspace id, so no question can reach another baker's numbers.

import { workspaceStore } from "../workspace-store";

export interface Recipe {
  id: string;
  name: string;
  /** the id of the group the baker filed it under */
  type?: string;
  price: number;
  yield: number;
  activeMinutes?: number;
  ingredientKeys?: string[];
  packagingKeys?: string[];
  amounts?: Record<string, number>;
}

export interface SaleLine {
  productId?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
}

export interface Sale {
  id?: string;
  occurredAt?: string;
  source?: string;
  eventId?: string;
  total?: number;
  lineItems?: SaleLine[];
}

export interface EventRecord {
  id?: string;
  name?: string;
  occurredAt?: string;
  boothFee?: number;
  otherCosts?: Array<{ label?: string; amount?: number }>;
  status?: string;
  plannedItems?: Array<{ productId?: string; name?: string; quantity?: number }>;
  lineItems?: SaleLine[];
}

export interface IngredientRecord {
  name?: string;
  supplier?: string;
  packagePrice?: number;
  packageSize?: number;
  unit?: string;
}

export interface PackagingRecord {
  name?: string;
  supplier?: string;
  packPrice?: number;
  unitsPerPack?: number;
}

export interface Workspace {
  recipes: Recipe[];
  sales: Sale[];
  events: EventRecord[];
  ingredients: Record<string, IngredientRecord>;
  packaging: Record<string, PackagingRecord>;
  removedIngredientKeys: string[];
  removedPackagingKeys: string[];
  recipeGroups: Array<{ id?: string; name?: string }>;
  hourlyRate: number;
  currency: string;
  bakeryName: string;
  bakeryLocation: string;
  /** the last saved market check, for questions about local prices */
  marketCheck: Record<string, unknown> | null;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function record<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

const DEFAULT_GROUPS = [
  { id: "bread", name: "Bread" },
  { id: "babka", name: "Babka" },
  { id: "cookie", name: "Cookies" },
  { id: "treat", name: "Treats" },
];

/** The signed-in baker's workspace, or an empty one if they have saved nothing. */
export async function loadWorkspace(userId: string): Promise<Workspace> {
  const row = await workspaceStore.get(userId);
  const state = record<unknown>(row?.data);
  const groups = list<{ id?: string; name?: string }>(state.recipeGroups);

  return {
    recipes: list<Recipe>(state.recipeRecords),
    sales: list<Sale>(state.saleRecords),
    events: list<EventRecord>(state.eventRecords),
    ingredients: record<IngredientRecord>(state.ingredientRecords),
    packaging: record<PackagingRecord>(state.packagingRecords),
    removedIngredientKeys: list<string>(state.removedIngredientKeys),
    removedPackagingKeys: list<string>(state.removedPackagingKeys),
    recipeGroups: groups.length ? groups : DEFAULT_GROUPS,
    hourlyRate: Number(state.hourlyRate) || 0,
    currency: typeof state.currency === "string" ? state.currency : "USD",
    bakeryName: typeof state.bakeryName === "string" ? state.bakeryName : "",
    bakeryLocation: typeof state.bakeryLocation === "string" ? state.bakeryLocation : "",
    marketCheck:
      state.marketCheck && typeof state.marketCheck === "object"
        ? (state.marketCheck as Record<string, unknown>)
        : null,
  };
}

/** Whether there is enough here to answer anything at all. */
export function workspaceIsEmpty(workspace: Workspace): boolean {
  return (
    workspace.recipes.length === 0 &&
    workspace.sales.length === 0 &&
    workspace.events.length === 0 &&
    Object.keys(workspace.ingredients).length === 0
  );
}
