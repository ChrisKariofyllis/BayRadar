export const EBAY_MARKETPLACES = [
  { id: "EBAY_DE", label: "Germany" },
  { id: "EBAY_US", label: "United States" },
  { id: "EBAY_GB", label: "UK" },
  { id: "EBAY_FR", label: "France" },
  { id: "EBAY_IT", label: "Italy" },
  { id: "EBAY_ES", label: "Spain" },
  { id: "EBAY_AT", label: "Austria" },
  { id: "EBAY_CH", label: "Switzerland" },
] as const;

export type EbayMarketplaceId = (typeof EBAY_MARKETPLACES)[number]["id"];

export const EBAY_MARKETPLACE_IDS = EBAY_MARKETPLACES.map((item) => item.id) as [
  EbayMarketplaceId,
  ...EbayMarketplaceId[],
];
