import { MarketDataCacheService } from '../../utils/services/market-data/MarketDataCacheService';

describe('MarketDataCacheService', () => {
  let cacheService: MarketDataCacheService;

  beforeEach(() => {
    cacheService = new MarketDataCacheService();
  });

  afterEach(() => {
    cacheService.destroy();
  });

  describe('get() method', () => {
    it('should return cached value for valid entry', () => {
      const symbol = 'AAPL';
      const value = 5.25;
      
      cacheService.set(symbol, value);
      const result = cacheService.get(symbol);
      
      expect(result).toBe(value);
    });

    it('should return undefined for non-existent symbol', () => {
      const result = cacheService.get('NONEXISTENT');
      expect(result).toBeUndefined();
    });

    it('should return undefined and remove expired entry', () => {
      const symbol = 'AAPL';
      const value = 5.25;
      
      // Set entry with old timestamp to simulate expiration
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      (cacheService as any).percentageCache.set(symbol, { 
        value, 
        timestamp: oldTimestamp 
      });
      
      // Verify entry exists before get
      expect((cacheService as any).percentageCache.has(symbol)).toBe(true);
      
      // Get should return undefined and remove expired entry
      const result = cacheService.get(symbol);
      expect(result).toBeUndefined();
      
      // Verify entry was removed
      expect((cacheService as any).percentageCache.has(symbol)).toBe(false);
    });

    it('should handle edge case of exactly expired entry', () => {
      const symbol = 'AAPL';
      const value = 5.25;
      
      // Set entry with timestamp exactly at TTL boundary
      const exactExpiryTimestamp = Date.now() - (5 * 60 * 1000); // Exactly 5 minutes ago
      (cacheService as any).percentageCache.set(symbol, { 
        value, 
        timestamp: exactExpiryTimestamp 
      });
      
      const result = cacheService.get(symbol);
      expect(result).toBeUndefined();
      expect((cacheService as any).percentageCache.has(symbol)).toBe(false);
    });
  });

  describe('set() method', () => {
    it('should store new entry with current timestamp', () => {
      const symbol = 'AAPL';
      const value = 5.25;
      
      cacheService.set(symbol, value);
      
      const entry = (cacheService as any).percentageCache.get(symbol);
      expect(entry.value).toBe(value);
      expect(entry.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should overwrite existing entry', () => {
      const symbol = 'AAPL';
      const oldValue = 5.25;
      const newValue = 7.50;
      
      cacheService.set(symbol, oldValue);
      cacheService.set(symbol, newValue);
      
      const result = cacheService.get(symbol);
      expect(result).toBe(newValue);
    });
  });

  describe('clear() method', () => {
    it('should remove all entries', () => {
      cacheService.set('AAPL', 5.25);
      cacheService.set('GOOGL', 3.75);
      
      expect((cacheService as any).percentageCache.size).toBe(2);
      
      cacheService.clear();
      
      expect((cacheService as any).percentageCache.size).toBe(0);
    });
  });

  describe('invalidate() method', () => {
    it('should remove specific symbol', () => {
      cacheService.set('AAPL', 5.25);
      cacheService.set('GOOGL', 3.75);
      
      cacheService.invalidate('AAPL');
      
      expect(cacheService.get('AAPL')).toBeUndefined();
      expect(cacheService.get('GOOGL')).toBe(3.75);
    });

    it('should handle invalidating non-existent symbol', () => {
      expect(() => cacheService.invalidate('NONEXISTENT')).not.toThrow();
    });
  });

  describe('getStats() method', () => {
    it('should return correct stats for valid entries', () => {
      cacheService.set('AAPL', 5.25);
      cacheService.set('GOOGL', 3.75);
      
      const stats = cacheService.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain('AAPL');
      expect(stats.entries).toContain('GOOGL');
      expect(stats.expiredCount).toBe(0);
    });

    it('should count expired entries correctly', () => {
      // Add valid entry
      cacheService.set('AAPL', 5.25);
      
      // Add expired entry manually
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      (cacheService as any).percentageCache.set('EXPIRED', { 
        value: 1.0, 
        timestamp: oldTimestamp 
      });
      
      const stats = cacheService.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.expiredCount).toBe(1);
    });
  });

  describe('cleanupExpiredEntries() method', () => {
    it('should remove expired entries and return count', () => {
      // Add valid entry
      cacheService.set('AAPL', 5.25);
      
      // Add expired entries manually
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      (cacheService as any).percentageCache.set('EXPIRED1', { 
        value: 1.0, 
        timestamp: oldTimestamp 
      });
      (cacheService as any).percentageCache.set('EXPIRED2', { 
        value: 2.0, 
        timestamp: oldTimestamp 
      });
      
      expect((cacheService as any).percentageCache.size).toBe(3);
      
      const removedCount = cacheService.cleanupExpiredEntries();
      
      expect(removedCount).toBe(2);
      expect((cacheService as any).percentageCache.size).toBe(1);
      expect(cacheService.get('AAPL')).toBe(5.25);
      expect(cacheService.get('EXPIRED1')).toBeUndefined();
      expect(cacheService.get('EXPIRED2')).toBeUndefined();
    });

    it('should return 0 when no expired entries exist', () => {
      cacheService.set('AAPL', 5.25);
      cacheService.set('GOOGL', 3.75);
      
      const removedCount = cacheService.cleanupExpiredEntries();
      
      expect(removedCount).toBe(0);
      expect((cacheService as any).percentageCache.size).toBe(2);
    });
  });

  describe('destroy() method', () => {
    it('should clear cache and stop cleanup timer', () => {
      cacheService.set('AAPL', 5.25);
      cacheService.set('GOOGL', 3.75);
      
      expect((cacheService as any).percentageCache.size).toBe(2);
      expect((cacheService as any).cleanupTimer).toBeTruthy();
      
      cacheService.destroy();
      
      expect((cacheService as any).percentageCache.size).toBe(0);
      expect((cacheService as any).cleanupTimer).toBeNull();
    });

    it('should handle multiple destroy calls safely', () => {
      expect(() => {
        cacheService.destroy();
        cacheService.destroy();
      }).not.toThrow();
    });
  });

  describe('Memory leak prevention', () => {
    it('should not accumulate expired entries over multiple get calls', () => {
      const symbol = 'AAPL';
      const value = 5.25;
      
      // Set expired entry
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      (cacheService as any).percentageCache.set(symbol, { 
        value, 
        timestamp: oldTimestamp 
      });
      
      // Call get multiple times - should not accumulate entries
      for (let i = 0; i < 10; i++) {
        cacheService.get(symbol);
      }
      
      // Should only have 0 entries (expired one was removed on first get)
      expect((cacheService as any).percentageCache.size).toBe(0);
    });

    it('should handle many unique symbols without memory growth', () => {
      // Add many symbols with different expiration states
      for (let i = 0; i < 100; i++) {
        const symbol = `SYMBOL${i}`;
        const value = i;
        
        if (i % 2 === 0) {
          // Valid entry
          cacheService.set(symbol, value);
        } else {
          // Expired entry
          const oldTimestamp = Date.now() - (6 * 60 * 1000);
          (cacheService as any).percentageCache.set(symbol, { 
            value, 
            timestamp: oldTimestamp 
          });
        }
      }
      
      expect((cacheService as any).percentageCache.size).toBe(100);
      
      // Access all expired entries - should trigger cleanup
      for (let i = 1; i < 100; i += 2) {
        cacheService.get(`SYMBOL${i}`);
      }
      
      // Should only have valid entries remaining
      expect((cacheService as any).percentageCache.size).toBe(50);
    });
  });
}); 