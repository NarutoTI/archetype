import { computed, shallowRef, triggerRef } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/utils/logger';

/**
 * Generic year-bucketed cache for domain stores.
 *
 * Owns the mechanics that every "entities per year" store repeats:
 * - in-memory `Map<year, T[]>` with manual `triggerRef` notifications;
 * - persistence of each year bucket plus a years index in Preferences,
 *   scoped per user (or any scope returned by `getScope`);
 * - local mutations (`upsertItem`, `removeItem`, `replaceAll`) that keep
 *   memory and disk in sync;
 * - in-flight dedupe for network fetches (`fetchYear`).
 *
 * It deliberately does NOT own network/loading semantics (isLoading, silent
 * refresh policy) nor domain rules — those stay in the domain store. Views
 * should never consume this directly; expose state through the store.
 */
export interface EntityYearCacheOptions<T> {
  /** Prefix for Preferences keys (e.g. 'starter-tasks-cache'). */
  cachePrefix: string;
  /** Cache scope, evaluated at read/write time (e.g. current user id). */
  getScope: () => string;
  /** Year bucket an item belongs to. */
  getItemYear: (item: T) => number;
  /** Stable identity used by upsertItem/removeItem. */
  getItemId: (item: T) => string;
  /** Sort applied inside each year bucket (optional). */
  compareItems?: (a: T, b: T) => number;
  /** Override the Preferences key layout. Default: `${prefix}:${scope}:${suffix}`. */
  buildCacheKey?: (cachePrefix: string, scope: string, suffix: number | string) => string;
}

const YEARS_INDEX_SUFFIX = 'years';

export function useEntityYearCache<T>(options: EntityYearCacheOptions<T>) {
  const buildKey = options.buildCacheKey
    ?? ((prefix: string, scope: string, suffix: number | string) => `${prefix}:${scope}:${suffix}`);

  // shallowRef on purpose: buckets are mutated in place and consumers are
  // notified via triggerRef — no deep reactivity over every cached item.
  const yearCache = shallowRef<Map<number, T[]>>(new Map());
  const inFlightFetches = new Map<number, Promise<T[]>>();

  const loadedYears = computed(() => [...yearCache.value.keys()].sort((a, b) => a - b));

  // Buckets concatenated in ascending year order, each bucket sorted by
  // `compareItems`. When the comparator aligns with the year partition
  // (e.g. sorting by a date whose year defines the bucket), this is already
  // a globally sorted list.
  const items = computed(() =>
    loadedYears.value.flatMap((year) => yearCache.value.get(year) || []),
  );

  const cacheKey = (suffix: number | string) =>
    buildKey(options.cachePrefix, options.getScope(), suffix);

  const sortBucket = (bucket: T[]) => {
    if (options.compareItems) bucket.sort(options.compareItems);
    return bucket;
  };

  const saveYearsIndexToStorage = async () => {
    await Preferences.set({
      key: cacheKey(YEARS_INDEX_SUFFIX),
      value: JSON.stringify(loadedYears.value),
    });
  };

  const loadYearsIndexFromStorage = async (): Promise<number[]> => {
    try {
      const { value } = await Preferences.get({ key: cacheKey(YEARS_INDEX_SUFFIX) });
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((year) => Number.isInteger(year))
        : [];
    } catch (error) {
      logger.error(`${options.cachePrefix}: failed to load cached years index`, error);
      return [];
    }
  };

  // Writes a single year entry without touching the years index. Multi-year
  // operations persist years in parallel and write the index once at the end.
  const persistYearToStorage = async (year: number) => {
    const bucket = yearCache.value.get(year) || [];
    if (bucket.length) {
      await Preferences.set({ key: cacheKey(year), value: JSON.stringify(bucket) });
    } else {
      await Preferences.remove({ key: cacheKey(year) });
    }
  };

  const persistYears = async (years: Iterable<number>) => {
    await Promise.all([...years].map((year) => persistYearToStorage(year)));
    await saveYearsIndexToStorage();
  };

  const loadYearFromStorage = async (year: number): Promise<T[] | null> => {
    try {
      const { value } = await Preferences.get({ key: cacheKey(year) });
      if (!value) return null;
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch (error) {
      logger.error(`${options.cachePrefix}: failed to load cache for year ${year}`, error);
      return null;
    }
  };

  const hasYear = (year: number) => yearCache.value.has(year);

  const getYear = (year: number): T[] => yearCache.value.get(year) || [];

  const setYear = async (year: number, bucket: T[], { persist = true } = {}) => {
    yearCache.value.set(year, sortBucket([...bucket]));
    triggerRef(yearCache);
    if (persist) await persistYears([year]);
  };

  /** Restores the years index and every cached bucket. Returns true when anything was restored. */
  const initializeFromStorage = async (): Promise<boolean> => {
    const cachedYears = await loadYearsIndexFromStorage();
    if (!cachedYears.length) return false;

    const entries = await Promise.all(
      cachedYears.map(async (year) => [year, await loadYearFromStorage(year)] as const),
    );

    let restored = false;
    for (const [year, bucket] of entries) {
      if (bucket?.length) {
        yearCache.value.set(year, bucket);
        restored = true;
      }
    }

    if (restored) triggerRef(yearCache);
    return restored;
  };

  /** Replaces the whole cache (memory + disk), removing stale persisted years. */
  const replaceAll = async (allItems: T[]) => {
    const previousYears = loadedYears.value;

    const grouped = new Map<number, T[]>();
    for (const item of allItems) {
      const year = options.getItemYear(item);
      if (!Number.isInteger(year)) continue;
      const bucket = grouped.get(year) || [];
      bucket.push(item);
      grouped.set(year, bucket);
    }
    for (const bucket of grouped.values()) sortBucket(bucket);

    yearCache.value = grouped;
    triggerRef(yearCache);

    const nextYears = loadedYears.value;
    const removedYears = previousYears.filter((year) => !nextYears.includes(year));
    await Promise.all([
      ...nextYears.map((year) => persistYearToStorage(year)),
      ...removedYears.map((year) => Preferences.remove({ key: cacheKey(year) })),
    ]);
    await saveYearsIndexToStorage();
  };

  /**
   * Inserts or moves an item to the bucket of its current year.
   * Covers both "add" (no previous occurrence) and "update" (removes the old
   * occurrence from any bucket, including year changes).
   */
  const upsertItem = async (item: T) => {
    const id = options.getItemId(item);
    const targetYear = options.getItemYear(item);
    const touchedYears = new Set<number>([targetYear]);

    for (const [year, bucket] of yearCache.value.entries()) {
      if (!bucket.some((existing) => options.getItemId(existing) === id)) continue;
      touchedYears.add(year);
      const nextBucket = bucket.filter((existing) => options.getItemId(existing) !== id);
      if (nextBucket.length) {
        yearCache.value.set(year, nextBucket);
      } else {
        yearCache.value.delete(year);
      }
    }

    yearCache.value.set(targetYear, sortBucket([...getYear(targetYear), item]));
    triggerRef(yearCache);
    await persistYears(touchedYears);
  };

  const removeItem = async (id: string) => {
    const touchedYears: number[] = [];
    for (const [year, bucket] of yearCache.value.entries()) {
      if (!bucket.some((item) => options.getItemId(item) === id)) continue;
      const nextBucket = bucket.filter((item) => options.getItemId(item) !== id);
      if (nextBucket.length) {
        yearCache.value.set(year, nextBucket);
      } else {
        yearCache.value.delete(year);
      }
      touchedYears.push(year);
    }

    if (touchedYears.length) {
      triggerRef(yearCache);
      await persistYears(touchedYears);
    }
  };

  /**
   * Fetches a year through `fetcher`, deduping concurrent callers: the second
   * caller for the same year awaits the same promise. On success the bucket
   * is stored and persisted.
   */
  const fetchYear = (year: number, fetcher: () => Promise<T[]>): Promise<T[]> => {
    const pending = inFlightFetches.get(year);
    if (pending) return pending;

    const fetchPromise = (async () => {
      try {
        const data = await fetcher();
        await setYear(year, data);
        return data;
      } finally {
        inFlightFetches.delete(year);
      }
    })();

    inFlightFetches.set(year, fetchPromise);
    return fetchPromise;
  };

  /** Clears memory and (by default) every persisted bucket plus the index. */
  const clear = async ({ removePersisted = true } = {}) => {
    const years = loadedYears.value;
    yearCache.value.clear();
    triggerRef(yearCache);
    if (removePersisted) {
      await Promise.all(years.map((year) => Preferences.remove({ key: cacheKey(year) })));
      await Preferences.remove({ key: cacheKey(YEARS_INDEX_SUFFIX) });
    }
  };

  return {
    yearCache,
    loadedYears,
    items,
    hasYear,
    getYear,
    setYear,
    loadYearFromStorage,
    initializeFromStorage,
    replaceAll,
    upsertItem,
    removeItem,
    fetchYear,
    clear,
  };
}
