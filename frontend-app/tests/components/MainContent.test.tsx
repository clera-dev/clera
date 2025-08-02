import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import MainContent from '@/components/MainContent';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('MainContent', () => {
  const renderMainContent = (pathname: string) => {
    mockUsePathname.mockReturnValue(pathname);
    
    return render(
      <MainContent>
        <div data-testid="page-content">Page Content</div>
      </MainContent>
    );
  };

  describe('should add header padding on auth pages', () => {
    it('should add padding on landing page (/)', () => {
      const { container } = renderMainContent('/');
      const main = container.querySelector('main');
      expect(main).toHaveClass('pt-14', 'sm:pt-18');
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });

    it('should add padding on sign-in page', () => {
      const { container } = renderMainContent('/sign-in');
      const main = container.querySelector('main');
      expect(main).toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should add padding on sign-up page', () => {
      const { container } = renderMainContent('/sign-up');
      const main = container.querySelector('main');
      expect(main).toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should add padding on forgot-password page', () => {
      const { container } = renderMainContent('/forgot-password');
      const main = container.querySelector('main');
      expect(main).toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should add padding on dashboard page', () => {
      const { container } = renderMainContent('/dashboard');
      const main = container.querySelector('main');
      expect(main).toHaveClass('pt-14', 'sm:pt-18');
    });
  });

  describe('should NOT add header padding on protected/app pages', () => {
    it('should NOT add padding on protected pages', () => {
      const { container } = renderMainContent('/protected');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });

    it('should NOT add padding on portfolio page', () => {
      const { container } = renderMainContent('/portfolio');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on invest page', () => {
      const { container } = renderMainContent('/invest');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on chat page', () => {
      const { container } = renderMainContent('/chat');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on news page', () => {
      const { container } = renderMainContent('/news');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on settings page', () => {
      const { container } = renderMainContent('/settings');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on notes page', () => {
      const { container } = renderMainContent('/notes');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });
  });

  describe('consistency with HeaderController', () => {
    it('should use exact path matching like HeaderController', () => {
      const { container } = renderMainContent('/sign-in/extra');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });

    it('should NOT add padding on any path starting with /', () => {
      const { container } = renderMainContent('/any-random-path');
      const main = container.querySelector('main');
      expect(main).not.toHaveClass('pt-14', 'sm:pt-18');
    });
  });

  describe('base classes', () => {
    it('should always have flex-1 w-full flex flex-col classes', () => {
      const { container } = renderMainContent('/portfolio');
      const main = container.querySelector('main');
      expect(main).toHaveClass('flex-1', 'w-full', 'flex', 'flex-col');
    });
  });
}); 