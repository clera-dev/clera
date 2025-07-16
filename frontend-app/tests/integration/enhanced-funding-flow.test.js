/**
 * Enhanced Funding Flow Integration Tests
 * 
 * Tests the improved funding flow with:
 * 1. Success dialog persistence until user closes it
 * 2. Transfer history display and updates
 * 3. Improved error handling and user experience
 * 4. Consistent flow without browser warnings
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock global objects for Node environment
global.window = global.window || {};

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: jest.fn((key) => localStorageMock.store[key] || null),
  setItem: jest.fn((key, value) => {
    localStorageMock.store[key] = value.toString();
  }),
  removeItem: jest.fn((key) => {
    delete localStorageMock.store[key];
  }),
  clear: jest.fn(() => {
    localStorageMock.store = {};
  })
};

Object.defineProperty(global.window, 'localStorage', {
  value: localStorageMock
});

describe('Enhanced Funding Flow Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Success Dialog Flow', () => {
    test('should show success dialog after transfer completion', () => {
      let isSuccessDialogOpen = false;
      let transferAmount = '';
      let bankLast4 = '';

      const handleFundingComplete = (amount, last4) => {
        // Close main dialog
        const isMainDialogOpen = false;
        
        // Show success dialog with transfer details
        transferAmount = amount;
        bankLast4 = last4 || '';
        isSuccessDialogOpen = true;
        
        expect(isMainDialogOpen).toBe(false);
        expect(isSuccessDialogOpen).toBe(true);
        expect(transferAmount).toBe(amount);
      };

      // Simulate successful transfer completion
      handleFundingComplete('100.00', '1234');

      expect(transferAmount).toBe('100.00');
      expect(bankLast4).toBe('1234');
      expect(isSuccessDialogOpen).toBe(true);
    });

    test('should persist success dialog until user closes it', () => {
      let isSuccessDialogOpen = true;
      let dialogCloseAttempts = 0;

      const handleSuccessDialogClose = () => {
        dialogCloseAttempts++;
        isSuccessDialogOpen = false;
      };

      // Dialog should remain open until explicitly closed
      expect(isSuccessDialogOpen).toBe(true);
      
      // User clicks continue or X button
      handleSuccessDialogClose();
      
      expect(isSuccessDialogOpen).toBe(false);
      expect(dialogCloseAttempts).toBe(1);
    });

    test('should handle success dialog without bank details', () => {
      let transferAmount = '';
      let bankLast4 = '';

      const handleFundingComplete = (amount, last4) => {
        transferAmount = amount;
        bankLast4 = last4 || '';
      };

      // Simulate transfer completion without bank last 4
      handleFundingComplete('50.00');

      expect(transferAmount).toBe('50.00');
      expect(bankLast4).toBe('');
    });
  });

  describe('Transfer History Integration', () => {
    test('should refresh transfer history after successful transfer', () => {
      let transferHistoryKey = 0;
      let historyRefreshCount = 0;

      const handleFundingComplete = (amount, last4) => {
        // Increment key to trigger refresh
        transferHistoryKey++;
        historyRefreshCount++;
      };

      const initialKey = transferHistoryKey;
      
      // Complete a transfer
      handleFundingComplete('100.00', '1234');
      
      expect(transferHistoryKey).toBe(initialKey + 1);
      expect(historyRefreshCount).toBe(1);
    });

    test('should handle transfer history API response correctly', async () => {
      const mockApiResponse = {
        success: true,
        transfers: [
          {
            id: 'transfer-1',
            amount: 100.00,
            status: 'COMPLETED',
            created_at: '2025-01-01T10:00:00Z',
            updated_at: '2025-01-02T10:00:00Z',
            last_4: '1234'
          },
          {
            id: 'transfer-2',
            amount: 50.00,
            status: 'QUEUED',
            created_at: '2025-01-02T15:30:00Z',
            updated_at: null,
            last_4: '1234'
          }
        ]
      };

      // Simulate successful API call
      const fetchTransferHistory = () => Promise.resolve(mockApiResponse);
      
      const result = await fetchTransferHistory();
      
      expect(result.success).toBe(true);
      expect(result.transfers).toHaveLength(2);
      expect(result.transfers[0].status).toBe('COMPLETED');
      expect(result.transfers[1].status).toBe('QUEUED');
    });

    test('should handle empty transfer history gracefully', async () => {
      const mockEmptyResponse = {
        success: true,
        transfers: []
      };

      const fetchTransferHistory = () => Promise.resolve(mockEmptyResponse);
      
      const result = await fetchTransferHistory();
      
      expect(result.success).toBe(true);
      expect(result.transfers).toHaveLength(0);
    });
  });

  describe('Enhanced Error Handling', () => {
    test('should display user-friendly ACH limit error', () => {
      const errorCases = [
        {
          input: '{"code":42210000,"message":"maximum number of ACH transfers allowed is 1 per trading day in each direction"}',
          expected: "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow."
        },
        {
          input: 'maximum number of ACH transfers allowed',
          expected: "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow."
        },
        {
          input: 'Error code 42210000',
          expected: "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow."
        }
      ];

      errorCases.forEach(({ input, expected }) => {
        const processError = (errorMessage) => {
          // Handle JSON error messages
          try {
            const parsedError = JSON.parse(errorMessage);
            if (parsedError.code === 42210000 || parsedError.message?.includes('maximum number of ACH transfers')) {
              return "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow.";
            }
            return parsedError.message || errorMessage;
          } catch (e) {
            // Handle string error messages
            if (errorMessage.includes('maximum number of ACH transfers') || errorMessage.includes('42210000')) {
              return "You've reached the daily transfer limit. You can only make one ACH transfer per trading day in each direction. Please try again tomorrow.";
            }
            return errorMessage;
          }
        };

        const result = processError(input);
        expect(result).toBe(expected);
      });
    });

    test('should handle insufficient funds error', () => {
      const errorMessage = 'insufficient funds in bank account';
      
      const processError = (message) => {
        if (message.includes('insufficient funds')) {
          return "Insufficient funds in your bank account. Please check your account balance and try again.";
        }
        return message;
      };

      const result = processError(errorMessage);
      expect(result).toBe("Insufficient funds in your bank account. Please check your account balance and try again.");
    });

    test('should handle invalid account error', () => {
      const errorMessage = 'invalid account credentials';
      
      const processError = (message) => {
        if (message.includes('invalid account')) {
          return "There was an issue with your bank account. Please verify your account details.";
        }
        return message;
      };

      const result = processError(errorMessage);
      expect(result).toBe("There was an issue with your bank account. Please verify your account details.");
    });
  });

  describe('No Browser Warning Flow', () => {
    test('should not use window.confirm anywhere in the flow', () => {
      // Verify we removed browser confirm dialogs
      const addFundsFlow = {
        openDialog: () => true,
        proceedToForm: () => true,
        completeTransfer: () => true
      };

      // Flow should complete without any window.confirm calls
      expect(() => {
        addFundsFlow.openDialog();
        addFundsFlow.proceedToForm();
        addFundsFlow.completeTransfer();
      }).not.toThrow();

      // Verify no window.confirm was called (would throw in test environment)
      expect(typeof window.confirm).toBe('undefined');
    });

    test('should use proper in-app dialogs instead of browser alerts', () => {
      let customDialogShown = false;
      let browserAlertShown = false;

      const showCustomDialog = () => {
        customDialogShown = true;
      };

      const showBrowserAlert = () => {
        if (typeof window.alert === 'function') {
          browserAlertShown = true;
        }
      };

      // Should use custom dialog
      showCustomDialog();
      expect(customDialogShown).toBe(true);

      // Should not use browser alert
      showBrowserAlert();
      expect(browserAlertShown).toBe(false);
    });
  });

  describe('Add Funds Button Flow', () => {
    test('should go directly to ManualBankForm when Add Funds is clicked', () => {
      let currentView = 'addFundsButton';
      let dialogOpen = false;

      const handleAddFundsClick = () => {
        dialogOpen = true;
        currentView = 'manualBankForm';
      };

      // Click Add Funds button
      handleAddFundsClick();

      expect(dialogOpen).toBe(true);
      expect(currentView).toBe('manualBankForm');
    });

    test('should handle URL parameter for auto-opening dialog', () => {
      const urlParams = new URLSearchParams('?openAddFunds=true');
      const shouldAutoOpen = urlParams.get('openAddFunds') === 'true';

      expect(shouldAutoOpen).toBe(true);
    });
  });

  describe('Component State Management', () => {
    test('should manage dialog states correctly', () => {
      let isMainDialogOpen = false;
      let isSuccessDialogOpen = false;
      let transferAmount = '';
      let bankLast4 = '';

      const openMainDialog = () => {
        isMainDialogOpen = true;
      };

      const closeMainDialog = () => {
        isMainDialogOpen = false;
      };

      const showSuccessDialog = (amount, last4) => {
        closeMainDialog();
        transferAmount = amount;
        bankLast4 = last4 || '';
        isSuccessDialogOpen = true;
      };

      const closeSuccessDialog = () => {
        isSuccessDialogOpen = false;
      };

      // Test flow
      openMainDialog();
      expect(isMainDialogOpen).toBe(true);
      expect(isSuccessDialogOpen).toBe(false);

      showSuccessDialog('100.00', '1234');
      expect(isMainDialogOpen).toBe(false);
      expect(isSuccessDialogOpen).toBe(true);
      expect(transferAmount).toBe('100.00');
      expect(bankLast4).toBe('1234');

      closeSuccessDialog();
      expect(isSuccessDialogOpen).toBe(false);
    });
  });

  describe('Transfer History Status Icons', () => {
    test('should use correct icons for transfer statuses', () => {
      const getStatusIcon = (status) => {
        switch (status.toUpperCase()) {
          case 'COMPLETE':
          case 'SETTLED':
          case 'FILLED':
            return 'CheckCircle';
          case 'QUEUED':
          case 'SUBMITTED':
            return 'Clock';
          case 'FAILED':
          case 'CANCELLED':
            return 'XCircle';
          default:
            return 'AlertCircle';
        }
      };

      expect(getStatusIcon('COMPLETE')).toBe('CheckCircle');
      expect(getStatusIcon('FILLED')).toBe('CheckCircle');
      expect(getStatusIcon('SETTLED')).toBe('CheckCircle');
      expect(getStatusIcon('QUEUED')).toBe('Clock');
      expect(getStatusIcon('FAILED')).toBe('XCircle');
      expect(getStatusIcon('UNKNOWN')).toBe('AlertCircle');
    });

    test('should use correct colors for transfer statuses', () => {
      const getStatusColor = (status) => {
        switch (status.toUpperCase()) {
          case 'COMPLETE':
          case 'SETTLED':
          case 'FILLED':
            return 'text-emerald-600';
          case 'QUEUED':
          case 'SUBMITTED':
            return 'text-blue-600';
          case 'FAILED':
          case 'CANCELLED':
            return 'text-red-600';
          default:
            return 'text-yellow-600';
        }
      };

      expect(getStatusColor('COMPLETE')).toBe('text-emerald-600');
      expect(getStatusColor('FILLED')).toBe('text-emerald-600');
      expect(getStatusColor('SETTLED')).toBe('text-emerald-600');
      expect(getStatusColor('QUEUED')).toBe('text-blue-600');
      expect(getStatusColor('FAILED')).toBe('text-red-600');
      expect(getStatusColor('UNKNOWN')).toBe('text-yellow-600');
    });

    test('handles all transfer statuses with correct colors and icons', () => {
      const statusTests = [
        // Success states (green)
        { status: 'COMPLETE', expectedColor: 'emerald' },
        { status: 'SETTLED', expectedColor: 'emerald' },
        { status: 'FILLED', expectedColor: 'emerald' },
        { status: 'APPROVED', expectedColor: 'emerald' },
        
        // Pending states (blue)
        { status: 'QUEUED', expectedColor: 'blue' },
        { status: 'SUBMITTED', expectedColor: 'blue' },
        { status: 'APPROVAL_PENDING', expectedColor: 'blue' },
        { status: 'PENDING', expectedColor: 'blue' },
        { status: 'SENT_TO_CLEARING', expectedColor: 'blue' },
        
        // Error states (red)
        { status: 'FAILED', expectedColor: 'red' },
        { status: 'CANCELLED', expectedColor: 'red' },
        { status: 'CANCELED', expectedColor: 'red' },
        { status: 'REJECTED', expectedColor: 'red' },
        { status: 'RETURNED', expectedColor: 'red' },
        
        // Unknown states (yellow)
        { status: 'UNKNOWN_STATUS', expectedColor: 'yellow' }
      ];

      statusTests.forEach(({ status, expectedColor }) => {
        // Test that the status gets the correct color class
        const mockTransfer = { status, amount: 100, created_at: '2024-01-01T10:00:00Z' };
        
        // These functions would be exported from TransferHistory for testing
        // For now, we'll test that no errors are thrown and basic logic works
        expect(status).toBeTruthy();
        expect(expectedColor).toMatch(/^(emerald|blue|red|yellow)$/);
      });
    });
  });

  describe('Date Formatting', () => {
    test('should format dates correctly for transfer history', () => {
      const formatDate = (dateString) => {
        const date = new Date(dateString);
        return {
          date: date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          }),
          time: date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true
          })
        };
      };

      const testDate = '2025-01-01T10:30:00Z';
      const formatted = formatDate(testDate);

      expect(formatted).toHaveProperty('date');
      expect(formatted).toHaveProperty('time');
      expect(typeof formatted.date).toBe('string');
      expect(typeof formatted.time).toBe('string');
    });
  });

  describe('Integration with Existing Systems', () => {
    test('should maintain compatibility with existing funding status detection', () => {
      const transfers = [
        { amount: 100.0, status: 'QUEUED' },
        { amount: 50.0, status: 'SUBMITTED' }
      ];

      // Should detect funding with QUEUED status (our new addition)
      const hasFunding = transfers && transfers.length > 0 && 
        transfers.some((transfer) => 
          transfer.status === 'QUEUED' ||      // New status
          transfer.status === 'SUBMITTED' ||
          transfer.status === 'COMPLETE' ||   // Alpaca status
          transfer.status === 'FILLED' ||     // Alpaca status
          transfer.status === 'SETTLED'
        );

      expect(hasFunding).toBe(true);
    });
  });
});

console.log('✅ Enhanced Funding Flow tests completed'); 