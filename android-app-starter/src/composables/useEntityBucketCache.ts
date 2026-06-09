import { computed, shallowRef, triggerRef } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/utils/logger';

/**
 * Cache genérico por bucket para stores de domínio.
 *
 * Um "bucket" é qualquer chave de partição derivada do item: ano (`2026`),
 * chave composta (`'BR:2026'`), mês (`'2026-06'`) etc. Domínios particionados
 * por ano podem usar o bucket numérico padrão.
 *
 * Ele concentra a mecânica que toda store "entidades por bucket" repetiria:
 * - `Map<bucket, T[]>` em memória com notificações manuais via `triggerRef`;
 * - persistência de cada bucket e de um índice no Preferences, escopada por
 *   `getScope` (id do usuário atual, ou constante para caches globais);
 * - guarda de escopo: quando `getScope()` muda, a memória é descartada e
 *   respostas atrasadas do escopo anterior são ignoradas;
 * - mutações locais (`upsertItem`, `removeItem`, `replaceAll`) que sincronizam
 *   memória e disco;
 * - dedupe de fetches em andamento (`fetchBucket`).
 *
 * Ele não controla política de rede/loading nem regras de domínio. Isso fica
 * na store. Views também não devem consumir este composable diretamente.
 */
export interface EntityBucketCacheOptions<T, TBucket extends string | number = number> {
  /** Prefixo das chaves no Preferences (ex.: 'starter-tasks-cache'). */
  cachePrefix: string;
  /** Escopo do cache, avaliado em leitura/escrita (ex.: id do usuário atual). */
  getScope: () => string;
  /** Bucket ao qual o item pertence (ex.: ano da data). */
  getItemBucket: (item: T) => TBucket;
  /** Identidade estável usada por upsertItem/removeItem. */
  getItemId: (item: T) => string;
  /** Ordenação aplicada dentro de cada bucket (opcional). */
  compareItems?: (a: T, b: T) => number;
  /** Sobrescreve o formato das chaves. Padrão: `${prefix}:${scope}:${suffix}`. */
  buildCacheKey?: (cachePrefix: string, scope: string, suffix: TBucket | string) => string;
  /**
   * Sufixo da chave de índice. Padrão 'years' por histórico. Troque quando
   * buckets string puderem colidir com esse literal.
   */
  indexKeySuffix?: string;
}

export function useEntityBucketCache<T, TBucket extends string | number = number>(
  options: EntityBucketCacheOptions<T, TBucket>,
) {
  const buildKey = options.buildCacheKey
    ?? ((prefix: string, scope: string, suffix: TBucket | string) => `${prefix}:${scope}:${suffix}`);
  const indexSuffix = options.indexKeySuffix ?? 'years';

  // shallowRef de propósito: os buckets mudam em lugar e os consumidores são
  // notificados com triggerRef, sem reatividade profunda em cada item.
  const bucketCache = shallowRef<Map<TBucket, T[]>>(new Map());
  const inFlightFetches = new Map<TBucket, Promise<T[]>>();

  // Capturado no primeiro uso para que a ordem de criação da store não congele
  // um escopo antigo antes da autenticação terminar.
  let activeScope: string | null = null;

  /**
   * Relê o escopo. Quando ele muda, derruba memória e fetches pendentes.
   * Retorna true na troca para a store resetar flags próprias, como isLoaded.
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

  /** Escopo atual, capturado no primeiro uso. Útil para descartar async antigo. */
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

  // Buckets concatenados em ordem crescente. Quando o comparador combina com a
  // partição (ex.: ordenar por data cujo ano define o bucket), isso já produz
  // uma lista globalmente ordenada.
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
    // Buckets vazios ficam em memória como marcador "carregado, mas vazio",
    // evitando refetch na sessão. Não vale persistir isso no índice.
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

  // Escreve um bucket sem tocar no índice. Operações multi-bucket persistem
  // buckets em paralelo e gravam o índice uma vez no final.
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

  /** Restaura índice e buckets persistidos. Retorna true se algo foi restaurado. */
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

  /** Substitui o cache todo (memória + disco), removendo buckets obsoletos. */
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
   * Insere ou move um item para o bucket atual dele.
   * Cobre add e update: remove a versão antiga de qualquer bucket e grava a
   * nova no bucket correto.
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
   * Busca um bucket por `fetcher`, deduplicando chamadas concorrentes. Em caso
   * de sucesso, armazena e persiste o bucket, exceto se o escopo mudou no meio
   * do voo; nesse caso, a resposta antiga é descartada.
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
        // No mesmo escopo, o handle salvo só pode ser o nosso. Após troca de
        // escopo, o map já foi limpo e pode conter fetch novo; não toque nele.
        if (isCurrentScope(scopeAtStart)) {
          inFlightFetches.delete(bucket);
        }
      }
    })();

    inFlightFetches.set(bucket, fetchPromise);
    return fetchPromise;
  };

  /** Limpa memória e, por padrão, também buckets persistidos e índice. */
  const clear = async ({ removePersisted = true } = {}) => {
    ensureScope();
    const buckets = loadedBuckets.value;
    inFlightFetches.clear();
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
