'use client';

export const META_ADS_CACHE_PREFIX = 'meta_ads_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 5;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function buildMetaAdsCacheKey(
  type: string,
  ...parts: Array<string | number | null | undefined>
): string {
  const keyParts = [META_ADS_CACHE_PREFIX, type, ...parts.filter(Boolean).map(String)];
  return keyParts.join('_');
}

export function removeCachedData(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export function removeCacheByPrefix(prefix: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore
  }
}

function getAllCacheKeys(prefix: string): string[] {
  if (typeof window === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

function cleanupOldCacheEntries(prefix: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = getAllCacheKeys(prefix);
    const entries: { key: string; timestamp: number }[] = [];

    for (const key of keys) {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) continue;
        const parsed: CacheEntry<unknown> = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;

        if (age > CACHE_TTL_MS) {
          localStorage.removeItem(key);
        } else {
          entries.push({ key, timestamp: parsed.timestamp });
        }
      } catch {
        localStorage.removeItem(key);
      }
    }

    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => b.timestamp - a.timestamp);
      const toRemove = entries.slice(MAX_CACHE_ENTRIES);
      toRemove.forEach((entry) => localStorage.removeItem(entry.key));
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed: CacheEntry<T> = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T, prefix?: string): void {
  if (typeof window === 'undefined') return;
  try {
    cleanupOldCacheEntries(prefix || META_ADS_CACHE_PREFIX);
    const cacheEntry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheEntry));
  } catch {
    try {
      cleanupOldCacheEntries(prefix || META_ADS_CACHE_PREFIX);
    } catch {
      // Ignore
    }
  }
}
