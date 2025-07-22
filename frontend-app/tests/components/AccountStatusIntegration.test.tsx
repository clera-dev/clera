import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { formatAccountStatus, getAccountStatusColor } from '@/lib/utils/accountStatus';

// Test the utility functions
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

    test('converts SUBMITTED to human-readable text', () => {
      expect(formatAccountStatus('SUBMITTED')).toBe('Application Submitted');
    });

    test('converts REJECTED to human-readable text', () => {
      expect(formatAccountStatus('REJECTED')).toBe('Application Rejected');
    });

    test('converts ACCOUNT_BLOCKED to human-readable text', () => {
      expect(formatAccountStatus('ACCOUNT_BLOCKED')).toBe('Account Blocked');
    });

    test('handles unknown status by formatting underscores', () => {
      expect(formatAccountStatus('UNKNOWN_STATUS_TYPE')).toBe('Unknown Status Type');
    });

    test('handles null status', () => {
      expect(formatAccountStatus(null)).toBe('Unknown');
    });

    test('handles empty string', () => {
      expect(formatAccountStatus('')).toBe('Unknown');
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

    test('returns correct color for blocked status', () => {
      expect(getAccountStatusColor('ACCOUNT_BLOCKED')).toBe('bg-red-500');
    });

    test('returns correct color for restricted status', () => {
      expect(getAccountStatusColor('RESTRICTED')).toBe('bg-orange-500');
    });

    test('returns gray for unknown status', () => {
      expect(getAccountStatusColor('UNKNOWN_STATUS')).toBe('bg-gray-500');
    });

    test('returns gray for null status', () => {
      expect(getAccountStatusColor(null)).toBe('bg-gray-500');
    });

    test('is case insensitive', () => {
      expect(getAccountStatusColor('active')).toBe('bg-green-500');
      expect(getAccountStatusColor('Account_Updated')).toBe('bg-yellow-500');
    });
  });
});

// Integration test concept
describe('Account Status Integration', () => {
  test('demonstrates correct formatting flow', () => {
    // Simulate the status update flow
    const statuses = [
      'ACCOUNT_UPDATED',
      'ACTIVE', 
      'PENDING',
      'SUBMITTED',
      'REJECTED',
      'ACCOUNT_BLOCKED'
    ];

    const expectedTexts = [
      'Account Updated',
      'Active',
      'Pending Approval', 
      'Application Submitted',
      'Application Rejected',
      'Account Blocked'
    ];

    const expectedColors = [
      'bg-yellow-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-yellow-500', 
      'bg-red-500',
      'bg-red-500'
    ];

    statuses.forEach((status, index) => {
      expect(formatAccountStatus(status)).toBe(expectedTexts[index]);
      expect(getAccountStatusColor(status)).toBe(expectedColors[index]);
    });
  });
}); 