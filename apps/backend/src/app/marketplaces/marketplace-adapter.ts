import { MarketplaceInfo } from './marketplace-type';
import {
  AnalyticsPoint,
  Order,
  OrderStatus,
  Product,
  Report,
  ReportKind,
  Sale,
  Stock,
} from './domain-models';

export interface DateRange {
  from?: string;
  to?: string;
}

export interface ProductQuery {
  skus?: string[];
  page?: number;
  limit?: number;
}

export interface OrderQuery {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

export interface SalesFunnelStage {
  stage: 'impressions' | 'views' | 'add_to_cart' | 'orders' | 'purchases';
  label: string;
  value: number;
}

export interface MarketplaceCapabilities {
  products: boolean;
  orders: boolean;
  sales: boolean;
  stocks: boolean;
  analytics: boolean;
  reports: boolean;
  search: boolean;
  funnel: boolean;
}

/**
 * Uniform abstraction over all marketplace APIs. Each marketplace provides its
 * own implementation that normalizes its raw API into the shared domain models.
 */
export interface MarketplaceAdapter {
  readonly info: MarketplaceInfo;
  readonly capabilities: MarketplaceCapabilities;

  getProducts(query?: ProductQuery): Promise<Product[]>;
  getOrders(query?: OrderQuery): Promise<Order[]>;
  getSales(range?: DateRange): Promise<Sale[]>;
  getStocks(skus?: string[]): Promise<Stock[]>;
  getAnalytics(range?: DateRange, sku?: string): Promise<AnalyticsPoint[]>;
  requestReport(kind: ReportKind, range?: DateRange): Promise<Report>;
  getReport(id: string): Promise<Report>;
  searchProducts(query: string): Promise<Product[]>;
  getSalesFunnel(range?: DateRange): Promise<SalesFunnelStage[]>;
}
