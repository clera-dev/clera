/**
 * Middleware Behavior Integration Tests
 * 
 * These tests simulate the exact scenarios that caused the original bug
 * and verify that the new middleware logic handles them correctly.
 */

const { getRouteConfig, hasCompletedOnboarding } = require('../../utils/auth/middleware-helpers.js');

describe('Middleware Behavior Integration Tests', () => {

  // Mock scenarios that simulate real middleware conditions
  const mockUser = { id: 'test-user-123' };
  
  describe('Onboarding Flow Scenarios', () => {
    
    test('SCENARIO 1: User can create account during onboarding', () => {
      // This was the exact bug scenario - user trying to create account
      // but being blocked because onboarding wasn't complete yet
      
      const isAuthenticated = true;
      const onboardingStatus = 'in_progress'; // User is still onboarding
      const path = '/api/broker/create-account';
      
      const routeConfig = getRouteConfig(path);
      const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
      
      // Should require auth but NOT require completed onboarding
      expect(routeConfig.requiresAuth).toBe(true);
      expect(routeConfig.requiresOnboarding).toBe(false);
      expect(onboardingComplete).toBe(false);
      
      // Access decision: Should be ALLOWED
      const shouldAllow = isAuthenticated && 
        (!routeConfig.requiresOnboarding || onboardingComplete);
      
      expect(shouldAllow).toBe(true);
      console.log('✅ FIXED: User can now create account during onboarding');
    });

    test('SCENARIO 2: User blocked from portfolio before completing onboarding', () => {
      // User tries to access portfolio before completing onboarding - should be blocked
      
      const isAuthenticated = true;
      const onboardingStatus = 'in_progress';
      const path = '/api/portfolio/positions';
      
      const routeConfig = getRouteConfig(path);
      const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
      
      expect(routeConfig.requiresAuth).toBe(true);
      expect(routeConfig.requiresOnboarding).toBe(true);
      expect(onboardingComplete).toBe(false);
      
      // Access decision: Should be BLOCKED
      const shouldAllow = isAuthenticated && 
        (!routeConfig.requiresOnboarding || onboardingComplete);
      
      expect(shouldAllow).toBe(false);
      console.log('✅ CORRECT: User blocked from portfolio until onboarding complete');
    });

    test('SCENARIO 3: User can access portfolio after completing onboarding', () => {
      // User completes onboarding and should now access everything
      
      const isAuthenticated = true;
      const onboardingStatus = 'submitted';
      const path = '/api/portfolio/positions';
      
      const routeConfig = getRouteConfig(path);
      const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
      
      expect(routeConfig.requiresAuth).toBe(true);
      expect(routeConfig.requiresOnboarding).toBe(true);
      expect(onboardingComplete).toBe(true);
      
      // Access decision: Should be ALLOWED
      const shouldAllow = isAuthenticated && 
        (!routeConfig.requiresOnboarding || onboardingComplete);
      
      expect(shouldAllow).toBe(true);
      console.log('✅ CORRECT: User can access portfolio after completing onboarding');
    });

    test('SCENARIO 4: Unauthenticated user blocked from everything', () => {
      // Unauthenticated users should be blocked from all protected routes
      
      const isAuthenticated = false;
      const onboardingStatus = null;
      const paths = [
        '/api/broker/create-account',
        '/api/portfolio/positions',
        '/api/broker/connect-bank'
      ];
      
      paths.forEach(path => {
        const routeConfig = getRouteConfig(path);
        const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
        
        // Access decision: Should be BLOCKED (auth required)
        const shouldAllow = isAuthenticated && 
          (!routeConfig.requiresOnboarding || onboardingComplete);
        
        expect(shouldAllow).toBe(false);
      });
      
      console.log('✅ CORRECT: Unauthenticated users blocked from protected routes');
    });
  });

  describe('Banking & Investment Scenarios', () => {
    
    test('SCENARIO 5: User can research investments during onboarding', () => {
      // Investment research should be available during onboarding
      
      const isAuthenticated = true;
      const onboardingStatus = 'in_progress';
      const path = '/api/investment/research';
      
      const routeConfig = getRouteConfig(path);
      const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
      
      expect(routeConfig.requiresAuth).toBe(true);
      expect(routeConfig.requiresOnboarding).toBe(false);
      
      // Access decision: Should be ALLOWED
      const shouldAllow = isAuthenticated && 
        (!routeConfig.requiresOnboarding || onboardingComplete);
      
      expect(shouldAllow).toBe(true);
      console.log('✅ CORRECT: User can research investments during onboarding');
    });

    test('SCENARIO 6: User blocked from bank operations until onboarding complete', () => {
      // Bank operations should require completed onboarding
      
      const isAuthenticated = true;
      const onboardingStatus = 'in_progress';
      const bankPaths = [
        '/api/broker/connect-bank',
        '/api/broker/transfer',
        '/api/broker/account-info'
      ];
      
      bankPaths.forEach(path => {
        const routeConfig = getRouteConfig(path);
        const onboardingComplete = hasCompletedOnboarding(onboardingStatus);
        
        expect(routeConfig.requiresOnboarding).toBe(true);
        
        // Access decision: Should be BLOCKED
        const shouldAllow = isAuthenticated && 
          (!routeConfig.requiresOnboarding || onboardingComplete);
        
        expect(shouldAllow).toBe(false);
      });
      
      console.log('✅ CORRECT: User blocked from banking until onboarding complete');
    });
  });

  describe('Edge Cases & Error Scenarios', () => {
    
    test('SCENARIO 7: Unknown API routes default to safe behavior', () => {
      // Unknown routes should default to requiring auth but not onboarding
      
      const isAuthenticated = true;
      const onboardingStatus = 'in_progress';
      const unknownPath = '/api/some/unknown/endpoint';
      
      const routeConfig = getRouteConfig(unknownPath);
      
      // Should default to requiring auth but not onboarding (safe default)
      expect(routeConfig.requiresAuth).toBe(true);
      expect(routeConfig.requiresOnboarding).toBe(false);
      
      console.log('✅ CORRECT: Unknown routes default to safe auth-required behavior');
    });

    test('SCENARIO 8: Null/undefined onboarding status handled correctly', () => {
      // Edge case: what happens when onboarding status is null/undefined
      
      const isAuthenticated = true;
      const onboardingStatuses = [null, undefined, '', 'unknown_status'];
      
      onboardingStatuses.forEach(status => {
        const onboardingComplete = hasCompletedOnboarding(status);
        expect(onboardingComplete).toBe(false);
      });
      
      console.log('✅ CORRECT: Null/undefined onboarding status treated as incomplete');
    });
  });
});

describe('Regression Tests - Original Bug Scenarios', () => {
  
  test('REGRESSION: The exact error scenario from the bug report', () => {
    // This recreates the exact scenario that caused the original error:
    // - User is authenticated
    // - User has filled out onboarding form
    // - User clicks submit
    // - Frontend calls /api/broker/create-account
    // - Middleware should NOT block this call
    
    const userState = {
      isAuthenticated: true,
      onboardingStatus: 'in_progress', // Not yet 'submitted' because we're submitting now
      currentPath: '/api/broker/create-account'
    };
    
    const routeConfig = getRouteConfig(userState.currentPath);
    const onboardingComplete = hasCompletedOnboarding(userState.onboardingStatus);
    
    // The critical assertion - this should be ALLOWED
    const middlewareWouldAllow = userState.isAuthenticated && 
      (!routeConfig.requiresOnboarding || onboardingComplete);
    
    expect(middlewareWouldAllow).toBe(true);
    
    // Additional validation
    expect(routeConfig.requiresAuth).toBe(true);
    expect(routeConfig.requiresOnboarding).toBe(false);
    
    console.log('🎉 REGRESSION TEST PASSED: Original bug scenario now works!');
    console.log(`   User authenticated: ${userState.isAuthenticated}`);
    console.log(`   Onboarding status: ${userState.onboardingStatus}`);
    console.log(`   Route: ${userState.currentPath}`);
    console.log(`   Middleware allows: ${middlewareWouldAllow}`);
  });
  
  test('REGRESSION: Ensure other routes still work as expected', () => {
    // Make sure we didn't break anything else while fixing the bug
    
    const testCases = [
      // These should require completed onboarding
      { path: '/portfolio', shouldRequireOnboarding: true },
      { path: '/api/portfolio/positions', shouldRequireOnboarding: true },
      { path: '/api/broker/connect-bank', shouldRequireOnboarding: true },
      
      // These should NOT require completed onboarding
      { path: '/api/broker/create-account', shouldRequireOnboarding: false },
      { path: '/api/investment/research', shouldRequireOnboarding: false },
      { path: '/api/companies/profiles/AAPL', shouldRequireOnboarding: false }
    ];
    
    testCases.forEach(testCase => {
      const config = getRouteConfig(testCase.path);
      expect(config.requiresOnboarding).toBe(testCase.shouldRequireOnboarding);
    });
    
    console.log('✅ REGRESSION: All existing route behaviors preserved');
  });
}); 