import { z } from "zod";

export const createSnipeSchema = z.object({
  listingId: z.string().trim().min(1, "listingId is required"),
  maxBid: z.coerce.number().positive("maxBid must be greater than 0"),
  title: z.string().trim().max(500).optional(),
  endsAt: z.string().trim().optional(),
});

export type CreateSnipeInput = z.infer<typeof createSnipeSchema>;

export const cancelSnipeSchema = z.object({
  listingId: z.string().trim().min(1, "listingId is required"),
});

export type CancelSnipeInput = z.infer<typeof cancelSnipeSchema>;
