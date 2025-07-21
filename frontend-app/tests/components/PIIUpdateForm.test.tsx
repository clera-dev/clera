// @ts-nocheck
/**
 * Comprehensive test for PII update form functionality
 * Tests validation, change detection, and Save Changes button behavior
 */

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import '@testing-library/jest-dom';
import UpdateInformationPage from '@/app/account/update-information/page';

// Mock Next.js router
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  refresh: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn() as jest.Mock,
    getSession: jest.fn() as jest.Mock,
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn() as jest.Mock,
      })),
    })),
  })),
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => mockSupabaseClient,
}));

// Mock toast
jest.mock('react-hot-toast', () => ({
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
  Toaster: () => <div data-testid="toaster" />,
}));

type MockResponse = {
  ok: boolean;
  json: () => Promise<any>;
};

describe('PII Update Form - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Properly type global.fetch as a jest mock
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    // Mock successful authentication
    ((mockSupabaseClient.auth.getUser as any)).mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null,
    });

    ((mockSupabaseClient.auth.getSession as any)).mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    });

    // Mock account lookup
    ((mockSupabaseClient.from().select().eq().single as any)).mockResolvedValue({
      data: { alpaca_account_id: 'test-account-id' },
      error: null,
    });
  });

  test('should show validation errors for invalid input formats', async () => {
    // Mock API responses
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              email: 'test@example.com',
              phone: '(555) 123-4567',
              postal_code: '12345',
            },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              email: { updateable: true },
              phone: { updateable: true },
              postal_code: { updateable: true },
            },
          },
        }),
      } as unknown as Response);

    render(<UpdateInformationPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    // Test invalid email
    const emailInput = screen.getByDisplayValue('test@example.com');
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });

    // Test invalid phone number
    const phoneInput = screen.getByDisplayValue('(555) 123-4567');
    fireEvent.change(phoneInput, { target: { value: '123' } });

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid phone number')).toBeInTheDocument();
    });

    // Test invalid postal code
    const postalInput = screen.getByDisplayValue('12345');
    fireEvent.change(postalInput, { target: { value: 'invalid' } });

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid postal code')).toBeInTheDocument();
    });
  });

  test('should enable Save Changes button when valid changes are made', async () => {
    // Mock API responses
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              email: 'test@example.com',
              phone: '(555) 123-4567',
            },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              email: { updateable: true },
              phone: { updateable: true },
            },
          },
        }),
      } as unknown as Response);

    render(<UpdateInformationPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    // Initially Save Changes should be disabled
    const saveButton = screen.getByText('Save Changes');
    expect(saveButton).toBeDisabled();

    // Make a valid change
    const emailInput = screen.getByDisplayValue('test@example.com');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    // Save Changes should now be enabled
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  test('should format phone numbers correctly as user types', async () => {
    // Mock API responses
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: { phone: '' },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              phone: { updateable: true },
            },
          },
        }),
      } as unknown as Response);

    render(<UpdateInformationPage />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('(555) 123-4567')).toBeInTheDocument();
    });

    const phoneInput = screen.getByPlaceholderText('(555) 123-4567');

    // Type digits and expect formatting
    fireEvent.change(phoneInput, { target: { value: '5551234567' } });

    await waitFor(() => {
      expect(phoneInput).toHaveValue('(555) 123-4567');
    });
  });

  test('should format postal codes correctly', async () => {
    // Mock API responses
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: { postal_code: '' },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              postal_code: { updateable: true },
            },
          },
        }),
      } as unknown as Response);

    render(<UpdateInformationPage />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('12345 or 12345-6789')).toBeInTheDocument();
    });

    const postalInput = screen.getByPlaceholderText('12345 or 12345-6789');

    // Test 9-digit ZIP code formatting
    fireEvent.change(postalInput, { target: { value: '123456789' } });

    await waitFor(() => {
      expect(postalInput).toHaveValue('12345-6789');
    });
  });

  test('should disable Save Changes when there are validation errors', async () => {
    // Mock API responses
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: { email: 'test@example.com' },
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            contact: {
              email: { updateable: true },
            },
          },
        }),
      } as unknown as Response);

    render(<UpdateInformationPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    const emailInput = screen.getByDisplayValue('test@example.com');

    // Make an invalid change
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

    // Save Changes should be disabled due to validation error
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });
}); 