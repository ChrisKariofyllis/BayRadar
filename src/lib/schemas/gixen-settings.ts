import { z } from "zod";

export const gixenSettingsSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().optional().nullable(),
  enabled: z.boolean(),
});

export type GixenSettingsInput = z.infer<typeof gixenSettingsSchema>;
