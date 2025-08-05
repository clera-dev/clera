


interface CacheEntry {
  value: number;
  timestamp: number;
}

export class MarketDataCacheService {
  private percentageCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startPeriodicCleanup();
  }

  public get(symbol: string): number | undefined {
    const cached = this.percentageCache.get(symbol);
    
    if (!cached) {
      return undefined;
    }

    const isExpired = (Date.now() - cached.timestamp) >= this.CACHE_TTL;
    
    if (isExpired) {
      // Remove expired entry to prevent memory leak
      this.percentageCache.delete(symbol);
      return undefined;
    }

    return cached.value;
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

  public getStats(): { size: number; entries: string[]; expiredCount: number } {
    const now = Date.now();
    let expiredCount = 0;
    
    // Count expired entries using Array.from for compatibility
    const entries = Array.from(this.percentageCache.values());
    for (const entry of entries) {
      if ((now - entry.timestamp) >= this.CACHE_TTL) {
        expiredCount++;
      }
    }

    return {
      size: this.percentageCache.size,
      entries: Array.from(this.percentageCache.keys()),
      expiredCount
    };
  }

  /**
   * Manually trigger cleanup of expired entries
   * Useful for testing and manual maintenance
   */
  public cleanupExpiredEntries(): number {
    const now = Date.now();
    let removedCount = 0;
    
    // Use Array.from for compatibility with older TypeScript targets
    const entries = Array.from(this.percentageCache.entries());
    for (const [symbol, entry] of entries) {
      if ((now - entry.timestamp) >= this.CACHE_TTL) {
        this.percentageCache.delete(symbol);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Start periodic cleanup to prevent memory leaks
   * Runs every 10 minutes to clean up expired entries
   */
  private startPeriodicCleanup(): void {
    if (typeof window !== 'undefined') {
      // Browser environment - use setInterval
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredEntries();
      }, this.CLEANUP_INTERVAL);
    } else {
      // Node.js environment - use setInterval
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredEntries();
      }, this.CLEANUP_INTERVAL);
    }
  }

  /**
   * Stop periodic cleanup
   * Should be called when the service is no longer needed
   */
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}
