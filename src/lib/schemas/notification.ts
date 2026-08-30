import { z } from "zod";

const providerSchema = z.enum(["NTFY", "GOTIFY", "DISCORD", "TELEGRAM", "EMAIL"]);

const emptyToNull = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null) return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

export const upsertNotificationSchema = z.object({
  id: z.string().trim().min(1).optional(),
  provider: providerSchema,
  name: emptyToNull,
  endpointUrl: z
    .union([z.string().trim().url(), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  authToken: emptyToNull,
  channel: emptyToNull,
  priority: z.coerce.number().int().min(0).max(10).optional().default(3),
  isEnabled: z.boolean().optional().default(true),
});

export const testNotificationSchema = z.object({
  id: z.string().trim().min(1).optional(),
});

export type UpsertNotificationInput = z.infer<typeof upsertNotificationSchema>;
