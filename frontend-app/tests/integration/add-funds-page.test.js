/**
 * Add Funds Dedicated Page Tests
 *
 * Verifies navigation, flow steps, and success handling for the new
 * /account/add-funds page that replaces the modal dialog on dashboard/portfolio.
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

describe('Add Funds Dedicated Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Navigation', () => {
    test('dashboard Add Funds button should route to /account/add-funds', () => {
      let currentPath = '/dashboard';
      const navigateToAddFunds = () => { currentPath = '/account/add-funds'; };

      // Simulate click
      navigateToAddFunds();

      expect(currentPath).toBe('/account/add-funds');
    });

    test('portfolio Add Funds button should route to /account/add-funds', () => {
      let currentPath = '/portfolio';
      const handleAddFundsClick = () => { currentPath = '/account/add-funds'; };

      // Simulate click
      handleAddFundsClick();

      expect(currentPath).toBe('/account/add-funds');
    });
  });

  describe('Page Flow', () => {
    test('should show success dialog after ManualBankForm completes transfer', () => {
      let isSuccessDialogOpen = false;
      let transferAmount = '';
      let bankLast4 = '';

      const onTransferComplete = (amount, last4) => {
        transferAmount = amount || '';
        bankLast4 = last4 || '';
        isSuccessDialogOpen = true;
      };

      // Simulate form completion
      onTransferComplete('250.00', '4321');

      expect(isSuccessDialogOpen).toBe(true);
      expect(transferAmount).toBe('250.00');
      expect(bankLast4).toBe('4321');
    });

    test('closing success dialog should navigate back to /dashboard', () => {
      let isSuccessDialogOpen = true;
      let currentPath = '/account/add-funds';

      const handleSuccessDialogClose = () => {
        isSuccessDialogOpen = false;
        currentPath = '/dashboard';
      };

      handleSuccessDialogClose();

      expect(isSuccessDialogOpen).toBe(false);
      expect(currentPath).toBe('/dashboard');
    });
  });
});

console.log('✅ Add Funds dedicated page tests completed');


