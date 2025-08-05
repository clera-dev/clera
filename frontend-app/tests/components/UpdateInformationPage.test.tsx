import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import UpdateInformationPage from '@/app/account/update-information/page';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('UpdateInformationPage', () => {
  const mockRouter = {
    push: jest.fn(),
    back: jest.fn(),
  };

  const mockSupabaseClient = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock successful auth
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
      error: null,
    });

    // Mock onboarding data
    mockSupabaseClient.single.mockResolvedValue({
      data: {
        alpaca_account_id: 'test-account-id',
        onboarding_data: {
          given_name: 'John',
          family_name: 'Doe',
          email_address: 'john@example.com',
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders loading state initially', () => {
    render(<UpdateInformationPage />);
    
    expect(screen.getByText('Loading your information...')).toBeInTheDocument();
  });

  test('displays PII data when loaded successfully', async () => {
    // Mock successful PII fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {
            given_name: 'John',
            family_name: 'Doe',
            email_address: 'john@example.com',
            phone_number: '+1234567890',
            date_of_birth: '1990-01-01',
            street_address: '123 Main St',
            city: 'New York',
            state: 'NY',
            postal_code: '10001',
            country: 'USA',
          },
          updateable_fields: ['phone_number', 'street_address', 'city', 'postal_code'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: ['phone_number', 'street_address', 'city', 'postal_code'],
        }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
    });

    // Verify non-editable fields are disabled
    expect(screen.getByDisplayValue('John')).toBeDisabled();
    expect(screen.getByDisplayValue('john@example.com')).toBeDisabled();
  });

  test('enables save button when updateable field is modified', async () => {
    // Mock successful PII fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {
            given_name: 'John',
            family_name: 'Doe',
            phone_number: '+1234567890',
          },
          updateable_fields: ['phone_number'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: ['phone_number'],
        }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    // Initially save button should be disabled
    const saveButton = screen.getByText('Save Changes');
    expect(saveButton).toBeDisabled();

    // Modify phone number
    const phoneInput = screen.getByDisplayValue('+1234567890');
    fireEvent.change(phoneInput, { target: { value: '+1987654321' } });

    // Save button should now be enabled
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  test('successfully saves changes', async () => {
    // Mock successful PII fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {
            phone_number: '+1234567890',
          },
          updateable_fields: ['phone_number'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: ['phone_number'],
        }),
      })
      // Mock successful update
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    // Modify phone number
    const phoneInput = screen.getByDisplayValue('+1234567890');
    fireEvent.change(phoneInput, { target: { value: '+1987654321' } });

    // Click save
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Information updated successfully!')).toBeInTheDocument();
    });

    // Verify API was called with correct data
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/account/test-account-id/pii',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: '+1987654321',
        }),
      })
    );
  });

  test('handles API errors gracefully', async () => {
    // Mock failed PII fetch
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load account information. Please try again.')).toBeInTheDocument();
    });
  });

  test('handles update errors gracefully', async () => {
    // Mock successful PII fetch but failed update
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: { phone_number: '+1234567890' },
          updateable_fields: ['phone_number'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: ['phone_number'],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Update failed' }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    // Modify and try to save
    const phoneInput = screen.getByDisplayValue('+1234567890');
    fireEvent.change(phoneInput, { target: { value: '+1987654321' } });
    
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to update information. Please try again.')).toBeInTheDocument();
    });
  });

  test('navigates back to dashboard when cancel is clicked', async () => {
    // Mock successful PII fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {},
          updateable_fields: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: [],
        }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
  });

  test('validates required fields', async () => {
    // Mock successful PII fetch with updateable required field
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {
            phone_number: '+1234567890',
          },
          updateable_fields: ['phone_number'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: ['phone_number'],
        }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    // Clear required field
    const phoneInput = screen.getByDisplayValue('+1234567890');
    fireEvent.change(phoneInput, { target: { value: '' } });

    // Try to save
    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    });
  });

  test('handles authentication errors', async () => {
    // Mock auth failure
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
    });
  });

  test('handles missing account ID', async () => {
    // Mock missing alpaca account ID
    mockSupabaseClient.single.mockResolvedValue({
      data: {
        alpaca_account_id: null,
        onboarding_data: {},
      },
      error: null,
    });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByText('Account not found. Please complete onboarding first.')).toBeInTheDocument();
    });
  });

  test('displays field descriptions correctly', async () => {
    // Mock successful PII fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pii_data: {
            given_name: 'John',
            email_address: 'john@example.com',
          },
          updateable_fields: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updateable_fields: [],
        }),
      });

    render(<UpdateInformationPage />);

    await waitFor(() => {
      expect(screen.getByText('Cannot be changed after account creation')).toBeInTheDocument();
      expect(screen.getByText('Contact support if changes are needed')).toBeInTheDocument();
    });
  });
}); 