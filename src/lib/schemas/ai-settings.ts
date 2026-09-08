import { z } from "zod";

export const aiSettingsSchema = z.object({
  aiBaseUrl: z
    .string()
    .trim()
    .min(1, "Base URL is required")
    .url("Enter a valid OpenAI-compatible base URL"),
  aiApiKey: z.string().optional().nullable(),
  aiModel: z.string().trim().min(1, "Model name is required"),
});

export const suggestNegativesSchema = z.object({
  query: z.string().trim().min(1, "query is required"),
  marketplaceId: z.string().trim().min(1, "marketplaceId is required"),
  minPrice: z.number().positive().optional().nullable(),
  maxPrice: z.number().positive().optional().nullable(),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type SuggestNegativesInput = z.infer<typeof suggestNegativesSchema>;
