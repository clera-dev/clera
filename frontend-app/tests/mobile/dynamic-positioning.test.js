/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/test',
    query: {},
    asPath: '/test',
  }),
  usePathname: () => '/test',
}));

import { useMobileNavHeight } from '@/hooks/useMobileNavHeight';
import { DynamicMobileFooter, MobileInvestmentFooter, useDynamicBottomSpacing } from '@/components/mobile/DynamicMobileFooter';

// Mock window.innerWidth for mobile detection
const mockInnerWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
};

// Mock getBoundingClientRect
const mockGetBoundingClientRect = (height = 80) => {
  Element.prototype.getBoundingClientRect = jest.fn(() => ({
    bottom: height,
    height: height,
    left: 0,
    right: 0,
    top: 0,
    width: 375,
  }));
};

describe('Dynamic Mobile Positioning', () => {
  beforeEach(() => {
    // Reset to desktop width
    mockInnerWidth(1024);
    mockGetBoundingClientRect(80);
    jest.clearAllMocks();
  });

  describe('useMobileNavHeight Hook', () => {
    test('should detect mobile and return navigation height', () => {
      mockInnerWidth(375); // Mobile width

      // Create a mock navigation element
      const mockNavElement = document.createElement('div');
      mockNavElement.setAttribute('data-mobile-nav', 'true');
      mockGetBoundingClientRect(80);
      document.body.appendChild(mockNavElement);

      const TestComponent = () => {
        const { navHeight, isMobile, aboveNavHeight } = useMobileNavHeight();
        return (
          <div>
            <span data-testid="nav-height">{navHeight}</span>
            <span data-testid="is-mobile">{isMobile.toString()}</span>
            <span data-testid="above-nav-height">{aboveNavHeight}</span>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByTestId('is-mobile')).toHaveTextContent('true');
      // Should use default height when element is not found by querySelector
      expect(screen.getByTestId('nav-height')).toHaveTextContent('80');
      expect(screen.getByTestId('above-nav-height')).toHaveTextContent('88'); // 80 + 8

      document.body.removeChild(mockNavElement);
    });

    test('should return zero height on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      const TestComponent = () => {
        const { navHeight, isMobile } = useMobileNavHeight();
        return (
          <div>
            <span data-testid="nav-height">{navHeight}</span>
            <span data-testid="is-mobile">{isMobile.toString()}</span>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByTestId('is-mobile')).toHaveTextContent('false');
      expect(screen.getByTestId('nav-height')).toHaveTextContent('0');
    });

    test('should update on window resize', () => {
      const TestComponent = () => {
        const { isMobile } = useMobileNavHeight();
        return <span data-testid="is-mobile">{isMobile.toString()}</span>;
      };

      render(<TestComponent />);

      // Start desktop
      expect(screen.getByTestId('is-mobile')).toHaveTextContent('false');

      // Change to mobile
      act(() => {
        mockInnerWidth(375);
      });

      expect(screen.getByTestId('is-mobile')).toHaveTextContent('true');
    });

    test('should set CSS custom properties', () => {
      mockInnerWidth(375); // Mobile width

      const TestComponent = () => {
        useMobileNavHeight();
        return <div>Test</div>;
      };

      render(<TestComponent />);

      // Check that CSS custom properties are set
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--mobile-nav-height')).toBe('80px');
    });
  });

  describe('DynamicMobileFooter Component', () => {
    test('should render on mobile with correct positioning', () => {
      mockInnerWidth(375); // Mobile width

      render(
        <DynamicMobileFooter gap={8} zIndex={40}>
          <div>Footer content</div>
        </DynamicMobileFooter>
      );

      const footer = screen.getByText('Footer content').closest('div').parentElement;
      expect(footer).toHaveClass('fixed');
      expect(footer).toHaveStyle('bottom: 88px'); // 80 + 8 gap
      expect(footer).toHaveStyle('z-index: 40');
    });

    test('should not render on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(
        <DynamicMobileFooter>
          <div>Footer content</div>
        </DynamicMobileFooter>
      );

      expect(screen.queryByText('Footer content')).not.toBeInTheDocument();
    });

    test('should handle different gap values', () => {
      mockInnerWidth(375); // Mobile width

      render(
        <DynamicMobileFooter gap={16}>
          <div>Footer content</div>
        </DynamicMobileFooter>
      );

      const footer = screen.getByText('Footer content').closest('div').parentElement;
      expect(footer).toHaveStyle('bottom: 96px'); // 80 + 16 gap
    });
  });

  describe('MobileInvestmentFooter Component', () => {
    test('should render with investment-specific styling', () => {
      mockInnerWidth(375); // Mobile width

      render(
        <MobileInvestmentFooter>
          <div>Investment content</div>
        </MobileInvestmentFooter>
      );

      const content = screen.getByText('Investment content');
      // Navigate up the DOM tree to find the fixed container
      const fixedContainer = content.closest('.fixed');
      
      expect(fixedContainer).toBeInTheDocument();
      expect(fixedContainer).toHaveClass('fixed');
      expect(fixedContainer).toHaveClass('bg-background/95');
      expect(fixedContainer).toHaveClass('backdrop-blur-md');
      expect(fixedContainer).toHaveClass('border-t');
    });

    test('should have proper nested structure for investment content', () => {
      mockInnerWidth(375); // Mobile width

      render(
        <MobileInvestmentFooter>
          <div data-testid="investment-content">Investment content</div>
        </MobileInvestmentFooter>
      );

      const content = screen.getByTestId('investment-content');
      
      // Check nested structure
      const innerContainer = content.closest('.bg-background.border.border-border.rounded-lg');
      expect(innerContainer).toBeInTheDocument();
      
      const paddingContainer = innerContainer.closest('.px-4.py-2');
      expect(paddingContainer).toBeInTheDocument();
    });
  });

  describe('useDynamicBottomSpacing Hook', () => {
    test('should return correct spacing values for mobile', () => {
      mockInnerWidth(375); // Mobile width

      const TestComponent = () => {
        const { paddingBottom, marginBottom, bottomOffset } = useDynamicBottomSpacing(8);
        return (
          <div>
            <span data-testid="padding-bottom">{paddingBottom}</span>
            <span data-testid="margin-bottom">{marginBottom}</span>
            <span data-testid="bottom-offset">{bottomOffset}</span>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByTestId('padding-bottom')).toHaveTextContent('88px'); // 80 + 8
      expect(screen.getByTestId('margin-bottom')).toHaveTextContent('88px'); // 80 + 8
      expect(screen.getByTestId('bottom-offset')).toHaveTextContent('88'); // 80 + 8
    });

    test('should return zero spacing for desktop', () => {
      mockInnerWidth(1024); // Desktop width

      const TestComponent = () => {
        const { paddingBottom, marginBottom, bottomOffset } = useDynamicBottomSpacing(8);
        return (
          <div>
            <span data-testid="padding-bottom">{paddingBottom}</span>
            <span data-testid="margin-bottom">{marginBottom}</span>
            <span data-testid="bottom-offset">{bottomOffset}</span>
          </div>
        );
      };

      render(<TestComponent />);

      expect(screen.getByTestId('padding-bottom')).toHaveTextContent('0px');
      expect(screen.getByTestId('margin-bottom')).toHaveTextContent('0px');
      expect(screen.getByTestId('bottom-offset')).toHaveTextContent('0');
    });

    test('should handle custom additional gap', () => {
      mockInnerWidth(375); // Mobile width

      const TestComponent = () => {
        const { bottomOffset } = useDynamicBottomSpacing(20);
        return <span data-testid="bottom-offset">{bottomOffset}</span>;
      };

      render(<TestComponent />);

      expect(screen.getByTestId('bottom-offset')).toHaveTextContent('100'); // 80 + 20
    });
  });

  describe('Visual Viewport API Support', () => {
    test('should handle visual viewport changes', () => {
      mockInnerWidth(375); // Mobile width

      // Mock visual viewport
      const mockVisualViewport = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      
      Object.defineProperty(window, 'visualViewport', {
        value: mockVisualViewport,
        writable: true,
      });

      const TestComponent = () => {
        useMobileNavHeight();
        return <div>Test</div>;
      };

      const { unmount } = render(<TestComponent />);

      expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );

      unmount();

      expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
    });

    test('should handle missing visual viewport gracefully', () => {
      mockInnerWidth(375); // Mobile width

      // Remove visual viewport support
      Object.defineProperty(window, 'visualViewport', {
        value: undefined,
        writable: true,
      });

      const TestComponent = () => {
        useMobileNavHeight();
        return <div>Test</div>;
      };

      // Should not throw when visual viewport is not supported
      expect(() => render(<TestComponent />)).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing navigation element gracefully', () => {
      mockInnerWidth(375); // Mobile width

      // Ensure no navigation element exists
      const existingNav = document.querySelector('[data-mobile-nav="true"]');
      if (existingNav) {
        existingNav.remove();
      }

      const TestComponent = () => {
        const { navHeight } = useMobileNavHeight();
        return <span data-testid="nav-height">{navHeight}</span>;
      };

      render(<TestComponent />);

      // Should fallback to default height
      expect(screen.getByTestId('nav-height')).toHaveTextContent('80');
    });

    test('should handle window resize events properly', () => {
      const resizeListener = jest.fn();
      window.addEventListener('resize', resizeListener);

      const TestComponent = () => {
        useMobileNavHeight();
        return <div>Test</div>;
      };

      render(<TestComponent />);

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(resizeListener).toHaveBeenCalled();

      window.removeEventListener('resize', resizeListener);
    });

    test('should cleanup event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const TestComponent = () => {
        useMobileNavHeight();
        return <div>Test</div>;
      };

      const { unmount } = render(<TestComponent />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'orientationchange',
        expect.any(Function)
      );
    });
  });
});
