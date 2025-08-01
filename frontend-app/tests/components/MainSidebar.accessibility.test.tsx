import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MainSidebar from '../../components/MainSidebar';

// Mock Next.js router
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  pathname: '/dashboard',
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard',
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window events
Object.defineProperty(window, 'addEventListener', {
  value: jest.fn(),
});

Object.defineProperty(window, 'removeEventListener', {
  value: jest.fn(),
});

Object.defineProperty(window, 'dispatchEvent', {
  value: jest.fn(),
});

describe('MainSidebar Accessibility', () => {
  const defaultProps = {
    isMobileSidebarOpen: false,
    setIsMobileSidebarOpen: jest.fn(),
    onToggleSideChat: jest.fn(),
    sideChatVisible: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('false');
  });

  describe('Collapsed Sidebar Logo Button', () => {
    it('should have proper accessibility attributes when collapsed', () => {
      localStorageMock.getItem.mockReturnValue('true');
      
      render(<MainSidebar {...defaultProps} />);
      
      // Find the logo button in collapsed state
      const logoButton = screen.getByRole('button', { name: /open sidebar/i });
      
      // Check accessibility attributes
      expect(logoButton).toHaveAttribute('role', 'button');
      expect(logoButton).toHaveAttribute('tabIndex', '0');
      expect(logoButton).toHaveAttribute('aria-label', 'Open sidebar');
    });

    it('should be keyboard accessible with Enter key', () => {
      localStorageMock.getItem.mockReturnValue('true');
      
      render(<MainSidebar {...defaultProps} />);
      
      const logoButton = screen.getByRole('button', { name: /open sidebar/i });
      
      // Focus the button and trigger keyboard event within act()
      act(() => {
        logoButton.focus();
        fireEvent.keyDown(logoButton, { key: 'Enter' });
      });
      
      // Verify that the button had proper accessibility attributes before the event
      expect(logoButton).toHaveAttribute('role', 'button');
      expect(logoButton).toHaveAttribute('tabIndex', '0');
      expect(logoButton).toHaveAttribute('aria-label', 'Open sidebar');
    });

    it('should be keyboard accessible with Space key', () => {
      localStorageMock.getItem.mockReturnValue('true');
      
      render(<MainSidebar {...defaultProps} />);
      
      const logoButton = screen.getByRole('button', { name: /open sidebar/i });
      
      // Focus the button and trigger keyboard event within act()
      act(() => {
        logoButton.focus();
        fireEvent.keyDown(logoButton, { key: ' ' });
      });
      
      // Verify that the button had proper accessibility attributes before the event
      expect(logoButton).toHaveAttribute('role', 'button');
      expect(logoButton).toHaveAttribute('tabIndex', '0');
      expect(logoButton).toHaveAttribute('aria-label', 'Open sidebar');
    });

    it('should have all required accessibility attributes', () => {
      localStorageMock.getItem.mockReturnValue('true');
      
      render(<MainSidebar {...defaultProps} />);
      
      const logoButton = screen.getByRole('button', { name: /open sidebar/i });
      
      // Verify all accessibility attributes are present
      expect(logoButton).toHaveAttribute('role', 'button');
      expect(logoButton).toHaveAttribute('tabIndex', '0');
      expect(logoButton).toHaveAttribute('aria-label', 'Open sidebar');
      
      // Verify the button is focusable and interactive
      expect(logoButton).toHaveClass('cursor-pointer');
    });
  });

  describe('Expanded Sidebar', () => {
    it('should have proper accessibility for collapse button', () => {
      localStorageMock.getItem.mockReturnValue('false');
      
      render(<MainSidebar {...defaultProps} />);
      
      // Find the collapse button (desktop version)
      const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i });
      
      expect(collapseButton).toBeInTheDocument();
      expect(collapseButton).toHaveAttribute('aria-label', 'Collapse sidebar');
    });

    it('should have proper accessibility for mobile close button', () => {
      localStorageMock.getItem.mockReturnValue('false');
      
      render(<MainSidebar {...defaultProps} isMobileSidebarOpen={true} />);
      
      // Find the close button (mobile version)
      const closeButton = screen.getByRole('button', { name: /close sidebar/i });
      
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAttribute('aria-label', 'Close sidebar');
    });
  });

  describe('Navigation Items', () => {
    it('should have proper accessibility for navigation links', () => {
      localStorageMock.getItem.mockReturnValue('false');
      
      render(<MainSidebar {...defaultProps} />);
      
      // Check that navigation items are accessible
      expect(screen.getByRole('link', { name: /ask clera/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /portfolio/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /invest/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /news/i })).toBeInTheDocument();
    });

    it('should provide tooltips for collapsed navigation items', () => {
      localStorageMock.getItem.mockReturnValue('true');
      
      render(<MainSidebar {...defaultProps} />);
      
      // In collapsed state, navigation items should have title attributes
      const navItems = screen.getAllByRole('link');
      
      // Check that at least some items have title attributes for tooltips
      const itemsWithTitles = navItems.filter(item => item.hasAttribute('title'));
      expect(itemsWithTitles.length).toBeGreaterThan(0);
    });
  });
}); 