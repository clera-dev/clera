import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GoogleSignInButton, AuthDivider } from '@/components/auth/GoogleSignInButton';

// Mock the Supabase client
const mockSignInWithOAuth = jest.fn();
const mockCreateClient = jest.fn(() => ({
  auth: {
    signInWithOAuth: mockSignInWithOAuth,
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}));

// Note: window.location.origin is provided by JSDOM automatically
// In the test environment, it defaults to 'http://localhost'

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  describe('Rendering', () => {
    it('renders with "Sign in with Google" text in sign-in mode', () => {
      render(<GoogleSignInButton mode="sign-in" />);
      expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    });

    it('renders with "Sign up with Google" text in sign-up mode', () => {
      render(<GoogleSignInButton mode="sign-up" />);
      expect(screen.getByText('Sign up with Google')).toBeInTheDocument();
    });

    it('renders the Google logo SVG', () => {
      render(<GoogleSignInButton mode="sign-in" />);
      // The button should contain an SVG with the Google logo
      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<GoogleSignInButton mode="sign-in" className="custom-class" />);
      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });

    it('has type="button" to prevent form submission', () => {
      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });
  });

  describe('OAuth Flow', () => {
    it('calls signInWithOAuth with google provider on click', async () => {
      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          options: expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/callback'),
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          }),
        })
      );
    });

    it('uses the correct redirect URL ending with /auth/callback', async () => {
      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      const callArgs = mockSignInWithOAuth.mock.calls[0][0];
      expect(callArgs.options.redirectTo).toMatch(/\/auth\/callback$/);
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when clicked', async () => {
      // Make the OAuth call hang to test loading state
      mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('disables the button when loading', async () => {
      mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(button).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when OAuth fails', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        error: { message: 'OAuth provider not configured' },
      });

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('OAuth provider not configured')).toBeInTheDocument();
      });
    });

    it('displays generic error message when error has no message', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        error: {},
      });

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to initiate Google sign in')).toBeInTheDocument();
      });
    });

    it('handles unexpected errors gracefully', async () => {
      mockSignInWithOAuth.mockRejectedValue(new Error('Network error'));

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
      });
    });

    it('re-enables button after error', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        error: { message: 'OAuth error' },
      });

      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible button role', () => {
      render(<GoogleSignInButton mode="sign-in" />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('button is keyboard focusable', () => {
      render(<GoogleSignInButton mode="sign-in" />);
      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });
});

describe('AuthDivider', () => {
  it('renders the divider with "or continue with email" text', () => {
    render(<AuthDivider />);
    expect(screen.getByText('or continue with email')).toBeInTheDocument();
  });

  it('has proper visual separator elements', () => {
    const { container } = render(<AuthDivider />);
    // Should have a border element for the line
    const borderElement = container.querySelector('.border-t');
    expect(borderElement).toBeInTheDocument();
  });
});

describe('GoogleSignInButton - Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('requests offline access for refresh token support', async () => {
    render(<GoogleSignInButton mode="sign-in" />);
    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    const callArgs = mockSignInWithOAuth.mock.calls[0][0];
    expect(callArgs.options.queryParams.access_type).toBe('offline');
  });

  it('prompts for consent to ensure user acknowledges permissions', async () => {
    render(<GoogleSignInButton mode="sign-in" />);
    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    const callArgs = mockSignInWithOAuth.mock.calls[0][0];
    expect(callArgs.options.queryParams.prompt).toBe('consent');
  });

  it('does not expose sensitive data in error messages', async () => {
    mockSignInWithOAuth.mockRejectedValue(new Error('Internal server error with token: abc123'));

    render(<GoogleSignInButton mode="sign-in" />);
    const button = screen.getByRole('button');

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      // Should show generic message, not the internal error
      expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
    });
  });
});

describe('GoogleSignInButton - Integration with Sign-in/Sign-up flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('uses the same callback URL pattern for both sign-in and sign-up modes', async () => {
    const { unmount } = render(<GoogleSignInButton mode="sign-in" />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const signInCallArgs = mockSignInWithOAuth.mock.calls[0][0];
    
    // Unmount and remount with different mode
    unmount();
    jest.clearAllMocks();
    
    render(<GoogleSignInButton mode="sign-up" />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const signUpCallArgs = mockSignInWithOAuth.mock.calls[0][0];

    // Both should use the same callback URL pattern
    expect(signInCallArgs.options.redirectTo).toMatch(/\/auth\/callback$/);
    expect(signUpCallArgs.options.redirectTo).toMatch(/\/auth\/callback$/);
  });

  it('OAuth flow is the same regardless of mode (Supabase handles new vs existing users)', async () => {
    const { unmount } = render(<GoogleSignInButton mode="sign-in" />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const signInProvider = mockSignInWithOAuth.mock.calls[0][0].provider;

    // Unmount and remount with different mode
    unmount();
    jest.clearAllMocks();
    
    render(<GoogleSignInButton mode="sign-up" />);
    
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const signUpProvider = mockSignInWithOAuth.mock.calls[0][0].provider;

    // Both modes use the same provider - Supabase handles the logic
    expect(signInProvider).toBe('google');
    expect(signUpProvider).toBe('google');
  });
});
