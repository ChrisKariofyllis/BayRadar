import { validate as validateCron } from "node-cron";
import { z } from "zod";

const buyingTypeSchema = z.enum(["ALL", "AUCTION", "FIXED_PRICE"]);

const negativeKeywordsSchema = z
  .union([z.array(z.string()), z.string(), z.null()])
  .optional()
  .transform((value) => normalizeNegativeKeywords(value));

const cronScheduleSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => validateCron(value), { message: "Invalid cron expression" });

export const createMonitorSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  query: z.string().trim().min(1, "query is required"),
  categoryId: z.string().trim().min(1).nullable().optional(),
  maxPrice: z.coerce.number().positive("maxPrice must be greater than 0"),
  buyingType: buyingTypeSchema.optional().default("ALL"),
  maxRemainingHours: z.coerce.number().int().positive().nullable().optional(),
  negativeKeywords: negativeKeywordsSchema,
  cronSchedule: cronScheduleSchema.optional().default("*/15 * * * *"),
  isActive: z.boolean().optional().default(true),
});

export const updateMonitorSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    categoryId: z.string().trim().min(1).nullable().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    buyingType: buyingTypeSchema.optional(),
    maxRemainingHours: z.coerce.number().int().positive().nullable().optional(),
    negativeKeywords: negativeKeywordsSchema,
    cronSchedule: cronScheduleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required",
  });

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

function normalizeNegativeKeywords(value: string[] | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const keywords = value.map((item) => item.trim()).filter(Boolean);
    return keywords.length ? JSON.stringify(keywords) : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const keywords = parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      return keywords.length ? JSON.stringify(keywords) : null;
    }
  } catch {
    // fall through to comma-separated
  }

  const keywords = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return keywords.length ? JSON.stringify(keywords) : null;
}
