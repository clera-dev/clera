import { renderHook, waitFor } from '@testing-library/react';
import { useUserOnboardingStatus } from '../useUserOnboardingStatus';
import { createClient } from '@/utils/supabase/client';

// Mock the Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn()
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('useUserOnboardingStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return loading state initially', () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn()
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should skip auth check when skipAuthCheck is true', () => {
    const { result } = renderHook(() => useUserOnboardingStatus({ skipAuthCheck: true }));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should fetch user onboarding status successfully', async () => {
    const mockUser = { id: 'user-123' };
    const mockOnboardingData = { status: 'completed' };
    
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockOnboardingData,
              error: null
            })
          })
        })
      })
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.error).toBe(null);
    expect(mockSupabase.auth.getUser).toHaveBeenCalled();
  });

  it('should handle user not found', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null
        })
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should handle auth session missing gracefully', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Auth session missing!' }
        })
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null); // Should not set error for missing auth session
  });

  it('should handle invalid JWT gracefully', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid JWT' }
        })
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null); // Should not set error for invalid JWT
  });

  it('should handle JWT expired gracefully', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired' }
        })
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null); // Should not set error for expired JWT
  });

  it('should handle other authentication errors as actual errors', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Authentication failed' }
        })
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe('Failed to get user: Authentication failed');
  });

  it('should handle onboarding data not found (new user)', async () => {
    const mockUser = { id: 'user-123' };
    
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' }
            })
          })
        })
      })
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should handle onboarding fetch error', async () => {
    const mockUser = { id: 'user-123' };
    
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST500', message: 'Database error' }
            })
          })
        })
      })
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe('Failed to fetch onboarding status: Database error');
  });

  it('should handle unexpected errors', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockRejectedValue(new Error('Network error'))
      }
    };
    mockCreateClient.mockReturnValue(mockSupabase as any);

    const { result } = renderHook(() => useUserOnboardingStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe(null);
    expect(result.current.error).toBe('Network error');
  });
}); 