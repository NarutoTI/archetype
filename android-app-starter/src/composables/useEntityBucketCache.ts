import { computed, shallowRef, triggerRef } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/utils/logger';

/**
 * Generic bucketed cache for domain stores.
 *
 * A "bucket" is any partition key derived from the item: a year (`2026`),
 * a composed key (`'BR:2026'`), a month (`'2026-06'`), etc. Year-partitioned
 * domains simply use the default `number` bucket.
 *
 * Owns the mechanics that every "entities per bucket" store repeats:
 * - in-memory `Map<bucket, T[]>` with manual `triggerRef` notifications;
 * - persistence of each bucket plus a bucket index in Preferences, scoped by
 *   `getScope` (e.g. current user id, or a constant for global caches);
 * - scope guard: when `getScope()` changes (user switch), the in-memory cache
 *   is dropped and late fetch results from the previous scope are discarded —
 *   persisted entries are already isolated per scope by the key layout;
 * - local mutations (`upsertItem`, `removeItem`, `replaceAll`) that keep
 *   memory and disk in sync;
 * - in-flight dedupe for network fetches (`fetchBucket`).
 *
 * It deliberately does NOT own network/loading semantics (isLoading, silent
 * refresh policy) nor domain rules — those stay in the domain store. Views
 * should never consume this directly; expose state through the store.
 */
export interface EntityBucketCacheOptions<T, TBucket extends string | number = number> {
  /** Prefix for Preferences keys (e.g. 'starter-tasks-cache'). */
  cachePrefix: string;
  /** Cache scope, evaluated at read/write time (e.g. current user id). */
  getScope: () => string;
  /** Bucket an item belongs to (e.g. year of its date). */
  getItemBucket: (item: T) => TBucket;
  /** Stable identity used by upsertItem/removeItem. */
  getItemId: (item: T) => string;
  /** Sort applied inside each bucket (optional). */
  compareItems?: (a: T, b: T) => number;
  /** Override the Preferences key layout. Default: `${prefix}:${scope}:${suffix}`. */
  buildCacheKey?: (cachePrefix: string, scope: string, suffix: TBucket | string) => string;
  /**
   * Suffix of the bucket index key. Default 'years' (historical). Change it
   * when string buckets could collide with the literal value.
   */
  indexKeySuffix?: string;
}

export function useEntityBucketCache<T, TBucket extends string | number = number>(
  options: EntityBucketCacheOptions<T, TBucket>,
) {
  const buildKey = options.buildCacheKey
    ?? ((prefix: string, scope: string, suffix: TBucket | string) => `${prefix}:${scope}:${suffix}`);
  const indexSuffix = options.indexKeySuffix ?? 'years';

  // shallowRef on purpose: buckets are mutated in place and consumers are
  // notified via triggerRef — no deep reactivity over every cached item.
  const bucketCache = shallowRef<Map<TBucket, T[]>>(new Map());
  const inFlightFetches = new Map<TBucket, Promise<T[]>>();

  // Lazily captured on first use so creation order (store setup before auth
  // is resolved) does not freeze a stale scope.
  let activeScope: string | null = null;

  /**
   * Re-reads the scope; when it changed (e.g. user switch), drops the
   * in-memory cache and pending fetch handles. Returns true on change so the
   * domain store can reset its own flags (isLoaded etc.).
   */
  const ensureScope = (): boolean => {
    const scope = options.getScope();
    if (activeScope === scope) return false;

    const isFirstCapture = activeScope === null;
    activeScope = scope;
    if (isFirstCapture) return false;

    bucketCache.value = new Map();
    inFlightFetches.clear();
    triggerRef(bucketCache);
    return true;
  };

  /** Current scope (capturing it on first use). Useful to discard stale async work. */
  const currentScope = (): string => {
    ensureScope();
    return activeScope as string;
  };

  const isCurrentScope = (scopeAtStart: string): boolean => {
    if (options.getScope() !== scopeAtStart) {
      ensureScope();
      return false;
    }
    return activeScope === scopeAtStart;
  };

  const compareBuckets = (a: TBucket, b: TBucket) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));

  const loadedBuckets = computed(() => [...bucketCache.value.keys()].sort(compareBuckets));

  // Buckets concatenated in ascending bucket order, each bucket sorted by
  // `compareItems`. When the comparator aligns with the bucket partition
  // (e.g. sorting by a date whose year defines the bucket), this is already
  // a globally sorted list.
  const items = computed(() =>
    loadedBuckets.value.flatMap((bucket) => bucketCache.value.get(bucket) || []),
  );

  const cacheKey = (suffix: TBucket | string) =>
    buildKey(options.cachePrefix, options.getScope(), suffix);

  const sortBucket = (bucket: T[]) => {
    if (options.compareItems) bucket.sort(options.compareItems);
    return bucket;
  };

  const saveBucketIndexToStorage = async () => {
    // Empty buckets stay in memory as a "loaded, but empty" marker (avoids
    // refetching), but are not worth persisting in the index.
    const nonEmptyBuckets = loadedBuckets.value
      .filter((bucket) => (bucketCache.value.get(bucket) || []).length > 0);
    await Preferences.set({
      key: cacheKey(indexSuffix),
      value: JSON.stringify(nonEmptyBuckets),
    });
  };

  const loadBucketIndexFromStorage = async (): Promise<TBucket[]> => {
    try {
      const { value } = await Preferences.get({ key: cacheKey(indexSuffix) });
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((bucket): bucket is TBucket =>
          typeof bucket === 'number' ? Number.isFinite(bucket) : typeof bucket === 'string')
        : [];
    } catch (error) {
      logger.error(`${options.cachePrefix}: failed to load cached bucket index`, error);
      return [];
    }
  };

  // Writes a single bucket entry without touching the index. Multi-bucket
  // operations persist buckets in parallel and write the index once at the end.
  const persistBucketToStorage = async (bucket: TBucket) => {
    const entries = bucketCache.value.get(bucket) || [];
    if (entries.length) {
      await Preferences.set({ key: cacheKey(bucket), value: JSON.stringify(entries) });
    } else {
      await Preferences.remove({ key: cacheKey(bucket) });
    }
  };

  const persistBuckets = async (buckets: Iterable<TBucket>) => {
    await Promise.all([...buckets].map((bucket) => persistBucketToStorage(bucket)));
    await saveBucketIndexToStorage();
  };

  const loadBucketFromStorage = async (bucket: TBucket): Promise<T[] | null> => {
    ensureScope();
    try {
      const { value } = await Preferences.get({ key: cacheKey(bucket) });
      if (!value) return null;
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch (error) {
      logger.error(`${options.cachePrefix}: failed to load cache for bucket ${bucket}`, error);
      return null;
    }
  };

  const hasBucket = (bucket: TBucket) => {
    ensureScope();
    return bucketCache.value.has(bucket);
  };

  const getBucket = (bucket: TBucket): T[] => {
    ensureScope();
    return bucketCache.value.get(bucket) || [];
  };

  const setBucket = async (bucket: TBucket, entries: T[], { persist = true } = {}) => {
    ensureScope();
    bucketCache.value.set(bucket, sortBucket([...entries]));
    triggerRef(bucketCache);
    if (persist) await persistBuckets([bucket]);
  };

  /** Restores the bucket index and every cached bucket. Returns true when anything was restored. */
  const initializeFromStorage = async (): Promise<boolean> => {
    const scopeAtStart = currentScope();
    const cachedBuckets = await loadBucketIndexFromStorage();
    if (!isCurrentScope(scopeAtStart)) return false;
    if (!cachedBuckets.length) return false;

    const entries = await Promise.all(
      cachedBuckets.map(async (bucket) => [bucket, await loadBucketFromStorage(bucket)] as const),
    );
    if (!isCurrentScope(scopeAtStart)) return false;

    let restored = false;
    for (const [bucket, bucketEntries] of entries) {
      if (bucketEntries?.length) {
        bucketCache.value.set(bucket, bucketEntries);
        restored = true;
      }
    }

    if (restored) triggerRef(bucketCache);
    return restored;
  };

  /** Replaces the whole cache (memory + disk), removing stale persisted buckets. */
  const replaceAll = async (allItems: T[]) => {
    ensureScope();
    const previousBuckets = loadedBuckets.value;

    const grouped = new Map<TBucket, T[]>();
    for (const item of allItems) {
      const bucket = options.getItemBucket(item);
      const entries = grouped.get(bucket) || [];
      entries.push(item);
      grouped.set(bucket, entries);
    }
    for (const entries of grouped.values()) sortBucket(entries);

    bucketCache.value = grouped;
    triggerRef(bucketCache);

    const nextBuckets = loadedBuckets.value;
    const removedBuckets = previousBuckets.filter((bucket) => !nextBuckets.includes(bucket));
    await Promise.all([
      ...nextBuckets.map((bucket) => persistBucketToStorage(bucket)),
      ...removedBuckets.map((bucket) => Preferences.remove({ key: cacheKey(bucket) })),
    ]);
    await saveBucketIndexToStorage();
  };

  /**
   * Inserts or moves an item to the bucket it currently belongs to.
   * Covers both "add" (no previous occurrence) and "update" (removes the old
   * occurrence from any bucket, including bucket changes).
   */
  const upsertItem = async (item: T) => {
    ensureScope();
    const id = options.getItemId(item);
    const targetBucket = options.getItemBucket(item);
    const touchedBuckets = new Set<TBucket>([targetBucket]);

    for (const [bucket, entries] of bucketCache.value.entries()) {
      if (!entries.some((existing) => options.getItemId(existing) === id)) continue;
      touchedBuckets.add(bucket);
      const nextEntries = entries.filter((existing) => options.getItemId(existing) !== id);
      if (nextEntries.length) {
        bucketCache.value.set(bucket, nextEntries);
      } else {
        bucketCache.value.delete(bucket);
      }
    }

    bucketCache.value.set(targetBucket, sortBucket([...(bucketCache.value.get(targetBucket) || []), item]));
    triggerRef(bucketCache);
    await persistBuckets(touchedBuckets);
  };

  const removeItem = async (id: string) => {
    ensureScope();
    const touchedBuckets: TBucket[] = [];
    for (const [bucket, entries] of bucketCache.value.entries()) {
      if (!entries.some((item) => options.getItemId(item) === id)) continue;
      const nextEntries = entries.filter((item) => options.getItemId(item) !== id);
      if (nextEntries.length) {
        bucketCache.value.set(bucket, nextEntries);
      } else {
        bucketCache.value.delete(bucket);
      }
      touchedBuckets.push(bucket);
    }

    if (touchedBuckets.length) {
      triggerRef(bucketCache);
      await persistBuckets(touchedBuckets);
    }
  };

  /**
   * Fetches a bucket through `fetcher`, deduping concurrent callers: the
   * second caller for the same bucket awaits the same promise. On success the
   * bucket is stored and persisted — unless the scope changed meanwhile, in
   * which case the stale result is discarded.
   */
  const fetchBucket = (bucket: TBucket, fetcher: () => Promise<T[]>): Promise<T[]> => {
    const scopeAtStart = currentScope();
    const pending = inFlightFetches.get(bucket);
    if (pending) return pending;

    const fetchPromise = (async () => {
      try {
        const data = await fetcher();
        if (isCurrentScope(scopeAtStart)) {
          await setBucket(bucket, data);
        }
        return data;
      } finally {
        // Under the same scope the stored handle can only be ours (callers
        // dedupe on it). After a scope switch the map was already cleared and
        // may hold a new fetch — leave it alone.
        if (isCurrentScope(scopeAtStart)) {
          inFlightFetches.delete(bucket);
        }
      }
    })();

    inFlightFetches.set(bucket, fetchPromise);
    return fetchPromise;
  };

  /** Clears memory and (by default) every persisted bucket plus the index. */
  const clear = async ({ removePersisted = true } = {}) => {
    ensureScope();
    const buckets = loadedBuckets.value;
    bucketCache.value.clear();
    triggerRef(bucketCache);
    if (removePersisted) {
      await Promise.all(buckets.map((bucket) => Preferences.remove({ key: cacheKey(bucket) })));
      await Preferences.remove({ key: cacheKey(indexSuffix) });
    }
  };

  return {
    buckets: bucketCache,
    loadedBuckets,
    items,
    ensureScope,
    currentScope,
    hasBucket,
    getBucket,
    setBucket,
    loadBucketFromStorage,
    initializeFromStorage,
    replaceAll,
    upsertItem,
    removeItem,
    fetchBucket,
    clear,
  };
}
