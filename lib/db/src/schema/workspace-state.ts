import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { z } from "zod/v4";

// One row per baker. The primary key is the user id, so a query for someone
// else's workspace cannot be expressed by accident: there is nothing to ask for
// but your own row.
export const workspaceStateTable = pgTable("workspace_state", {
  id: text("id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const quantityRecordSchema = z.record(
  z.string().min(1).max(120),
  z.number().finite().min(0).max(1_000_000),
);
const checkRecordSchema = z.record(z.string().min(1).max(120), z.boolean());
const recipeRecordSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(160),
    // the id of the recipe's group: one of the original four, one the baker
    // made in Settings, or empty for no group
    type: z.string().max(60),
    icon: z.enum(["loaf", "babka", "focaccia", "brookie", "cookie", "cake", "cup"]),
    price: z.number().finite().min(0).max(10_000),
    yield: z.number().int().min(1).max(10_000),
    activeMinutes: z.number().int().min(0).max(10_000).optional(),
    activeMinutes: z.number().int().min(0).max(10_000).optional(),
    ingredientKeys: z.array(z.string().min(1).max(80)).max(100),
    packagingKeys: z.array(z.string().min(1).max(80)).max(100),
    amounts: quantityRecordSchema,
    // a small square photo of the bake, shrunk on the phone before saving
    photo: z
      .string()
      .max(200_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict();
const ingredientRecordSchema = z
  .object({
    name: z.string().min(1).max(160),
    supplier: z.string().max(160),
    packagePrice: z.number().finite().min(0).max(1_000_000),
    packageSize: z.number().finite().positive().max(1_000_000),
    unit: z.enum(["g", "kg", "oz", "lb", "ml", "pc"]),
    kcal: z.number().finite().min(0).max(100_000),
    protein: z.number().finite().min(0).max(100_000),
    carbs: z.number().finite().min(0).max(100_000),
    fat: z.number().finite().min(0).max(100_000),
    sugar: z.number().finite().min(0).max(100_000).optional(),
    category: z.string().max(40).optional(),
    servingSize: z.number().finite().positive().max(100_000).optional(),
    servingUnit: z.string().max(30).optional(),
    photoPath: z.string().max(300).optional(),
  })
  .strict();
const packagingRecordSchema = z
  .object({
    name: z.string().min(1).max(160),
    supplier: z.string().max(160),
    packPrice: z.number().finite().min(0).max(1_000_000),
    unitsPerPack: z.number().finite().positive().max(1_000_000),
    photoPath: z.string().max(300).optional(),
  })
  .strict();
const saleLineItemSchema = z
  .object({
    productId: z.string().min(1).max(120),
    name: z.string().min(1).max(160),
    quantity: z.number().int().positive().max(1_000_000),
    unitPrice: z.number().finite().min(0).max(1_000_000),
    unitCost: z.number().finite().min(0).max(1_000_000),
  })
  .strict();
const saleRecordSchema = z
  .object({
    id: z.string().min(1).max(120),
    occurredAt: z.iso.datetime(),
    source: z.enum(["pos", "cash", "event"]),
    eventId: z.string().min(1).max(120).optional(),
    total: z.number().finite().min(0).max(1_000_000),
    lineItems: z.array(saleLineItemSchema).max(100),
  })
  .strict();
const eventRecordSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(160),
    occurredAt: z.iso.datetime(),
    boothFee: z.number().finite().min(0).max(1_000_000),
    otherCosts: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          amount: z.number().finite().min(0).max(1_000_000),
        }),
      )
      .max(20)
      .optional(),
    status: z.enum(["planned", "completed"]).optional(),
    plannedItems: z
      .array(
        z.object({
          productId: z.string().min(1).max(120),
          name: z.string().min(1).max(160),
          quantity: z.number().int().min(0).max(1_000_000),
        }),
      )
      .max(100)
      .optional(),
    lineItems: z.array(saleLineItemSchema).max(100),
  })
  .strict();

const pricePointSchema = z
  .object({
    at: z.iso.datetime(),
    packagePrice: z.number().finite().min(0).max(1_000_000),
    packageSize: z.number().finite().min(0).max(1_000_000),
    unit: z.string().max(10),
    unitCost: z.number().finite().min(0).max(1_000_000),
  })
  .strict();

const marketProductSchema = z
  .object({
    name: z.string().min(1).max(120),
    price: z.number().finite().min(0).max(1_000_000),
    localLow: z.number().finite().min(0).max(1_000_000).nullable(),
    localHigh: z.number().finite().min(0).max(1_000_000).nullable(),
    verdict: z.enum(["under", "in_range", "over", "unknown"]),
    note: z.string().max(240),
    grounded: z.boolean(),
    competitors: z
      .array(
        z
          .object({
            name: z.string().max(80),
            price: z.number().finite().min(0).max(1_000_000).nullable(),
            uri: z.string().max(400),
            sourceTitle: z.string().max(120),
          })
          .strict(),
      )
      .max(3)
      .optional(),
  })
  .strict();

export const workspaceStatePayloadSchema = z
  .object({
    sampleDataLoaded: z.boolean().optional(),
    bakeryName: z.string().max(120).optional(),
    bakeryLocation: z.string().max(160).optional(),
    bakerySpecialties: z.array(z.string().min(1).max(40)).max(20).optional(),
    ownerName: z.string().max(60).optional(),
    todoItems: z
      .array(
        z
          .object({
            text: z.string().min(1).max(120),
            done: z.boolean(),
            // the day it is for, as YYYY-MM-DD; absent on to-dos saved before
            // they had one, which the home screen puts on today
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    // the baker's own recipe groups, in the order they are listed; a recipe's
    // type holds the id of the group it is in
    recipeGroups: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            name: z.string().max(40),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    currency: z.enum(["USD", "EUR", "GBP"]).optional(),
    hourlyRate: z.number().finite().min(0).max(10_000).optional(),
    targetMargin: z.number().finite().min(0).max(100).optional(),
    onboardingComplete: z.boolean().optional(),
    priceHistory: z
      .record(z.string().min(1).max(80), z.array(pricePointSchema).max(12))
      .optional(),
    marketCheck: z
      .object({
        checkedAt: z.iso.datetime(),
        location: z.string().max(160),
        currency: z.string().max(8),
        summary: z.string().max(400),
        products: z.array(marketProductSchema).max(12),
        sources: z
          .array(z.object({ title: z.string().max(120), uri: z.string().max(400) }).strict())
          .max(8),
        searches: z.array(z.string().max(120)).max(6),
      })
      .strict()
      .optional(),
    price: z.number().finite().min(0).max(10_000).optional(),
    chatMsgs: z
      .array(
        z.object({
          who: z.enum(["u", "b"]),
          text: z.string().min(1).max(2_000),
        }),
      )
      .max(100)
      .optional(),
    recipeAmts: quantityRecordSchema.optional(),
    recipeIngKeys: z.array(z.string().min(1).max(80)).max(100).optional(),
    recipePackKeys: z.array(z.string().min(1).max(80)).max(100).optional(),
    recipeYield: z.number().int().min(1).max(10_000).optional(),
    recipeRecords: z.array(recipeRecordSchema).max(200).optional(),
    ingredientRecords: z
      .record(z.string().min(1).max(80), ingredientRecordSchema)
      .refine((records) => Object.keys(records).length <= 100)
      .optional(),
    packagingRecords: z
      .record(z.string().min(1).max(80), packagingRecordSchema)
      .refine((records) => Object.keys(records).length <= 100)
      .optional(),
    removedIngredientKeys: z.array(z.string().min(1).max(80)).max(100).optional(),
    removedPackagingKeys: z.array(z.string().min(1).max(80)).max(100).optional(),
    evQty: quantityRecordSchema.optional(),
    evPicked: z.array(z.string().min(1).max(120)).max(200).optional(),
    shopNeed: quantityRecordSchema.optional(),
    saleEventId: z.string().max(120).optional(),
    evSold: quantityRecordSchema.optional(),
    evStatus: z.enum(["planned", "completed"]).optional(),
    evSaved: z.boolean().optional(),
    actualRev: z.number().finite().min(0).max(1_000_000).optional(),
    soldRev: z.number().finite().min(0).max(1_000_000).optional(),
    shopChecked: checkRecordSchema.optional(),
    cashQty: quantityRecordSchema.optional(),
    cashPaid: z.string().max(50).optional(),
    cashOrdersArr: z
      .array(
        z.object({
          summary: z.string().min(1).max(500),
          time: z.string().min(1).max(100),
          total: z.number().finite().min(0).max(1_000_000),
          saleId: z.string().min(1).max(120).optional(),
        }),
      )
      .max(1_000)
      .optional(),
    saleRecords: z.array(saleRecordSchema).max(5_000).optional(),
    eventRecords: z.array(eventRecordSchema).max(500).optional(),
    eventCurrentId: z.string().min(1).max(120).optional(),
    eventName: z.string().min(1).max(160).optional(),
    eventDate: z.iso.date().optional(),
    eventBoothFee: z.number().finite().min(0).max(1_000_000).optional(),
    extraEvents: z
      .array(
        z.object({
          name: z.string().min(1).max(160),
          products: z.string().min(1).max(50),
          revStr: z.string().min(1).max(50),
        }),
      )
      .max(200)
      .optional(),
    todayArr: z
      .array(z.number().finite().min(0).max(1_000_000))
      .max(10_000)
      .optional(),
  })
  .strict();
export type WorkspaceStatePayload = z.infer<typeof workspaceStatePayloadSchema>;