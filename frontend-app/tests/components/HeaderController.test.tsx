import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import HeaderController from '@/components/HeaderController';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('HeaderController', () => {
  const renderHeaderController = (pathname: string) => {
    mockUsePathname.mockReturnValue(pathname);
    
    return render(
      <HeaderController>
        <div data-testid="header-content">Header Content</div>
      </HeaderController>
    );
  };

  describe('should show header on auth pages', () => {
    it('should show header on landing page (/)', () => {
      renderHeaderController('/');
      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });

    it('should show header on sign-in page', () => {
      renderHeaderController('/sign-in');
      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });

    it('should show header on sign-up page', () => {
      renderHeaderController('/sign-up');
      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });

    it('should show header on forgot-password page', () => {
      renderHeaderController('/forgot-password');
      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });

    it('should show header on dashboard page', () => {
      renderHeaderController('/dashboard');
      expect(screen.getByTestId('header-content')).toBeInTheDocument();
    });
  });

  describe('should NOT show header on protected/app pages', () => {
    it('should NOT show header on protected pages', () => {
      renderHeaderController('/protected');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on protected dashboard', () => {
      renderHeaderController('/protected/dashboard');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on portfolio page', () => {
      renderHeaderController('/portfolio');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on invest page', () => {
      renderHeaderController('/invest');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on chat page', () => {
      renderHeaderController('/chat');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on news page', () => {
      renderHeaderController('/news');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on settings page', () => {
      renderHeaderController('/settings');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on notes page', () => {
      renderHeaderController('/notes');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on account pages', () => {
      renderHeaderController('/account/update-information');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on API routes', () => {
      renderHeaderController('/api/portfolio/positions');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });
  });

  describe('critical bug prevention', () => {
    it('should NOT show header on sub-paths of auth pages', () => {
      renderHeaderController('/sign-in/extra');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on dashboard sub-paths', () => {
      renderHeaderController('/dashboard/settings');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should NOT show header on any path starting with /', () => {
      renderHeaderController('/any-random-path');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty pathname', () => {
      renderHeaderController('');
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });

    it('should handle undefined pathname', () => {
      mockUsePathname.mockReturnValue(undefined as any);
      render(
        <HeaderController>
          <div data-testid="header-content">Header Content</div>
        </HeaderController>
      );
      expect(screen.queryByTestId('header-content')).not.toBeInTheDocument();
    });
  });
}); 