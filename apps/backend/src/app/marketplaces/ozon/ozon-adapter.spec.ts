import { MarketplaceType } from '../marketplace-type';
import { OzonAdapter } from './ozon-adapter';

describe('OzonAdapter', () => {
  const credentials = { clientId: 'client-123', apiKey: 'secret-key' };

  function mockResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as unknown as Response;
  }

  function adapterWith(fn: jest.Mock) {
    return new OzonAdapter(credentials, fn as unknown as typeof fetch);
  }

  it('sends Ozon auth headers and maps products', async () => {
    const fn = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const url = String(_url);
      if (url.includes('/v3/product/list')) {
        return mockResponse({
          result: { items: [{ product_id: 111, offer_id: 'sku-1' }], total: 1, last_id: '' },
        });
      }
      if (url.includes('/v3/product/info/list')) {
        return mockResponse({
          result: {
            items: [
              {
                id: 111,
                offer_id: 'sku-1',
                name: 'Товар',
                price: '1990.0000',
                barcode: '4600000000001',
                brand: 'Бренд',
              },
            ],
          },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const products = await adapterWith(fn).getProducts();

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      marketplace: MarketplaceType.Ozon,
      sku: 'sku-1',
      name: 'Товар',
      price: 1990,
      currency: 'RUB',
      barcode: '4600000000001',
      brand: 'Бренд',
    });

    const [, init] = fn.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Client-Id']).toBe('client-123');
    expect(headers['Api-Key']).toBe('secret-key');
  });

  it('returns empty when there are no products', async () => {
    const fn = jest.fn(async () =>
      mockResponse({ result: { items: [], total: 0, last_id: '' } }),
    );
    await expect(adapterWith(fn).getProducts()).resolves.toEqual([]);
  });

  it('throws on non-ok response', async () => {
    const fn = jest.fn(async () => mockResponse({}, false, 401));
    await expect(adapterWith(fn).getProducts()).rejects.toThrow(/401/);
  });
});
