export interface EbayOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface EbayPrice {
  value: string;
  currency: string;
}

export interface EbayImage {
  imageUrl: string;
}

export interface EbaySeller {
  username: string;
  feedbackPercentage: string;
  feedbackScore: number;
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price: EbayPrice;
  currentBidPrice?: EbayPrice;
  bidCount?: number;
  buyingOptions: string[];
  itemWebUrl: string;
  image?: EbayImage;
  seller?: EbaySeller;
  itemEndDate?: string;
  categories?: Array<{ categoryId: string; categoryName: string }>;
  condition?: string;
  shippingOptions?: Array<{
    shippingCostType?: string;
    shippingCost?: EbayPrice;
  }>;
}

export interface EbaySearchResponse {
  total: number;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
  warnings?: Array<{ errorId: number; message: string }>;
}

export interface SearchParams {
  query: string;
  categoryId?: string | null;
  minPrice?: number;
  maxPrice?: number;
  buyingType?: "ALL" | "AUCTION" | "FIXED_PRICE";
  limit?: number;
  sort?: string;
}
