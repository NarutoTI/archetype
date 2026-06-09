import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: storage.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      storage.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      storage.delete(key);
    }),
  },
}));

import { useEntityBucketCache } from '@/composables/useEntityBucketCache';

interface Item {
  id: string;
  date: string; // 'YYYY-MM-DD'; the year defines the bucket
}

const item = (id: string, date: string): Item => ({ id, date });

let scope = 'user-1';

const createCache = () =>
  useEntityBucketCache<Item>({
    cachePrefix: 'test-cache',
    getScope: () => scope,
    getItemBucket: (entry) => Number(entry.date.slice(0, 4)),
    getItemId: (entry) => entry.id,
    compareItems: (a, b) => a.date.localeCompare(b.date),
  });

describe('useEntityBucketCache', () => {
  beforeEach(() => {
    storage.clear();
    scope = 'user-1';
  });

  it('upsertItem() inserts sorted and moves items across buckets', async () => {
    const cache = createCache();

    await cache.upsertItem(item('b', '2026-06-20'));
    await cache.upsertItem(item('a', '2026-06-10'));
    expect(cache.getBucket(2026).map((entry) => entry.id)).toEqual(['a', 'b']);

    // Moving "a" to 2027 must remove it from 2026 and persist both buckets.
    await cache.upsertItem(item('a', '2027-01-05'));
    expect(cache.getBucket(2026).map((entry) => entry.id)).toEqual(['b']);
    expect(cache.getBucket(2027).map((entry) => entry.id)).toEqual(['a']);
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([2026, 2027]);
    expect(storage.has('test-cache:user-1:2027')).toBe(true);
  });

  it('removeItem() drops empty buckets from memory, disk and index', async () => {
    const cache = createCache();
    await cache.upsertItem(item('a', '2026-06-10'));

    await cache.removeItem('a');

    expect(cache.hasBucket(2026)).toBe(false);
    expect(storage.has('test-cache:user-1:2026')).toBe(false);
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([]);
  });

  it('replaceAll() removes persisted buckets that no longer exist', async () => {
    const cache = createCache();
    await cache.upsertItem(item('old', '2020-01-01'));
    expect(storage.has('test-cache:user-1:2020')).toBe(true);

    await cache.replaceAll([item('a', '2026-06-10'), item('b', '2027-02-02')]);

    expect(cache.loadedBuckets.value).toEqual([2026, 2027]);
    expect(storage.has('test-cache:user-1:2020')).toBe(false);
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([2026, 2027]);
  });

  it('initializeFromStorage() restores every cached bucket', async () => {
    storage.set('test-cache:user-1:years', JSON.stringify([2026, 2027]));
    storage.set('test-cache:user-1:2026', JSON.stringify([item('a', '2026-06-10')]));
    storage.set('test-cache:user-1:2027', JSON.stringify([item('b', '2027-02-02')]));

    const cache = createCache();
    const restored = await cache.initializeFromStorage();

    expect(restored).toBe(true);
    expect(cache.items.value.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('fetchBucket() dedupes concurrent callers into one fetch', async () => {
    const cache = createCache();
    let resolveFetch: (value: Item[]) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<Item[]>((resolve) => { resolveFetch = resolve; }),
    );

    const first = cache.fetchBucket(2026, fetcher);
    const second = cache.fetchBucket(2026, fetcher);
    resolveFetch([item('a', '2026-06-10')]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
    expect(cache.getBucket(2026).map((entry) => entry.id)).toEqual(['a']);
  });

  it('items concatenates buckets in ascending order regardless of insertion order', async () => {
    const cache = createCache();
    await cache.upsertItem(item('later', '2030-01-01'));
    await cache.upsertItem(item('sooner', '2026-06-10'));

    expect(cache.items.value.map((entry) => entry.id)).toEqual(['sooner', 'later']);
  });

  it('does not persist empty buckets in the index but keeps them in memory', async () => {
    const cache = createCache();
    await cache.setBucket(2026, []);

    // Memory keeps the "loaded, but empty" marker to avoid refetching...
    expect(cache.hasBucket(2026)).toBe(true);
    // ...while the persisted index skips it.
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([]);
    expect(storage.has('test-cache:user-1:2026')).toBe(false);
  });

  it('drops the in-memory cache when the scope changes (user switch)', async () => {
    const cache = createCache();
    await cache.upsertItem(item('a', '2026-06-10'));
    expect(cache.items.value).toHaveLength(1);

    scope = 'user-2';

    // First operation under the new scope clears user-1 data from memory...
    expect(cache.ensureScope()).toBe(true);
    expect(cache.items.value).toHaveLength(0);
    // ...without touching user-1 persisted entries.
    expect(storage.has('test-cache:user-1:2026')).toBe(true);
  });

  it('discards fetch results that resolve after a scope change', async () => {
    const cache = createCache();
    let resolveFetch: (value: Item[]) => void = () => {};
    const fetchPromise = cache.fetchBucket(
      2026,
      () => new Promise<Item[]>((resolve) => { resolveFetch = resolve; }),
    );

    scope = 'user-2';
    cache.ensureScope();

    resolveFetch([item('stale', '2026-06-10')]);
    await fetchPromise;

    expect(cache.hasBucket(2026)).toBe(false);
    expect(storage.has('test-cache:user-2:2026')).toBe(false);
  });

  it('does not store stale fetch results when the scope changes before being observed', async () => {
    const cache = createCache();
    let resolveFetch: (value: Item[]) => void = () => {};
    const fetchPromise = cache.fetchBucket(
      2026,
      () => new Promise<Item[]>((resolve) => { resolveFetch = resolve; }),
    );

    // Simulates auth switching users while the old request is still pending,
    // before another store operation has had a chance to call ensureScope().
    scope = 'user-2';

    resolveFetch([item('stale', '2026-06-10')]);
    await fetchPromise;

    expect(cache.currentScope()).toBe('user-2');
    expect(cache.hasBucket(2026)).toBe(false);
    expect(storage.has('test-cache:user-2:2026')).toBe(false);
  });

  it('supports string buckets (e.g. country:year compound keys)', async () => {
    const cache = useEntityBucketCache<{ id: string; country: string; year: number }, string>({
      cachePrefix: 'holidays-cache',
      getScope: () => 'global',
      getItemBucket: (entry) => `${entry.country}:${entry.year}`,
      getItemId: (entry) => entry.id,
    });

    await cache.upsertItem({ id: 'h1', country: 'BR', year: 2026 });
    await cache.upsertItem({ id: 'h2', country: 'US', year: 2026 });

    expect(cache.getBucket('BR:2026').map((entry) => entry.id)).toEqual(['h1']);
    expect(cache.loadedBuckets.value).toEqual(['BR:2026', 'US:2026']);
    expect(storage.has('holidays-cache:global:BR:2026')).toBe(true);
  });
});
