
import { ProcessedDataItem } from "./types";

interface CacheEntry {
  value: number;
  timestamp: number;
}

export class MarketDataCacheService {
  private percentageCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  public get(symbol: string): number | undefined {
    const cached = this.percentageCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.value;
    }
    return undefined;
  }

  public set(symbol: string, value: number): void {
    this.percentageCache.set(symbol, { value, timestamp: Date.now() });
  }

  public clear(): void {
    this.percentageCache.clear();
  }

  public invalidate(symbol: string): void {
    this.percentageCache.delete(symbol);
  }

  public getStats(): { size: number; entries: string[] } {
    return {
      size: this.percentageCache.size,
      entries: Array.from(this.percentageCache.keys())
    };
  }
}
