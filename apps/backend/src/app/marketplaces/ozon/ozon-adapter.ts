import {
  AnalyticsPoint,
  Order,
  Product,
  Report,
  ReportKind,
  Sale,
  Stock,
} from '../domain-models';
import {
  DateRange,
  MarketplaceAdapter,
  MarketplaceCapabilities,
  OrderQuery,
  ProductQuery,
  SalesFunnelStage,
} from '../marketplace-adapter';
import { MarketplaceInfo, MarketplaceType } from '../marketplace-type';

export interface OzonCredentials {
  clientId: string;
  apiKey: string;
}

const BASE_URL = 'https://api-seller.ozon.ru';

interface OzonListResponse {
  result: {
    items: Array<{ product_id: number; offer_id: string }>;
    total: number;
    last_id: string;
  };
}

interface OzonInfoResponse {
  result: { items: OzonProductInfo[] };
}

interface OzonProductInfo {
  id: number;
  offer_id: string;
  name: string;
  price: string;
  barcode?: string;
  brand?: string;
}

/**
 * Ozon Seller API adapter. Instantiated per user with that user's credentials.
 */
export class OzonAdapter implements MarketplaceAdapter {
  readonly info: MarketplaceInfo = {
    type: MarketplaceType.Ozon,
    name: 'Ozon',
    priority: 2,
    implemented: true,
  };

  readonly capabilities: MarketplaceCapabilities = {
    products: true,
    orders: false,
    sales: false,
    stocks: false,
    analytics: false,
    reports: false,
    search: false,
    funnel: false,
  };

  constructor(
    private readonly credentials: OzonCredentials,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getProducts(query: ProductQuery = {}): Promise<Product[]> {
    // TODO: paginate via last_id when limit is exceeded.
    const list = await this.post<OzonListResponse>('/v3/product/list', {
      filter: { visibility: 'ALL' },
      last_id: '',
      limit: query.limit ?? 100,
    });

    const productIds = list.result.items.map((i) => String(i.product_id));
    if (productIds.length === 0) {
      return [];
    }

    const info = await this.post<OzonInfoResponse>('/v3/product/info/list', {
      product_id: productIds,
    });

    const updatedAt = new Date().toISOString();
    return info.result.items.map((item) => this.mapProduct(item, updatedAt));
  }

  async getOrders(_query?: OrderQuery): Promise<Order[]> {
    return [];
  }

  async getSales(_range?: DateRange): Promise<Sale[]> {
    return [];
  }

  async getStocks(_skus?: string[]): Promise<Stock[]> {
    return [];
  }

  async getAnalytics(_range?: DateRange, _sku?: string): Promise<AnalyticsPoint[]> {
    return [];
  }

  async requestReport(
    _kind: ReportKind,
    _range?: DateRange,
  ): Promise<Report> {
    throw new Error('Ozon reports are not implemented yet');
  }

  async getReport(_id: string): Promise<Report> {
    throw new Error('Ozon reports are not implemented yet');
  }

  async searchProducts(_query: string): Promise<Product[]> {
    return [];
  }

  async getSalesFunnel(_range?: DateRange): Promise<SalesFunnelStage[]> {
    return [];
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Client-Id': this.credentials.clientId,
        'Api-Key': this.credentials.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ozon API ${path} failed: HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  }

  private mapProduct(item: OzonProductInfo, updatedAt: string): Product {
    return {
      marketplace: MarketplaceType.Ozon,
      sku: item.offer_id,
      name: item.name,
      price: Number.parseFloat(item.price) || 0,
      currency: 'RUB',
      barcode: item.barcode,
      brand: item.brand,
      updatedAt,
    };
  }
}
