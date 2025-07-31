/**
 * Security Tests for ClientAuthButtons Component
 * 
 * These tests verify that the component doesn't expose sensitive session data
 * like access tokens and refresh tokens in console logs.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import ClientAuthButtons from '../ClientAuthButtons';

// Mock Next.js router
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock Supabase client
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
  }),
}));

// Mock auth storage utility
jest.mock('@/lib/utils/auth-storage', () => ({
  clearUserSpecificLocalStorage: jest.fn(),
}));

describe('ClientAuthButtons - Security', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock successful session check
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    
    // Mock auth state change listener
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Session Data Exposure Prevention', () => {
    it('should not log sensitive session data on auth state change', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
        access_token: 'sensitive-access-token-123',
        refresh_token: 'sensitive-refresh-token-456',
        expires_at: 1234567890,
        token_type: 'bearer',
      };

      render(<ClientAuthButtons />);

      // Simulate auth state change
      const authStateChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
      await authStateChangeCallback('SIGNED_IN', mockSession);

      // Verify that sensitive session data is not logged
      const logCalls = consoleSpy.mock.calls;
      
      // Check that no log contains the access token
      const hasAccessToken = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && arg.includes('sensitive-access-token-123')
        )
      );
      expect(hasAccessToken).toBe(false);

      // Check that no log contains the refresh token
      const hasRefreshToken = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && arg.includes('sensitive-refresh-token-456')
        )
      );
      expect(hasRefreshToken).toBe(false);

      // Check that no log contains the entire session object
      const hasSessionObject = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'object' && arg?.access_token
        )
      );
      expect(hasSessionObject).toBe(false);
    });

    it('should only log safe user information', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
        access_token: 'sensitive-access-token-123',
        refresh_token: 'sensitive-refresh-token-456',
      };

      render(<ClientAuthButtons />);

      // Simulate auth state change
      const authStateChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
      await authStateChangeCallback('SIGNED_IN', mockSession);

      // Verify that only safe information is logged
      const logCalls = consoleSpy.mock.calls;
      
      // Should log the event and email (safe)
      const hasSafeLogging = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && 
          (arg.includes('Auth state changed') || arg.includes('test@example.com'))
        )
      );
      expect(hasSafeLogging).toBe(true);
    });

    it('should handle unhandled auth events without exposing session data', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
        access_token: 'sensitive-access-token-123',
        refresh_token: 'sensitive-refresh-token-456',
      };

      render(<ClientAuthButtons />);

      // Simulate unhandled auth event
      const authStateChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
      await authStateChangeCallback('PASSWORD_RECOVERY', mockSession);

      // Verify that only the event type is logged, not the session
      const warnSpy = jest.mocked(console.warn);
      expect(warnSpy).toHaveBeenCalledWith('Unhandled auth event: PASSWORD_RECOVERY');
      
      // Verify that session object is not logged
      const hasSessionInWarn = warnSpy.mock.calls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'object' && arg?.access_token
        )
      );
      expect(hasSessionInWarn).toBe(false);
    });

    it('should not expose session data in error logs', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
        access_token: 'sensitive-access-token-123',
        refresh_token: 'sensitive-refresh-token-456',
      };

      render(<ClientAuthButtons />);

      // Simulate auth state change that throws an error
      const authStateChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
      
      // Mock an error in the auth event handler
      const errorSpy = jest.mocked(console.error);
      
      // Simulate error by making setUser throw
      const originalSetUser = jest.fn();
      jest.spyOn(React, 'useState').mockImplementation(() => [null, originalSetUser]);
      
      await authStateChangeCallback('SIGNED_IN', mockSession);

      // Verify that error is logged but session data is not exposed
      expect(errorSpy).toHaveBeenCalled();
      
      const hasSessionInError = errorSpy.mock.calls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'object' && arg?.access_token
        )
      );
      expect(hasSessionInError).toBe(false);
    });
  });

  describe('Session Check Security', () => {
    it('should not log sensitive data during initial session check', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
        access_token: 'sensitive-access-token-123',
        refresh_token: 'sensitive-refresh-token-456',
      };

      mockGetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      render(<ClientAuthButtons />);

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });

      // Verify that only safe information is logged
      const logCalls = consoleSpy.mock.calls;
      
      // Should log email but not tokens
      const hasEmail = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && arg.includes('test@example.com')
        )
      );
      expect(hasEmail).toBe(true);

      // Should not log tokens
      const hasTokens = logCalls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && 
          (arg.includes('sensitive-access-token') || arg.includes('sensitive-refresh-token'))
        )
      );
      expect(hasTokens).toBe(false);
    });
  });

  describe('Sign Out Security', () => {
    it('should not expose sensitive data during sign out', async () => {
      mockSignOut.mockResolvedValue({ error: null });

      render(<ClientAuthButtons />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.queryByText('Sign out')).toBeInTheDocument();
      });

      // Click sign out button
      const signOutButton = screen.getByText('Sign out');
      fireEvent.click(signOutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
      });

      // Verify that no sensitive data is logged during sign out
      const logCalls = consoleSpy.mock.calls;
      const errorCalls = jest.mocked(console.error).mock.calls;
      
      // Check that no logs contain sensitive tokens
      const hasSensitiveData = [...logCalls, ...errorCalls].some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'string' && 
          (arg.includes('access_token') || arg.includes('refresh_token'))
        )
      );
      expect(hasSensitiveData).toBe(false);
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose session data in error logs', async () => {
      const mockError = new Error('Auth error');
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: mockError,
      });

      render(<ClientAuthButtons />);

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });

      // Verify that error is logged but no session data is exposed
      const errorSpy = jest.mocked(console.error);
      expect(errorSpy).toHaveBeenCalledWith('Error checking session:', mockError);
      
      // Verify that no session object is logged
      const hasSessionObject = errorSpy.mock.calls.some((call: any[]) => 
        call.some((arg: any) => 
          typeof arg === 'object' && arg?.access_token
        )
      );
      expect(hasSessionObject).toBe(false);
    });
  });
}); 