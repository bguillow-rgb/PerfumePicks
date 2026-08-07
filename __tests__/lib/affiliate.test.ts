import { affiliateNetworkForUrl, handleAffiliateClick } from '@/src/lib/affiliate';

// Mock every side-effecting dependency so the test asserts behavior, not network.
// jest.mock factories may only reference vars prefixed with `mock`.
const mockOpenBrowser = jest.fn((..._a: unknown[]) => Promise.resolve({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

const mockTrack = jest.fn((..._a: unknown[]) => undefined);
jest.mock('@/src/lib/observability', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/src/lib/observability/events', () => ({
  EVENTS: {
    AFFILIATE_OUTBOUND_CLICKED: 'affiliate_outbound_clicked',
    AFFILIATE_LINK_FAILED: 'affiliate_link_failed',
    AFFILIATE_CLICK_UNLEDGERED: 'affiliate_click_unledgered',
  },
}));
jest.mock('@/src/lib/feedback', () => ({ reportDeadLink: jest.fn(() => Promise.resolve()) }));

const mockInsert = jest.fn((..._a: unknown[]) => Promise.resolve({ error: null }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }) },
}));

const mockResolveUser = jest.fn<Promise<{ id: string } | null>, unknown[]>(
  () => Promise.resolve({ id: 'user-1' }),
);
jest.mock('@/src/stores/useAuthStore', () => ({
  resolveCurrentUser: () => mockResolveUser(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('affiliateNetworkForUrl', () => {
  // Reporting integrity depends on this classification. A miss here silently
  // buckets a CJ click as 'direct' and corrupts the per-network numbers.
  const cases: Array<[string, 'cj' | 'awin' | 'direct']> = [
    ['https://www.anrdoezrs.net/click-123?url=https://fragranceshop.com/x', 'cj'],
    ['https://www.jdoqocy.com/click-9?url=https://perfumania.com/y', 'cj'],
    ['https://www.dpbolvw.com/click-1', 'cj'],
    ['https://www.tqlkg.com/click-1', 'cj'],
    ['https://www.kqzyfj.com/click-1', 'cj'],
    ['https://www.awin1.com/cread.php?awinmid=34989&ued=https://aromapassions.com', 'awin'],
    ['https://www.creed.com/product', 'direct'],
    ['https://diptyqueparis.com/en_us/p/eau', 'direct'],
    ['', 'direct'],
  ];
  it.each(cases)('%s → %s', (url, expected) => {
    expect(affiliateNetworkForUrl(url)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(affiliateNetworkForUrl('HTTPS://WWW.ANRDOEZRS.NET/CLICK')).toBe('cj');
  });
});

describe('handleAffiliateClick', () => {
  const params = {
    fragrance_id: 'elie-saab-le-parfum',
    retailer: 'fragranceshop',
    url: 'https://www.anrdoezrs.net/click-1?url=https://fragranceshop.com/x',
    price_cents: 4595,
    source_screen: 'detail',
  };

  it('always opens the retailer URL (money path is never gated on logging)', () => {
    handleAffiliateClick(params);
    expect(mockOpenBrowser).toHaveBeenCalledWith(params.url);
  });

  it('fires the PostHog secondary signal', () => {
    handleAffiliateClick(params);
    expect(mockTrack).toHaveBeenCalledWith('affiliate_outbound_clicked', expect.objectContaining({
      retailer: 'fragranceshop',
    }));
  });

  it('writes a durable ledger row with the derived network + user', async () => {
    handleAffiliateClick(params);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.app).toBe('perfumepicks');
    expect(row.network).toBe('cj');
    expect(row.retailer).toBe('fragranceshop');
    expect(row.product_id).toBe('elie-saab-le-parfum');
    expect(row.user_id).toBe('user-1');
    expect(row.click_id).toBeTruthy();
  });

  it('still opens the URL when there is no signed-in user (no ledger row)', async () => {
    mockResolveUser.mockResolvedValueOnce(null);
    handleAffiliateClick(params);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockOpenBrowser).toHaveBeenCalledWith(params.url);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // A sessionless tap can't satisfy the RLS check (auth.uid() = user_id), so it
  // never reaches the ledger. That's tolerable; losing it SILENTLY is not —
  // it's why PostHog taps and ledger rows disagreed with no way to explain the
  // gap. The skip has to be countable.
  it('counts a sessionless tap instead of dropping it silently', async () => {
    mockResolveUser.mockResolvedValueOnce(null);
    handleAffiliateClick(params);
    await new Promise((r) => setTimeout(r, 0));

    const unledgered = mockTrack.mock.calls.filter(
      (c) => c[0] === 'affiliate_click_unledgered',
    );
    expect(unledgered).toHaveLength(1);
    expect(unledgered[0][1]).toMatchObject({ reason: 'no_session', retailer: params.retailer });
  });

  it('never throws even if the ledger insert rejects', async () => {
    mockInsert.mockRejectedValueOnce(new Error('db down'));
    expect(() => handleAffiliateClick(params)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockOpenBrowser).toHaveBeenCalledWith(params.url);
  });

  it('counts a failed insert too — same audit hole', async () => {
    mockInsert.mockRejectedValueOnce(new Error('db down'));
    handleAffiliateClick(params);
    await new Promise((r) => setTimeout(r, 0));

    const unledgered = mockTrack.mock.calls.filter(
      (c) => c[0] === 'affiliate_click_unledgered',
    );
    expect(unledgered).toHaveLength(1);
    expect(unledgered[0][1]).toMatchObject({ reason: 'insert_failed' });
  });
});
