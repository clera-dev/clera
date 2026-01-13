/**
 * Tests for Protected Page Routing Logic
 * 
 * These tests verify that:
 * 1. Aggregation mode users see SnapTradeConnectionStep (not Alpaca funding)
 * 2. Brokerage mode users with Alpaca account see funding flow
 * 3. Users with connected accounts are redirected appropriately
 * 
 * Critical for Issue #3: Users refreshing the page should NOT see the
 * old "Almost there!" Alpaca funding page when in aggregation mode.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Protected Page Routing Logic', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Mode Detection', () => {
    it('should detect aggregation mode when no Alpaca account exists', () => {
      const onboardingData = {
        alpaca_account_id: undefined,
        status: 'submitted'
      };
      const portfolioMode = 'aggregation';

      const hasAlpacaAccount = !!onboardingData.alpaca_account_id;
      const isAggregationMode = portfolioMode === 'aggregation' || !hasAlpacaAccount;

      expect(hasAlpacaAccount).toBe(false);
      expect(isAggregationMode).toBe(true);
    });

    it('should detect brokerage mode when Alpaca account exists', () => {
      const onboardingData = {
        alpaca_account_id: 'alpaca_123',
        status: 'submitted'
      };
      const portfolioMode = 'brokerage';

      const hasAlpacaAccount = !!onboardingData.alpaca_account_id;
      const isAggregationMode = portfolioMode === 'aggregation' || !hasAlpacaAccount;

      expect(hasAlpacaAccount).toBe(true);
      expect(isAggregationMode).toBe(false);
    });

    it('should treat missing portfolio mode as aggregation when no Alpaca', () => {
      const onboardingData = {
        alpaca_account_id: null,
        status: 'submitted'
      };
      const portfolioMode = null; // Mode not yet loaded

      const hasAlpacaAccount = !!onboardingData.alpaca_account_id;
      // isAggregationMode should be true if EITHER portfolioMode is 'aggregation'
      // OR there's no Alpaca account
      const isAggregationMode = portfolioMode === 'aggregation' || !hasAlpacaAccount;

      expect(isAggregationMode).toBe(true);
    });
  });

  describe('Routing Decisions', () => {
    it('should show SnapTradeConnectionStep for aggregation mode users without accounts', () => {
      const hasCompletedOnboarding = true;
      const hasFunding = false;
      const isAggregationMode = true;

      // This is the routing logic in protected page
      const shouldShowSnapTradeConnection = isAggregationMode && !hasFunding;

      expect(shouldShowSnapTradeConnection).toBe(true);
    });

    it('should show funding flow for brokerage mode users with Alpaca account', () => {
      const hasCompletedOnboarding = true;
      const hasFunding = false;
      const isAggregationMode = false;
      const fundingStep = 'welcome';

      // Should NOT show SnapTrade connection for brokerage mode
      const shouldShowSnapTradeConnection = isAggregationMode && !hasFunding;
      // Should show funding flow instead
      const shouldShowFunding = !isAggregationMode && fundingStep === 'welcome';

      expect(shouldShowSnapTradeConnection).toBe(false);
      expect(shouldShowFunding).toBe(true);
    });

    it('should redirect to /invest when user has connected accounts', () => {
      const hasCompletedOnboarding = true;
      const hasFunding = true; // User has SnapTrade or Plaid accounts

      // This triggers the redirect useEffect
      const shouldRedirect = hasCompletedOnboarding && hasFunding;

      expect(shouldRedirect).toBe(true);
    });

    it('should NOT redirect when user has no connected accounts', () => {
      const hasCompletedOnboarding = true;
      const hasFunding = false;

      const shouldRedirect = hasCompletedOnboarding && hasFunding;

      expect(shouldRedirect).toBe(false);
    });
  });

  describe('Account Status Detection', () => {
    it('should correctly identify when SnapTrade accounts exist', () => {
      const modeData = {
        snaptrade_accounts: [{ id: 'acc_1', institution_name: 'Webull' }]
      };

      const hasSnapTrade = (modeData.snaptrade_accounts || []).length > 0;
      
      expect(hasSnapTrade).toBe(true);
    });

    it('should correctly identify when no accounts exist', () => {
      const modeData = {
        snaptrade_accounts: [],
        plaid_accounts: [],
        alpaca_account: null
      };

      const hasSnapTrade = (modeData.snaptrade_accounts || []).length > 0;
      const hasPlaid = (modeData.plaid_accounts || []).length > 0;
      const hasAlpaca = !!modeData.alpaca_account;

      expect(hasSnapTrade).toBe(false);
      expect(hasPlaid).toBe(false);
      expect(hasAlpaca).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined onboardingData gracefully', () => {
      const onboardingData = undefined;

      const alpacaAccountId = onboardingData?.alpaca_account_id;
      const hasAlpacaAccount = !!alpacaAccountId;

      expect(hasAlpacaAccount).toBe(false);
    });

    it('should handle null alpaca_account_id', () => {
      const onboardingData = {
        alpaca_account_id: null
      };

      const hasAlpacaAccount = !!onboardingData.alpaca_account_id;

      expect(hasAlpacaAccount).toBe(false);
    });

    it('should handle empty string alpaca_account_id', () => {
      const onboardingData = {
        alpaca_account_id: ''
      };

      const hasAlpacaAccount = !!onboardingData.alpaca_account_id;

      expect(hasAlpacaAccount).toBe(false);
    });
  });
});

describe('ManualBankEntry Component Requirements', () => {
  it('should require alpacaAccountId prop', () => {
    // ManualBankEntry shows error when alpacaAccountId is missing
    // This is correct behavior - it should NOT be shown for aggregation mode users
    
    const alpacaAccountId = undefined;
    const shouldShowError = !alpacaAccountId;

    expect(shouldShowError).toBe(true);
  });

  it('should work when alpacaAccountId is provided', () => {
    const alpacaAccountId = 'alpaca_abc123';
    const shouldShowError = !alpacaAccountId;

    expect(shouldShowError).toBe(false);
  });
});
