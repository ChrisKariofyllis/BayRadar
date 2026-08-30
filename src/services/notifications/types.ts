export interface DealPayload {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  buyingFormat: string;
  itemUrl: string;
  imageUrl?: string | null;
  bidCount?: number | null;
  endsAt?: Date | string | null;
  monitorName: string;
}

export interface NotificationResult {
  success: boolean;
  provider: string;
  error?: string;
}

export interface NotificationAdapter {
  send(
    setting: {
      endpointUrl?: string | null;
      authToken?: string | null;
      channel?: string | null;
      priority?: number | null;
      name?: string | null;
    },
    deal: DealPayload,
  ): Promise<NotificationResult>;
}
