import { z } from "zod";

import { EBAY_MARKETPLACE_IDS } from "@/lib/ebay-marketplaces";

export const ebaySettingsSchema = z.object({
  appId: z.string().trim().min(1, "App ID is required"),
  certId: z.string().optional().nullable(),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).default("PRODUCTION"),
  marketplaceId: z.enum(EBAY_MARKETPLACE_IDS).default("EBAY_DE"),
});

export const ebayMockModeSchema = z.object({
  mockMode: z.boolean(),
});

export type EbaySettingsInput = z.infer<typeof ebaySettingsSchema>;
export type EbayMockModeInput = z.infer<typeof ebayMockModeSchema>;
