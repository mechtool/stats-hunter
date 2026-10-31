import { MarketplaceType } from './marketplace-type';

export type Currency = string;

export interface Product {
  marketplace: MarketplaceType;
  /** Seller SKU (Wildberries nm, Ozon offer_id, ...). */
  sku: string;
  name: string;
  category?: string;
  brand?: string;
  price: number;
  currency: Currency;
  stock?: number;
  barcode?: string;
  updatedAt: string;
}

export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'unknown';

export interface Order {
  marketplace: MarketplaceType;
  id: string;
  status: OrderStatus;
  price: number;
  currency: Currency;
  quantity: number;
  /** Marketplace commission. */
  commission?: number;
  productSkus: string[];
  createdAt: string;
}

export interface Sale {
  marketplace: MarketplaceType;
  sku: string;
  /** YYYY-MM-DD */
  date: string;
  quantity: number;
  revenue: number;
  commission: number;
  currency: Currency;
}

export interface Stock {
  marketplace: MarketplaceType;
  sku: string;
  warehouse: string;
  quantity: number;
  updatedAt: string;
}

export interface AnalyticsPoint {
  marketplace: MarketplaceType;
  sku?: string;
  /** YYYY-MM-DD */
  date: string;
  impressions?: number;
  views?: number;
  addToCart?: number;
  orders?: number;
  conversions?: number;
}

export type ReportKind = 'sales' | 'finance' | 'products' | 'stocks' | 'returns';

export type ReportStatus = 'pending' | 'in_progress' | 'ready' | 'failed';

export interface Report {
  marketplace: MarketplaceType;
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  requestedAt: string;
  readyAt?: string;
  /** URL to download the report file once ready. */
  url?: string;
}
