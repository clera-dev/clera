
import { MarketDataApiService } from './market-data/MarketDataApiService';
import { MarketDataCacheService } from './market-data/MarketDataCacheService';
import { MarketDataProcessorService } from './market-data/MarketDataProcessorService';
import { MarketDateService } from './market-data/MarketDateService';

export class MarketDataService {
  private static instance: MarketDataService;

  private readonly apiService: MarketDataApiService;
  private readonly cacheService: MarketDataCacheService;
  private readonly processorService: MarketDataProcessorService;
  private readonly dateService: MarketDateService;

  private constructor() {
    this.apiService = new MarketDataApiService();
    this.cacheService = new MarketDataCacheService();
    this.processorService = new MarketDataProcessorService();
    this.dateService = new MarketDateService();
  }

  public static getInstance(clearCache = false): MarketDataService {
    if (!MarketDataService.instance) {
      MarketDataService.instance = new MarketDataService();
    }
    
    if (clearCache) {
      MarketDataService.instance.clearCache();
    }
    
    return MarketDataService.instance;
  }

  public async calculateChartBasedPercentage(symbol: string): Promise<number | undefined> {
    const cachedValue = this.cacheService.get(symbol);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    try {
      const { fromDate, toDate } = await this.dateService.calculateDateRange();
      const rawData = await this.apiService.fetchChartData(symbol, fromDate, toDate);
      
      if (!rawData || !Array.isArray(rawData)) {
        return undefined;
      }

      const processedData = await this.processorService.processChartData(rawData);
      const percentage = this.processorService.calculatePercentageFromData(processedData);

      if (percentage !== undefined) {
        this.cacheService.set(symbol, percentage);
      }

      return percentage;
    } catch (error) {
      console.warn(`Failed to calculate percentage for ${symbol}:`, error);
      return undefined;
    }
  }

  public clearCache(): void {
    this.cacheService.clear();
  }

  public invalidateSymbol(symbol: string): void {
    this.cacheService.invalidate(symbol);
  }

  public getCacheStats(): { size: number; entries: string[]; expiredCount: number } {
    return this.cacheService.getStats();
  }

  /**
   * Manually trigger cleanup of expired cache entries
   * @returns Number of expired entries that were removed
   */
  public cleanupExpiredCacheEntries(): number {
    return this.cacheService.cleanupExpiredEntries();
  }

  /**
   * Destroy the service instance and clean up resources
   * Should be called when the service is no longer needed
   */
  public static destroy(): void {
    if (MarketDataService.instance) {
      MarketDataService.instance.cacheService.destroy();
      MarketDataService.instance = null as any;
    }
  }
}
