export type BuyingType = "ALL" | "AUCTION" | "FIXED_PRICE";
export type NotificationProvider = "NTFY" | "GOTIFY" | "DISCORD" | "TELEGRAM" | "EMAIL";

export interface Monitor {
  id: string;
  name: string;
  query: string;
  categoryId: string | null;
  minPrice: number | null;
  maxPrice: number;
  buyingType: BuyingType;
  maxRemainingHours: number | null;
  negativeKeywords: string | null;
  cronSchedule: string;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  seenListingsCount: number;
}

export interface SeenListing {
  id: string;
  itemId: string;
  monitorId: string;
  title: string;
  price: number;
  currency: string;
  buyingFormat: string;
  bidCount: number | null;
  itemUrl: string;
  imageUrl: string | null;
  sellerFeedback: number | null;
  endsAt: string | null;
  notifiedAt: string;
  createdAt: string;
  monitor: { id: string; name: string };
}

export interface NotificationChannel {
  id: string;
  provider: NotificationProvider;
  name: string | null;
  endpointUrl: string | null;
  authToken: string | null;
  channel: string | null;
  priority: number;
  isEnabled: boolean;
  hasAuthToken?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemStatus {
  ebay: {
    configured: boolean;
    appIdConfigured: boolean;
    certIdConfigured: boolean;
    environment: string;
    marketplaceId: string;
    mockMode: boolean;
    mockReason: "env" | "settings" | "missing-credentials" | "invalid-credentials" | "off";
  };
  ai: {
    configured: boolean;
    model: string;
    baseUrl: string;
  };
  poller: {
    mode: "hybrid" | "worker" | "serverless";
    defaultCron: string;
  };
}
