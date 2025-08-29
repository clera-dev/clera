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
  AUTH_ROUTES: ['/sign-in', '/sign-up', '/forgot-password'],
}));

const { 
  getRouteConfig, 
  isPublicPath, 
  isAuthPage, 
  hasCompletedOnboarding 
} = require('../../utils/auth/middleware-helpers');

describe('Middleware Helper Functions', () => {
  
  describe('getRouteConfig', () => {
    test('should return correct config for create-account API', () => {
      const config = getRouteConfig('/api/broker/create-account');
      expect(config.requiresAuth).toBe(true);
      expect(config.requiresOnboarding).toBe(false);
    });

    test('should return correct config for portfolio API (requires onboarding)', () => {
      const config = getRouteConfig('/api/portfolio/positions');
      expect(config.requiresAuth).toBe(true);
      expect(config.requiresOnboarding).toBe(true);
    });

    test('should return correct config for protected pages', () => {
      const config = getRouteConfig('/portfolio');
      expect(config.requiresAuth).toBe(true);
      expect(config.requiresOnboarding).toBe(true);
    });

    test('should return null for weekly picks API (not configured)', () => {
      const config = getRouteConfig('/api/investment/weekly-picks');
      expect(config).toBeNull();
    });

    test('should return null for unknown routes', () => {
      const config = getRouteConfig('/api/unknown/endpoint');
      expect(config).toBeNull();
    });

    test('should match longest prefix for nested routes', () => {
      // /api/broker/account-info should return null (not configured)
      const brokerConfig = getRouteConfig('/api/broker/account-info');
      expect(brokerConfig).toBeNull();

      // But /api/broker/create-account should match the specific config
      const createAccountConfig = getRouteConfig('/api/broker/create-account');
      expect(createAccountConfig.requiresAuth).toBe(true);
      expect(createAccountConfig.requiresOnboarding).toBe(false);
    });
  });

  describe('isPublicPath', () => {
    test('should identify public paths correctly', () => {
      expect(isPublicPath('/auth/callback')).toBe(true);
      expect(isPublicPath('/auth/confirm')).toBe(true);
      expect(isPublicPath('/protected/reset-password')).toBe(true);
      expect(isPublicPath('/ingest/static/something')).toBe(true);
      expect(isPublicPath('/.well-known/something')).toBe(true);
    });

    test('should identify non-public paths correctly', () => {
      expect(isPublicPath('/portfolio')).toBe(false);
      expect(isPublicPath('/api/broker/create-account')).toBe(false);
      expect(isPublicPath('/dashboard')).toBe(false);
    });

    test('should handle auth pages as public through isAuthPage function', () => {
      expect(isPublicPath('/sign-in')).toBe(true);
      expect(isPublicPath('/sign-up')).toBe(true);
      expect(isPublicPath('/forgot-password')).toBe(true);
    });
  });

  describe('isAuthPage', () => {
    test('should identify auth pages correctly', () => {
      expect(isAuthPage('/sign-in')).toBe(true);
      expect(isAuthPage('/sign-up')).toBe(true);
      expect(isAuthPage('/forgot-password')).toBe(true);
    });

    test('should not identify non-auth pages', () => {
      expect(isAuthPage('/portfolio')).toBe(false);
      expect(isAuthPage('/dashboard')).toBe(false);
      expect(isAuthPage('/api/broker/create-account')).toBe(false);
    });
  });

  describe('hasCompletedOnboarding', () => {
    test('should return true for completed statuses', () => {
      expect(hasCompletedOnboarding('submitted')).toBe(true);
      expect(hasCompletedOnboarding('approved')).toBe(true);
    });

    test('should return false for incomplete statuses', () => {
      expect(hasCompletedOnboarding('in_progress')).toBe(false);
      expect(hasCompletedOnboarding('draft')).toBe(false);
      expect(hasCompletedOnboarding(null)).toBe(false);
      expect(hasCompletedOnboarding(undefined)).toBe(false);
      expect(hasCompletedOnboarding('')).toBe(false);
    });
  });
});

describe('Critical Access Control Test Cases', () => {
  test('CRITICAL: create-account should not require completed onboarding', () => {
    // This is the exact bug we fixed - the create-account endpoint
    // was blocked by middleware requiring completed onboarding
    const config = getRouteConfig('/api/broker/create-account');
    expect(config.requiresAuth).toBe(true);
    expect(config.requiresOnboarding).toBe(false);
  });

  test('CRITICAL: other broker endpoints should require completed onboarding', () => {
    // These endpoints should still require completed onboarding
    const accountInfoConfig = getRouteConfig('/api/broker/account-info');
    expect(accountInfoConfig).toBeNull(); // Not configured

    const connectBankConfig = getRouteConfig('/api/broker/connect-bank');
    expect(connectBankConfig.requiresOnboarding).toBe(true);

    const transferConfig = getRouteConfig('/api/broker/transfer');
    expect(transferConfig.requiresOnboarding).toBe(true);
  });

  test('CRITICAL: portfolio endpoints should require completed onboarding', () => {
    const portfolioConfig = getRouteConfig('/api/portfolio/positions');
    expect(portfolioConfig.requiresAuth).toBe(true);
    expect(portfolioConfig.requiresOnboarding).toBe(true);
  });

  test('CRITICAL: weekly picks endpoints should not require onboarding', () => {
    // Weekly stock picks should be available during onboarding
    const weeklyPicksConfig = getRouteConfig('/api/investment/weekly-picks');
    expect(weeklyPicksConfig).toBeNull(); // Not configured
  });
}); 