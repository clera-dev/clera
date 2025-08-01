import { MarketDataCacheService } from '../../utils/services/market-data/MarketDataCacheService';

describe('MarketDataCacheService Integration', () => {
  let cacheService: MarketDataCacheService;

  beforeEach(() => {
    cacheService = new MarketDataCacheService();
  });

  afterEach(() => {
    cacheService.destroy();
  });

  describe('Memory leak prevention in real-world scenarios', () => {
    it('should handle high-frequency symbol access without memory growth', () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'NFLX'];
      
      // Simulate real-world usage: cache many symbols, some expire
      for (let i = 0; i < 100; i++) {
        const symbol = symbols[i % symbols.length];
        const value = Math.random() * 10;
        
        if (i % 3 === 0) {
          // Set expired entry manually to simulate real-world scenario
          const oldTimestamp = Date.now() - (6 * 60 * 1000);
          (cacheService as any).percentageCache.set(symbol, { 
            value, 
            timestamp: oldTimestamp 
          });
        } else {
          cacheService.set(symbol, value);
        }
      }

      const initialSize = (cacheService as any).percentageCache.size;
      expect(initialSize).toBeGreaterThan(0);

      // Simulate user accessing symbols (some expired, some valid)
      for (let i = 0; i < 50; i++) {
        const symbol = symbols[i % symbols.length];
        cacheService.get(symbol);
      }

      // After accessing expired entries, they should be cleaned up
      const finalSize = (cacheService as any).percentageCache.size;
      expect(finalSize).toBeLessThan(initialSize);
    });

    it('should maintain performance with large cache sizes', () => {
      const startTime = Date.now();
      
      // Add many symbols quickly
      for (let i = 0; i < 1000; i++) {
        cacheService.set(`SYMBOL${i}`, Math.random() * 100);
      }
      
      const setTime = Date.now() - startTime;
      expect(setTime).toBeLessThan(1000); // Should complete in under 1 second
      
      // Access symbols quickly
      const accessStartTime = Date.now();
      for (let i = 0; i < 100; i++) {
        cacheService.get(`SYMBOL${i}`);
      }
      
      const accessTime = Date.now() - accessStartTime;
      expect(accessTime).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle cleanup during active usage', () => {
      // Add mix of valid and expired entries
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          cacheService.set(`SYMBOL${i}`, i);
        } else {
          // Add expired entry
          const oldTimestamp = Date.now() - (6 * 60 * 1000);
          (cacheService as any).percentageCache.set(`SYMBOL${i}`, { 
            value: i, 
            timestamp: oldTimestamp 
          });
        }
      }

      const beforeCleanup = cacheService.getStats();
      expect(beforeCleanup.size).toBe(50);
      expect(beforeCleanup.expiredCount).toBe(25);

      // Trigger manual cleanup
      const removedCount = cacheService.cleanupExpiredEntries();
      expect(removedCount).toBe(25);

      const afterCleanup = cacheService.getStats();
      expect(afterCleanup.size).toBe(25);
      expect(afterCleanup.expiredCount).toBe(0);
    });

    it('should handle concurrent access patterns', () => {
      // Simulate concurrent read/write operations
      const operations = [];
      
      // Add symbols
      for (let i = 0; i < 20; i++) {
        operations.push(() => cacheService.set(`SYMBOL${i}`, i));
      }
      
      // Read symbols (some will be expired)
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          // Make some entries expired
          const oldTimestamp = Date.now() - (6 * 60 * 1000);
          (cacheService as any).percentageCache.set(`SYMBOL${i}`, { 
            value: i, 
            timestamp: oldTimestamp 
          });
        }
        operations.push(() => cacheService.get(`SYMBOL${i}`));
      }
      
      // Execute operations
      operations.forEach(op => op());
      
      // Verify cache is in consistent state
      const stats = cacheService.getStats();
      expect(stats.size).toBeLessThanOrEqual(20);
      expect(stats.expiredCount).toBeLessThanOrEqual(20);
    });
  });

  describe('Resource management', () => {
    it('should properly clean up timers on destroy', () => {
      expect((cacheService as any).cleanupTimer).toBeTruthy();
      
      cacheService.destroy();
      
      expect((cacheService as any).cleanupTimer).toBeNull();
      expect((cacheService as any).percentageCache.size).toBe(0);
    });

    it('should handle multiple destroy calls safely', () => {
      cacheService.set('AAPL', 5.25);
      expect((cacheService as any).percentageCache.size).toBe(1);
      
      cacheService.destroy();
      expect((cacheService as any).percentageCache.size).toBe(0);
      
      // Second destroy should not throw
      expect(() => cacheService.destroy()).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty cache operations', () => {
      expect(cacheService.get('NONEXISTENT')).toBeUndefined();
      expect(cacheService.cleanupExpiredEntries()).toBe(0);
      
      const stats = cacheService.getStats();
      expect(stats.size).toBe(0);
      expect(stats.expiredCount).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it('should handle very large values', () => {
      const largeValue = Number.MAX_SAFE_INTEGER;
      cacheService.set('LARGE', largeValue);
      
      const result = cacheService.get('LARGE');
      expect(result).toBe(largeValue);
    });

    it('should handle zero values', () => {
      cacheService.set('ZERO', 0);
      
      const result = cacheService.get('ZERO');
      expect(result).toBe(0);
    });

    it('should handle negative values', () => {
      cacheService.set('NEGATIVE', -5.25);
      
      const result = cacheService.get('NEGATIVE');
      expect(result).toBe(-5.25);
    });
  });
}); 