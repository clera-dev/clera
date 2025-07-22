// Simple test for account status utilities using CommonJS
const { formatAccountStatus, getAccountStatusColor } = require('../../lib/utils/accountStatus');

describe('Account Status Utilities', () => {
  describe('formatAccountStatus', () => {
    test('converts ACCOUNT_UPDATED to human-readable text', () => {
      expect(formatAccountStatus('ACCOUNT_UPDATED')).toBe('Account Updated');
    });

    test('converts ACTIVE to human-readable text', () => {
      expect(formatAccountStatus('ACTIVE')).toBe('Active');
    });

    test('converts PENDING to human-readable text', () => {
      expect(formatAccountStatus('PENDING')).toBe('Pending Approval');
    });

    test('handles null status', () => {
      expect(formatAccountStatus(null)).toBe('Unknown');
    });

    test('is case insensitive', () => {
      expect(formatAccountStatus('active')).toBe('Active');
      expect(formatAccountStatus('Account_Updated')).toBe('Account Updated');
    });
  });

  describe('getAccountStatusColor', () => {
    test('returns correct color for active status', () => {
      expect(getAccountStatusColor('ACTIVE')).toBe('bg-green-500');
    });

    test('returns correct color for account updated status', () => {
      expect(getAccountStatusColor('ACCOUNT_UPDATED')).toBe('bg-yellow-500');
    });

    test('returns gray for null status', () => {
      expect(getAccountStatusColor(null)).toBe('bg-gray-500');
    });
  });

  describe('Integration Flow', () => {
    test('demonstrates complete status formatting workflow', () => {
      // Test the most important status that we learned about: ACCOUNT_UPDATED
      const status = 'ACCOUNT_UPDATED';
      const formattedText = formatAccountStatus(status);
      const statusColor = getAccountStatusColor(status);

      expect(formattedText).toBe('Account Updated');
      expect(statusColor).toBe('bg-yellow-500');

      // This confirms that when Alpaca sends us ACCOUNT_UPDATED,
      // users will see "Account Updated" in yellow
    });
  });
}); 