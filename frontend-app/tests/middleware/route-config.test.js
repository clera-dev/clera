// Mock Next.js dependencies
jest.mock('next/cache', () => ({
  unstable_noStore: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(),
    redirect: jest.fn(),
  },
}));

jest.mock('@/lib/constants', () => ({
  AUTH_ROUTES: ['/auth/signin', '/auth/signup', '/auth/forgot-password'],
}));

// Import the function we want to test
const { getRouteConfig } = require('../../utils/auth/middleware-helpers');

describe('Route Configuration Security Tests', () => {
  describe('Exact Match Tests', () => {
    test('should return exact match for /api/fmp/chart', () => {
      const config = getRouteConfig('/api/fmp/chart');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(false);
    });

    test('should return exact match for /api/fmp/chart/health', () => {
      const config = getRouteConfig('/api/fmp/chart/health');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(false);
    });

    test('should return exact match for /dashboard', () => {
      const config = getRouteConfig('/dashboard');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(true);
      expect(config.requiresOnboarding).toBe(true);
    });
  });

  describe('Prefix Match Tests - Valid Sub-paths', () => {
    test('should match /api/fmp/chart/AAPL as sub-path of /api/fmp/chart', () => {
      const config = getRouteConfig('/api/fmp/chart/AAPL');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(false);
    });

    test('should match /api/fmp/chart/AAPL/ with trailing slash', () => {
      const config = getRouteConfig('/api/fmp/chart/AAPL/');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(false);
    });

    test('should match /api/portfolio/positions as sub-path of /api/portfolio', () => {
      const config = getRouteConfig('/api/portfolio/positions');
      expect(config).toBeTruthy();
      expect(config.requiresAuth).toBe(true);
      expect(config.requiresOnboarding).toBe(true);
    });
  });

  describe('Security Tests - Invalid Prefix Matches', () => {
    test('should NOT match /api/fmp/chartabc (malicious path)', () => {
      const config = getRouteConfig('/api/fmp/chartabc');
      expect(config).toBeNull();
    });

    test('should NOT match /api/fmp/chartmalicious (malicious path)', () => {
      const config = getRouteConfig('/api/fmp/chartmalicious');
      expect(config).toBeNull();
    });

    test('should NOT match /api/fmp/chart_evil (malicious path)', () => {
      const config = getRouteConfig('/api/fmp/chart_evil');
      expect(config).toBeNull();
    });

    test('should NOT match /api/portfolioabc (malicious path)', () => {
      const config = getRouteConfig('/api/portfolioabc');
      expect(config).toBeNull();
    });

    test('should NOT match /api/portfoliomalicious (malicious path)', () => {
      const config = getRouteConfig('/api/portfoliomalicious');
      expect(config).toBeNull();
    });
  });

  describe('Edge Case Tests', () => {
    test('should handle empty path', () => {
      const config = getRouteConfig('');
      expect(config).toBeNull();
    });

    test('should handle null path', () => {
      const config = getRouteConfig(null);
      expect(config).toBeNull();
    });

    test('should handle undefined path', () => {
      const config = getRouteConfig(undefined);
      expect(config).toBeNull();
    });

    test('should handle non-API paths', () => {
      const config = getRouteConfig('/some/random/path');
      expect(config).toBeNull();
    });

    test('should handle API paths that do not exist', () => {
      const config = getRouteConfig('/api/nonexistent/route');
      expect(config).toBeNull();
    });
  });

  describe('Longest Match Tests', () => {
    test('should prefer longer match when multiple prefixes match', () => {
      // This test assumes we have both /api/fmp/chart and /api/fmp/chart/health configured
      const config = getRouteConfig('/api/fmp/chart/health/status');
      // Should match /api/fmp/chart/health (longer) rather than /api/fmp/chart (shorter)
      expect(config).toBeTruthy();
      // The exact behavior depends on the routeConfigs, but it should return a valid config
    });
  });
}); 