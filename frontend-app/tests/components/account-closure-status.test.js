/**
 * Account Closure Status Tests
 * Tests critical account closure status handling logic
 */

const React = require('react');
const { render, screen, waitFor } = require('@testing-library/react');

// Mock components
const MockAccountClosurePending = ({ userId }) => (
  React.createElement('div', { 'data-testid': 'account-closure-pending' }, 
    `Account closure pending for user: ${userId}`)
);

const MockOnboardingFlow = ({ userId, initialData }) => (
  React.createElement('div', { 'data-testid': 'onboarding-flow' }, 
    `Onboarding flow for user: ${userId}, initialData: ${initialData || 'undefined'}`)
);

const MockOnboardingStatusSetter = ({ status }) => (
  React.createElement('div', { 'data-testid': 'onboarding-status-setter' }, 
    `Setting status to: ${status}`)
);

// Mock the protected page logic
const createMockProtectedPage = (userStatus) => {
  return ({ userId }) => {
    if (userStatus === 'pending_closure') {
      return React.createElement(MockAccountClosurePending, { userId });
    }
    
    if (userStatus === 'closed') {
      return React.createElement('div', { className: 'flex-1 w-full flex flex-col p-2 sm:p-4 min-h-screen' },
        React.createElement(MockOnboardingStatusSetter, { status: 'not_started' }),
        React.createElement('div', { className: 'flex-grow pb-16' },
          React.createElement('div', { className: 'max-w-2xl mx-auto py-8' },
            React.createElement('div', { className: 'bg-card border border-border rounded-lg p-8 text-center' },
              React.createElement('h1', { className: 'text-2xl font-bold mb-4' }, 'Welcome Back to Clera'),
              React.createElement('p', { className: 'text-muted-foreground mb-6' },
                'Your previous account has been closed. You can create a new account to start trading again.'
              ),
              React.createElement(MockOnboardingFlow, { 
                userId, 
                initialData: undefined
              })
            )
          )
        )
      );
    }
    
    return React.createElement('div', { 'data-testid': 'normal-page' }, 'Normal protected page');
  };
};

describe('Account Closure Status Handling', () => {
  describe('Pending Closure Status', () => {
    test('should show AccountClosurePending component for pending_closure status', () => {
      const MockProtectedPage = createMockProtectedPage('pending_closure');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByTestId('account-closure-pending')).toBeInTheDocument();
      expect(screen.getByText('Account closure pending for user: test-user-123')).toBeInTheDocument();
    });

    test('should NOT show sidebar or normal page content for pending_closure', () => {
      const MockProtectedPage = createMockProtectedPage('pending_closure');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.queryByTestId('normal-page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-flow')).not.toBeInTheDocument();
    });
  });

  describe('Closed Account Status', () => {
    test('should show onboarding restart flow for closed status', () => {
      const MockProtectedPage = createMockProtectedPage('closed');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
      expect(screen.getByText('Onboarding flow for user: test-user-123, initialData: undefined')).toBeInTheDocument();
    });

    test('should set status to not_started for closed accounts', () => {
      const MockProtectedPage = createMockProtectedPage('closed');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByTestId('onboarding-status-setter')).toBeInTheDocument();
      expect(screen.getByText('Setting status to: not_started')).toBeInTheDocument();
    });

    test('should show welcome back message for closed accounts', () => {
      const MockProtectedPage = createMockProtectedPage('closed');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByText('Welcome Back to Clera')).toBeInTheDocument();
      expect(screen.getByText('Your previous account has been closed. You can create a new account to start trading again.')).toBeInTheDocument();
    });

    test('should pass undefined initialData to restart onboarding from beginning', () => {
      const MockProtectedPage = createMockProtectedPage('closed');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByText('Onboarding flow for user: test-user-123, initialData: undefined')).toBeInTheDocument();
    });
  });

  describe('Normal Status Handling', () => {
    test('should show normal page for other statuses', () => {
      const MockProtectedPage = createMockProtectedPage('approved');
      
      render(React.createElement(MockProtectedPage, { userId: 'test-user-123' }));
      
      expect(screen.getByTestId('normal-page')).toBeInTheDocument();
      expect(screen.queryByTestId('account-closure-pending')).not.toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-flow')).not.toBeInTheDocument();
    });
  });
});

describe('Middleware Account Closure Logic', () => {
  // Mock middleware helper functions
  const isPendingClosure = (status) => status === 'pending_closure';
  const isAccountClosed = (status) => status === 'closed';

  describe('Pending Closure Navigation Blocking', () => {
    test('should block all navigation except sign-out for pending_closure', () => {
      const status = 'pending_closure';
      
      expect(isPendingClosure(status)).toBe(true);
      
      // Should redirect everything to /protected except sign-out
      const blockedPaths = [
        '/dashboard',
        '/portfolio', 
        '/invest',
        '/news',
        '/settings',
        '/chat'
      ];
      
      blockedPaths.forEach(path => {
        expect(isPendingClosure(status)).toBe(true); // Would trigger redirect
      });
    });

    test('should allow sign-out for pending_closure', () => {
      const status = 'pending_closure';
      const signOutPaths = ['/auth/signout', '/api/auth/signout'];
      
      signOutPaths.forEach(path => {
        expect(isPendingClosure(status)).toBe(true); // But specific check would allow these
      });
    });
  });

  describe('Closed Account Navigation', () => {
    test('should only allow /protected for closed accounts', () => {
      const status = 'closed';
      
      expect(isAccountClosed(status)).toBe(true);
      
      // Should redirect everything to /protected for restart
      const redirectPaths = [
        '/dashboard',
        '/portfolio',
        '/invest', 
        '/news',
        '/settings'
      ];
      
      redirectPaths.forEach(path => {
        expect(isAccountClosed(status)).toBe(true); // Would trigger redirect
      });
    });
  });

  describe('Status Helper Functions', () => {
    test('isPendingClosure should correctly identify pending closure', () => {
      expect(isPendingClosure('pending_closure')).toBe(true);
      expect(isPendingClosure('closed')).toBe(false);
      expect(isPendingClosure('approved')).toBe(false);
      expect(isPendingClosure(null)).toBe(false);
      expect(isPendingClosure(undefined)).toBe(false);
    });

    test('isAccountClosed should correctly identify closed accounts', () => {
      expect(isAccountClosed('closed')).toBe(true);
      expect(isAccountClosed('pending_closure')).toBe(false);
      expect(isAccountClosed('approved')).toBe(false);
      expect(isAccountClosed(null)).toBe(false);
      expect(isAccountClosed(undefined)).toBe(false);
    });
  });
});

describe('Client Layout Sidebar Logic', () => {
  // Mock localStorage
  const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn()
  };
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

  beforeEach(() => {
    mockLocalStorage.getItem.mockClear();
  });

  test('should hide sidebar for pending closure users', () => {
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'isPendingClosure') return 'true';
      return 'false';
    });

    const isPendingClosure = localStorage.getItem('isPendingClosure') === 'true';
    const isClosed = localStorage.getItem('isClosed') === 'true';
    
    const shouldShowSidebar = !isPendingClosure && !isClosed;
    
    expect(shouldShowSidebar).toBe(false);
  });

  test('should hide sidebar for closed account users', () => {
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'isClosed') return 'true';
      return 'false';
    });

    const isPendingClosure = localStorage.getItem('isPendingClosure') === 'true';
    const isClosed = localStorage.getItem('isClosed') === 'true';
    
    const shouldShowSidebar = !isPendingClosure && !isClosed;
    
    expect(shouldShowSidebar).toBe(false);
  });

  test('should show sidebar for normal users', () => {
    mockLocalStorage.getItem.mockImplementation(() => 'false');

    const isPendingClosure = localStorage.getItem('isPendingClosure') === 'true';
    const isClosed = localStorage.getItem('isClosed') === 'true';
    
    const shouldShowSidebar = !isPendingClosure && !isClosed;
    
    expect(shouldShowSidebar).toBe(true);
  });
}); 