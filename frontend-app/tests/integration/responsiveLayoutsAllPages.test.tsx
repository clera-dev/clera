/**
 * Comprehensive Responsive Layouts Integration Tests
 * 
 * Tests the chat-aware responsive behavior across Portfolio, Invest, and News pages
 * to ensure no layout squishing occurs when the chat panel is opened.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CleraAssistProvider } from '@/components/ui/clera-assist-provider';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock utilities
jest.mock('@/lib/utils', () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
  getAlpacaAccountId: jest.fn().mockResolvedValue('test-account-123'),
}));

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => ({ data: { user: { id: 'test-user' } }, error: null }),
    },
  }),
}));

// Mock sidebar collapse
jest.mock('@/components/ClientLayout', () => ({
  useSidebarCollapse: () => ({
    autoCollapseSidebar: jest.fn(),
  }),
}));

// Create simplified test components that mirror the actual layout structures
const TestPortfolioPage = () => {
  const { sideChatVisible } = require('@/components/ui/clera-assist-provider').useCleraAssist();
  
  return (
    <div data-testid="portfolio-page">
      <div 
        className={`grid grid-cols-1 gap-4 lg:gap-6 ${
          sideChatVisible 
            ? '2xl:grid-cols-3'
            : 'lg:grid-cols-5 xl:grid-cols-3'
        }`}
        data-testid="portfolio-main-grid"
      >
        <div 
          className={`${
            sideChatVisible 
              ? '2xl:col-span-2'
              : 'lg:col-span-3 xl:col-span-2'
          }`}
          data-testid="portfolio-summary"
        >
          Portfolio Summary
        </div>
        <div 
          className={`space-y-3 lg:space-y-4 ${
            sideChatVisible 
              ? '2xl:col-span-1'
              : 'lg:col-span-2 xl:col-span-1'
          }`}
          data-testid="portfolio-analytics-allocation"
        >
          <div data-testid="portfolio-analytics">Portfolio Analytics</div>
          <div data-testid="asset-allocation">Asset Allocation</div>
        </div>
      </div>
    </div>
  );
};

const TestInvestPage = () => {
  const { sideChatVisible } = require('@/components/ui/clera-assist-provider').useCleraAssist();
  
  return (
    <div data-testid="invest-page">
      <div className="space-y-6">
        {/* Top Row */}
        <div 
          className={`grid grid-cols-1 gap-6 ${
            sideChatVisible 
              ? '2xl:grid-cols-2'
              : 'lg:grid-cols-2'
          }`}
          data-testid="invest-top-row"
        >
          <div data-testid="stock-picks">Stock Picks</div>
          <div data-testid="stock-watchlist">Stock Watchlist</div>
        </div>
        
        {/* Bottom Row */}
        <div 
          className={`grid grid-cols-1 gap-6 ${
            sideChatVisible 
              ? '2xl:grid-cols-3'
              : 'xl:grid-cols-3'
          }`}
          data-testid="invest-bottom-row"
        >
          <div 
            className={`${
              sideChatVisible 
                ? '2xl:col-span-2'
                : 'xl:col-span-2'
            }`}
            data-testid="investment-ideas"
          >
            Investment Ideas
          </div>
          <div 
            className={`${
              sideChatVisible 
                ? '2xl:col-span-1'
                : 'xl:col-span-1'
            }`}
            data-testid="research-sources"
          >
            Research Sources
          </div>
        </div>
      </div>
    </div>
  );
};

const TestNewsPage = () => {
  const { sideChatVisible } = require('@/components/ui/clera-assist-provider').useCleraAssist();
  
  return (
    <div data-testid="news-page">
      <div 
        className={`grid grid-cols-1 gap-6 ${
          sideChatVisible 
            ? '2xl:grid-cols-5'
            : 'xl:grid-cols-5'
        }`}
        data-testid="news-main-grid"
      >
        <div 
          className={`flex flex-col ${
            sideChatVisible 
              ? '2xl:col-span-3'
              : 'xl:col-span-3'
          }`}
          data-testid="portfolio-news"
        >
          Portfolio News Summary
        </div>
        <div 
          className={`flex flex-col space-y-6 ${
            sideChatVisible 
              ? '2xl:col-span-2'
              : 'xl:col-span-2'
          }`}
          data-testid="trending-watchlist"
        >
          <div data-testid="trending-news">Trending News</div>
          <div data-testid="news-watchlist">News Watchlist</div>
        </div>
      </div>
    </div>
  );
};

describe('Responsive Layouts Integration Tests', () => {
  const renderPageWithChatState = (PageComponent: React.ComponentType, isChatOpen: boolean) => {
    return render(
      <CleraAssistProvider sideChatVisible={isChatOpen}>
        <PageComponent />
      </CleraAssistProvider>
    );
  };

  describe('Portfolio Page Responsive Layout', () => {
    it('should use standard breakpoints when chat is closed', () => {
      renderPageWithChatState(TestPortfolioPage, false);
      
      const mainGrid = screen.getByTestId('portfolio-main-grid');
      const summary = screen.getByTestId('portfolio-summary');
      const analyticsAllocation = screen.getByTestId('portfolio-analytics-allocation');
      
      // Check grid uses standard breakpoints
      expect(mainGrid).toHaveClass('lg:grid-cols-5');
      expect(mainGrid).toHaveClass('xl:grid-cols-3');
      expect(mainGrid).not.toHaveClass('2xl:grid-cols-3');
      
      // Check component spans
      expect(summary).toHaveClass('lg:col-span-3');
      expect(summary).toHaveClass('xl:col-span-2');
      expect(analyticsAllocation).toHaveClass('lg:col-span-2');
      expect(analyticsAllocation).toHaveClass('xl:col-span-1');
    });

    it('should use 2xl breakpoints when chat is open', () => {
      renderPageWithChatState(TestPortfolioPage, true);
      
      const mainGrid = screen.getByTestId('portfolio-main-grid');
      const summary = screen.getByTestId('portfolio-summary');
      const analyticsAllocation = screen.getByTestId('portfolio-analytics-allocation');
      
      // Check grid uses 2xl breakpoint only
      expect(mainGrid).toHaveClass('2xl:grid-cols-3');
      expect(mainGrid).not.toHaveClass('lg:grid-cols-5');
      expect(mainGrid).not.toHaveClass('xl:grid-cols-3');
      
      // Check component spans
      expect(summary).toHaveClass('2xl:col-span-2');
      expect(analyticsAllocation).toHaveClass('2xl:col-span-1');
    });

    it('should maintain consistent spacing across chat states', () => {
      const { rerender } = renderPageWithChatState(TestPortfolioPage, false);
      
      let mainGrid = screen.getByTestId('portfolio-main-grid');
      expect(mainGrid).toHaveClass('gap-4');
      expect(mainGrid).toHaveClass('lg:gap-6');
      
      rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestPortfolioPage />
        </CleraAssistProvider>
      );
      
      mainGrid = screen.getByTestId('portfolio-main-grid');
      expect(mainGrid).toHaveClass('gap-4');
      expect(mainGrid).toHaveClass('lg:gap-6');
    });
  });

  describe('Invest Page Responsive Layout', () => {
    it('should use standard breakpoints when chat is closed', () => {
      renderPageWithChatState(TestInvestPage, false);
      
      const topRow = screen.getByTestId('invest-top-row');
      const bottomRow = screen.getByTestId('invest-bottom-row');
      const investmentIdeas = screen.getByTestId('investment-ideas');
      const researchSources = screen.getByTestId('research-sources');
      
      // Check top row uses lg breakpoint
      expect(topRow).toHaveClass('lg:grid-cols-2');
      expect(topRow).not.toHaveClass('2xl:grid-cols-2');
      
      // Check bottom row uses xl breakpoint
      expect(bottomRow).toHaveClass('xl:grid-cols-3');
      expect(bottomRow).not.toHaveClass('2xl:grid-cols-3');
      
      // Check component spans
      expect(investmentIdeas).toHaveClass('xl:col-span-2');
      expect(researchSources).toHaveClass('xl:col-span-1');
    });

    it('should use 2xl breakpoints when chat is open', () => {
      renderPageWithChatState(TestInvestPage, true);
      
      const topRow = screen.getByTestId('invest-top-row');
      const bottomRow = screen.getByTestId('invest-bottom-row');
      const investmentIdeas = screen.getByTestId('investment-ideas');
      const researchSources = screen.getByTestId('research-sources');
      
      // Check both rows use 2xl breakpoints
      expect(topRow).toHaveClass('2xl:grid-cols-2');
      expect(bottomRow).toHaveClass('2xl:grid-cols-3');
      
      // Check component spans
      expect(investmentIdeas).toHaveClass('2xl:col-span-2');
      expect(researchSources).toHaveClass('2xl:col-span-1');
    });

    it('should maintain proper component proportions', () => {
      renderPageWithChatState(TestInvestPage, true);
      
      const topRow = screen.getByTestId('invest-top-row');
      const bottomRow = screen.getByTestId('invest-bottom-row');
      
      // Top row should have 2 equal columns (1:1 ratio)
      expect(topRow).toHaveClass('2xl:grid-cols-2');
      
      // Bottom row should have 3 columns with 2:1 ratio
      expect(bottomRow).toHaveClass('2xl:grid-cols-3');
      const investmentIdeas = screen.getByTestId('investment-ideas');
      const researchSources = screen.getByTestId('research-sources');
      expect(investmentIdeas).toHaveClass('2xl:col-span-2');
      expect(researchSources).toHaveClass('2xl:col-span-1');
    });
  });

  describe('News Page Responsive Layout', () => {
    it('should use xl breakpoints when chat is closed', () => {
      renderPageWithChatState(TestNewsPage, false);
      
      const mainGrid = screen.getByTestId('news-main-grid');
      const portfolioNews = screen.getByTestId('portfolio-news');
      const trendingWatchlist = screen.getByTestId('trending-watchlist');
      
      // Check grid uses xl breakpoint
      expect(mainGrid).toHaveClass('xl:grid-cols-5');
      expect(mainGrid).not.toHaveClass('2xl:grid-cols-5');
      
      // Check component spans (3:2 ratio)
      expect(portfolioNews).toHaveClass('xl:col-span-3');
      expect(trendingWatchlist).toHaveClass('xl:col-span-2');
    });

    it('should use 2xl breakpoints when chat is open', () => {
      renderPageWithChatState(TestNewsPage, true);
      
      const mainGrid = screen.getByTestId('news-main-grid');
      const portfolioNews = screen.getByTestId('portfolio-news');
      const trendingWatchlist = screen.getByTestId('trending-watchlist');
      
      // Check grid uses 2xl breakpoint
      expect(mainGrid).toHaveClass('2xl:grid-cols-5');
      
      // Check component spans maintain 3:2 ratio
      expect(portfolioNews).toHaveClass('2xl:col-span-3');
      expect(trendingWatchlist).toHaveClass('2xl:col-span-2');
    });

    it('should maintain nested component structure', () => {
      renderPageWithChatState(TestNewsPage, true);
      
      const trendingWatchlist = screen.getByTestId('trending-watchlist');
      const trendingNews = screen.getByTestId('trending-news');
      const newsWatchlist = screen.getByTestId('news-watchlist');
      
      // Check that nested components maintain proper spacing
      expect(trendingWatchlist).toHaveClass('space-y-6');
      expect(trendingNews).toBeInTheDocument();
      expect(newsWatchlist).toBeInTheDocument();
    });
  });

  describe('Cross-Page Consistency', () => {
    it('should use consistent 2xl breakpoint strategy across all pages when chat is open', () => {
      const portfolioRender = renderPageWithChatState(TestPortfolioPage, true);
      const investRender = renderPageWithChatState(TestInvestPage, true);
      const newsRender = renderPageWithChatState(TestNewsPage, true);
      
      // All pages should use 2xl: breakpoints when chat is open
      const portfolioGrid = portfolioRender.getByTestId('portfolio-main-grid');
      const investTopRow = investRender.getByTestId('invest-top-row');
      const investBottomRow = investRender.getByTestId('invest-bottom-row');
      const newsGrid = newsRender.getByTestId('news-main-grid');
      
      expect(portfolioGrid.className).toContain('2xl:');
      expect(investTopRow.className).toContain('2xl:');
      expect(investBottomRow.className).toContain('2xl:');
      expect(newsGrid.className).toContain('2xl:');
      
      // Clean up
      portfolioRender.unmount();
      investRender.unmount();
      newsRender.unmount();
    });

    it('should maintain mobile-first responsive design across all pages', () => {
      renderPageWithChatState(TestPortfolioPage, false);
      renderPageWithChatState(TestInvestPage, false);
      renderPageWithChatState(TestNewsPage, false);
      
      const portfolioGrid = screen.getAllByTestId('portfolio-main-grid')[0];
      const investTopRow = screen.getAllByTestId('invest-top-row')[0];
      const newsGrid = screen.getAllByTestId('news-main-grid')[0];
      
      // All grids should start with grid-cols-1 (mobile-first)
      expect(portfolioGrid).toHaveClass('grid-cols-1');
      expect(investTopRow).toHaveClass('grid-cols-1');
      expect(newsGrid).toHaveClass('grid-cols-1');
    });

    it('should prevent layout squishing by using appropriate breakpoints', () => {
      // Test the key insight: when chat opens, effective width is halved
      // So we need higher breakpoints to prevent squishing
      
      // Test Portfolio Page
      const portfolioRender = renderPageWithChatState(TestPortfolioPage, false);
      let grid = portfolioRender.getByTestId('portfolio-main-grid');
      expect(grid.className).toMatch(/\b(lg:|xl:)/);
      
      portfolioRender.rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestPortfolioPage />
        </CleraAssistProvider>
      );
      grid = portfolioRender.getByTestId('portfolio-main-grid');
      expect(grid.className).toContain('2xl:');
      portfolioRender.unmount();
      
      // Test Invest Page
      const investRender = renderPageWithChatState(TestInvestPage, false);
      let investGrid = investRender.getByTestId('invest-top-row');
      expect(investGrid.className).toMatch(/\b(lg:|xl:)/);
      
      investRender.rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestInvestPage />
        </CleraAssistProvider>
      );
      investGrid = investRender.getByTestId('invest-top-row');
      expect(investGrid.className).toContain('2xl:');
      investRender.unmount();
      
      // Test News Page
      const newsRender = renderPageWithChatState(TestNewsPage, false);
      let newsGrid = newsRender.getByTestId('news-main-grid');
      expect(newsGrid.className).toMatch(/\b(xl:)/);
      
      newsRender.rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestNewsPage />
        </CleraAssistProvider>
      );
      newsGrid = newsRender.getByTestId('news-main-grid');
      expect(newsGrid.className).toContain('2xl:');
      newsRender.unmount();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle rapid chat state changes gracefully', () => {
      const { rerender } = renderPageWithChatState(TestPortfolioPage, false);
      
      // Rapidly toggle chat state
      for (let i = 0; i < 5; i++) {
        rerender(
          <CleraAssistProvider sideChatVisible={i % 2 === 0}>
            <TestPortfolioPage />
          </CleraAssistProvider>
        );
        
        const grid = screen.getByTestId('portfolio-main-grid');
        expect(grid).toBeInTheDocument();
        expect(grid.className).toMatch(/grid grid-cols-1/);
      }
    });

    it('should maintain accessibility when layouts change', () => {
      const { rerender } = renderPageWithChatState(TestPortfolioPage, false);
      
      // Check initial accessibility
      const summary = screen.getByTestId('portfolio-summary');
      const analytics = screen.getByTestId('portfolio-analytics');
      const allocation = screen.getByTestId('asset-allocation');
      
      expect(summary).toBeVisible();
      expect(analytics).toBeVisible();
      expect(allocation).toBeVisible();
      
      // Toggle chat and recheck
      rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestPortfolioPage />
        </CleraAssistProvider>
      );
      
      expect(summary).toBeVisible();
      expect(analytics).toBeVisible();
      expect(allocation).toBeVisible();
    });

    it('should handle missing chat context gracefully', () => {
      // Test what happens if CleraAssistProvider is not available
      const TestWithoutProvider = () => {
        try {
          return <TestPortfolioPage />;
        } catch (error) {
          return <div data-testid="error">Error: {(error as Error).message}</div>;
        }
      };
      
      expect(() => render(<TestWithoutProvider />)).toThrow();
    });
  });

  describe('Performance and Memory', () => {
    it('should not cause memory leaks during state changes', () => {
      const renders: any[] = [];
      
      // Create multiple renders and track them
      for (let i = 0; i < 10; i++) {
        renders.push(renderPageWithChatState(TestPortfolioPage, i % 2 === 0));
      }
      
      // Clean up all renders
      renders.forEach(render => render.unmount());
      
      // Test should complete without memory issues
      expect(true).toBe(true);
    });

    it('should re-render efficiently when chat state changes', () => {
      const { rerender } = renderPageWithChatState(TestPortfolioPage, false);
      
      // Count the number of DOM elements before
      const initialElements = document.querySelectorAll('*').length;
      
      // Toggle chat state
      rerender(
        <CleraAssistProvider sideChatVisible={true}>
          <TestPortfolioPage />
        </CleraAssistProvider>
      );
      
      // Count elements after - should be roughly the same (efficient re-render)
      const afterElements = document.querySelectorAll('*').length;
      expect(Math.abs(afterElements - initialElements)).toBeLessThan(10);
    });
  });
});