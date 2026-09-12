import { z } from "zod";

import { MIN_ARBITRAGE_DISCOUNT_RANGE } from "@/lib/valuation/defaults";

export const estimatorSettingsSchema = z.object({
  enabled: z.boolean(),
  minDiscount: z.coerce
    .number()
    .int()
    .min(MIN_ARBITRAGE_DISCOUNT_RANGE.min, `Minimum discount must be at least ${MIN_ARBITRAGE_DISCOUNT_RANGE.min}%`)
    .max(MIN_ARBITRAGE_DISCOUNT_RANGE.max, `Minimum discount must be at most ${MIN_ARBITRAGE_DISCOUNT_RANGE.max}%`),
});

export type EstimatorSettingsInput = z.infer<typeof estimatorSettingsSchema>;
