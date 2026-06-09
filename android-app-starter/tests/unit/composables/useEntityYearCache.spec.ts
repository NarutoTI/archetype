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

import { useEntityYearCache } from '@/composables/useEntityYearCache';

interface Item {
  id: string;
  date: string; // 'YYYY-MM-DD'; the year defines the bucket
}

const item = (id: string, date: string): Item => ({ id, date });

const createCache = () =>
  useEntityYearCache<Item>({
    cachePrefix: 'test-cache',
    getScope: () => 'user-1',
    getItemYear: (entry) => Number(entry.date.slice(0, 4)),
    getItemId: (entry) => entry.id,
    compareItems: (a, b) => a.date.localeCompare(b.date),
  });

describe('useEntityYearCache', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('upsertItem() inserts sorted and moves items across year buckets', async () => {
    const cache = createCache();

    await cache.upsertItem(item('b', '2026-06-20'));
    await cache.upsertItem(item('a', '2026-06-10'));
    expect(cache.getYear(2026).map((entry) => entry.id)).toEqual(['a', 'b']);

    // Moving "a" to 2027 must remove it from 2026 and persist both years.
    await cache.upsertItem(item('a', '2027-01-05'));
    expect(cache.getYear(2026).map((entry) => entry.id)).toEqual(['b']);
    expect(cache.getYear(2027).map((entry) => entry.id)).toEqual(['a']);
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([2026, 2027]);
    expect(storage.has('test-cache:user-1:2027')).toBe(true);
  });

  it('removeItem() drops empty buckets from memory, disk and index', async () => {
    const cache = createCache();
    await cache.upsertItem(item('a', '2026-06-10'));

    await cache.removeItem('a');

    expect(cache.hasYear(2026)).toBe(false);
    expect(storage.has('test-cache:user-1:2026')).toBe(false);
    expect(JSON.parse(storage.get('test-cache:user-1:years') || '[]')).toEqual([]);
  });

  it('replaceAll() removes persisted years that no longer exist', async () => {
    const cache = createCache();
    await cache.upsertItem(item('old', '2020-01-01'));
    expect(storage.has('test-cache:user-1:2020')).toBe(true);

    await cache.replaceAll([item('a', '2026-06-10'), item('b', '2027-02-02')]);

    expect(cache.loadedYears.value).toEqual([2026, 2027]);
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

  it('fetchYear() dedupes concurrent callers into one fetch', async () => {
    const cache = createCache();
    let resolveFetch: (value: Item[]) => void = () => {};
    const fetcher = vi.fn(
      () => new Promise<Item[]>((resolve) => { resolveFetch = resolve; }),
    );

    const first = cache.fetchYear(2026, fetcher);
    const second = cache.fetchYear(2026, fetcher);
    resolveFetch([item('a', '2026-06-10')]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
    expect(cache.getYear(2026).map((entry) => entry.id)).toEqual(['a']);
  });

  it('items concatenates buckets in ascending year order regardless of insertion order', async () => {
    const cache = createCache();
    await cache.upsertItem(item('later', '2030-01-01'));
    await cache.upsertItem(item('sooner', '2026-06-10'));

    expect(cache.items.value.map((entry) => entry.id)).toEqual(['sooner', 'later']);
  });
});
