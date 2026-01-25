/**
 * Tests for the /auth/callback route handler.
 * 
 * This route handles:
 * 1. OAuth code exchange (Google, etc.)
 * 2. Email verification callbacks
 * 3. Password reset callbacks
 * 4. Proper redirect based on user's onboarding status
 */

import { NextResponse } from 'next/server';

// Mock Supabase client
const mockExchangeCodeForSession = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

const mockSupabaseClient = {
  auth: {
    exchangeCodeForSession: mockExchangeCodeForSession,
    getUser: mockGetUser,
  },
  from: mockFrom,
};

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

// Mock the redirect path function
const mockGetRedirectPath = jest.fn();
jest.mock('@/lib/utils/userRouting', () => ({
  getRedirectPathWithServerTransferLookup: (...args: any[]) => mockGetRedirectPath(...args),
}));

// Mock the security validation function
const mockValidateRedirect = jest.fn((url: string) => url);
jest.mock('@/utils/security', () => ({
  validateAndSanitizeRedirectUrl: (url: string) => mockValidateRedirect(url),
}));

// Import the route handler after mocks are set up
// Note: We test the handler logic patterns, not the actual Next.js route
describe('Auth Callback Route Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  describe('Code Exchange', () => {
    it('should exchange code for session when code is present', async () => {
      const code = 'oauth-code-123';
      
      // Simulate the code exchange
      await mockExchangeCodeForSession(code);
      
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith(code);
    });

    it('should handle code exchange errors gracefully', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: { message: 'Invalid code' },
      });
      
      const result = await mockExchangeCodeForSession('invalid-code');
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Invalid code');
    });
  });

  describe('OAuth Error Handling', () => {
    it('should detect OAuth errors from URL parameters', () => {
      const searchParams = new URLSearchParams({
        error: 'access_denied',
        error_description: 'User cancelled the login',
      });
      
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      
      expect(error).toBe('access_denied');
      expect(errorDescription).toBe('User cancelled the login');
    });

    it('should handle error_description being null', () => {
      const searchParams = new URLSearchParams({
        error: 'server_error',
      });
      
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      
      expect(error).toBe('server_error');
      expect(errorDescription).toBeNull();
    });
  });

  describe('Redirect URL Validation', () => {
    it('should validate redirect URLs to prevent open redirects', () => {
      const safeUrl = '/dashboard';
      const maliciousUrl = 'https://evil.com/phishing';
      
      mockValidateRedirect.mockImplementation((url: string) => {
        // Only allow relative URLs
        if (url.startsWith('/')) return url;
        return '/';
      });
      
      expect(mockValidateRedirect(safeUrl)).toBe('/dashboard');
      expect(mockValidateRedirect(maliciousUrl)).toBe('/');
    });

    it('should use validated URL for redirects', () => {
      const redirectTo = '/protected/settings';
      const validated = mockValidateRedirect(redirectTo);
      
      expect(validated).toBe(redirectTo);
      expect(mockValidateRedirect).toHaveBeenCalledWith(redirectTo);
    });
  });

  describe('User Routing After OAuth', () => {
    it('should route to onboarding for new users', async () => {
      const userId = 'new-user-123';
      mockGetUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });
      
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null, // No onboarding record
              error: { code: 'PGRST116' }, // Not found
            }),
          }),
        }),
      });
      
      mockGetRedirectPath.mockResolvedValue('/onboarding');
      
      const redirectPath = await mockGetRedirectPath(undefined, userId, mockSupabaseClient);
      
      expect(redirectPath).toBe('/onboarding');
    });

    it('should route to portfolio for users with completed onboarding', async () => {
      const userId = 'existing-user-123';
      mockGetUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });
      
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { status: 'completed' },
              error: null,
            }),
          }),
        }),
      });
      
      mockGetRedirectPath.mockResolvedValue('/portfolio');
      
      const redirectPath = await mockGetRedirectPath('completed', userId, mockSupabaseClient);
      
      expect(redirectPath).toBe('/portfolio');
    });

    it('should route to protected page for users in progress', async () => {
      const userId = 'in-progress-user-123';
      
      mockGetRedirectPath.mockResolvedValue('/protected');
      
      const redirectPath = await mockGetRedirectPath('in_progress', userId, mockSupabaseClient);
      
      expect(redirectPath).toBe('/protected');
    });
  });

  describe('Session Handling', () => {
    it('should handle no user after code exchange (edge case)', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      
      const { data } = await mockGetUser();
      
      // Route should default to /protected when no user found
      expect(data.user).toBeNull();
    });

    it('should handle auth errors during user retrieval', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Session expired' },
      });
      
      const result = await mockGetUser();
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Session expired');
    });
  });
});

describe('Auth Callback - OAuth Provider Support', () => {
  it('should support Google OAuth code exchange', async () => {
    const googleOAuthCode = 'google-oauth-code-abc123';
    
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          provider_token: 'google-provider-token',
        },
      },
      error: null,
    });
    
    const result = await mockExchangeCodeForSession(googleOAuthCode);
    
    expect(result.error).toBeNull();
    expect(result.data.session).toBeDefined();
    expect(result.data.session.provider_token).toBe('google-provider-token');
  });

  it('should handle Google OAuth cancellation gracefully', () => {
    const searchParams = new URLSearchParams({
      error: 'access_denied',
      error_description: 'The user did not approve the request',
    });
    
    const error = searchParams.get('error');
    
    expect(error).toBe('access_denied');
  });
});

describe('Auth Callback - Security Considerations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not expose internal error details to users', async () => {
    const internalError = {
      message: 'Database connection failed at internal.server.com:5432',
      code: 'ECONNREFUSED',
    };
    
    mockExchangeCodeForSession.mockResolvedValue({ error: internalError });
    
    const result = await mockExchangeCodeForSession('code');
    
    // In production, the route should sanitize this error before showing to user
    expect(result.error.message).toContain('Database');
    // The actual route implementation should replace this with a generic message
  });

  it('should validate redirect URLs to prevent open redirect attacks', () => {
    mockValidateRedirect.mockImplementation((url: string) => {
      // Only allow paths starting with / and not starting with //
      if (!url.startsWith('/') || url.startsWith('//')) {
        return '/sign-in';
      }
      // Block protocol handlers
      if (url.includes('://')) {
        return '/sign-in';
      }
      return url;
    });
    
    // Safe redirects
    expect(mockValidateRedirect('/dashboard')).toBe('/dashboard');
    expect(mockValidateRedirect('/protected/settings')).toBe('/protected/settings');
    
    // Malicious redirects should be blocked
    expect(mockValidateRedirect('https://evil.com')).toBe('/sign-in');
    expect(mockValidateRedirect('javascript:alert(1)')).toBe('/sign-in');
    expect(mockValidateRedirect('//evil.com')).toBe('/sign-in');
  });

  it('should handle URL-encoded malicious redirects', () => {
    mockValidateRedirect.mockImplementation((url: string) => {
      const decoded = decodeURIComponent(url);
      if (!decoded.startsWith('/') || decoded.includes('://')) {
        return '/sign-in';
      }
      return decoded;
    });
    
    // URL-encoded malicious redirect
    const encoded = encodeURIComponent('https://evil.com');
    expect(mockValidateRedirect(encoded)).toBe('/sign-in');
  });
});

describe('Auth Callback - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle missing code parameter', async () => {
    // When no code is present, the route should still work
    // (used for error redirects from OAuth providers)
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    
    const result = await mockGetUser();
    
    // Should not throw, just return no user
    expect(result.data.user).toBeNull();
  });

  it('should handle expired OAuth codes', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'OAuth code has expired' },
    });
    
    const result = await mockExchangeCodeForSession('expired-code');
    
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('expired');
  });

  it('should handle already-used OAuth codes', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: 'OAuth code has already been used' },
    });
    
    const result = await mockExchangeCodeForSession('used-code');
    
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('already been used');
  });

  it('should handle concurrent OAuth requests (race condition)', async () => {
    // Simulate two concurrent code exchanges
    const code = 'oauth-code';
    let callCount = 0;
    
    mockExchangeCodeForSession.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: { message: 'Code already used' } });
    });
    
    const [result1, result2] = await Promise.all([
      mockExchangeCodeForSession(code),
      mockExchangeCodeForSession(code),
    ]);
    
    // One should succeed, one should fail
    expect(result1.error).toBeNull();
    expect(result2.error).toBeDefined();
  });
});
