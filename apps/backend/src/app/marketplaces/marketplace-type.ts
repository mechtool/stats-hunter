/**
 * Supported marketplaces, in integration priority order.
 */
export enum MarketplaceType {
  Wildberries = 'wildberries',
  Ozon = 'ozon',
  YandexMarket = 'yandex-market',
  SberMegaMarket = 'sber-megamarket',
  Avito = 'avito',
}

export interface MarketplaceInfo {
  type: MarketplaceType;
  /** Human-readable name. */
  name: string;
  /** Integration order. */
  priority: number;
  /** True once the adapter is implemented and enabled. */
  implemented: boolean;
}
