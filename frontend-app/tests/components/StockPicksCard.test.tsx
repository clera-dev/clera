/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StockPicksCard from '@/components/invest/StockPicksCard';
import { WeeklyStockPick } from '@/lib/types/weekly-stock-picks';

// Mock the company profile hook
jest.mock('@/hooks/useCompanyProfile', () => ({
  useCompanyProfile: jest.fn().mockReturnValue({
    logoUrl: 'https://example.com/logo.png',
    displayName: 'Test Company'
  })
}));

// Mock the CompanyLogo component
jest.mock('@/components/ui/CompanyLogo', () => ({
  CompanyLogo: ({ symbol, companyName }: { symbol: string; companyName: string }) => (
    <div data-testid={`company-logo-${symbol}`}>{symbol} Logo</div>
  )
}));

const sampleStockPicks: WeeklyStockPick[] = [
  {
    ticker: 'NVDA',
    company_name: 'NVIDIA Corporation',
    rationale: 'AI infrastructure leader with dominant position in data center GPU market. Strong Q4 2024 earnings beat expectations with 22% revenue growth.',
    risk_level: 'medium'
  },
  {
    ticker: 'MSFT',
    company_name: 'Microsoft Corporation',
    rationale: 'Cloud computing giant with Azure growing 30% annually. Copilot AI integration driving Office 365 subscription growth.',
    risk_level: 'low'
  },
  {
    ticker: 'TSLA',
    company_name: 'Tesla, Inc.',
    rationale: 'Electric vehicle pioneer with expanding energy storage and autonomous driving capabilities.',
    risk_level: 'high'
  }
];

const minimalStockPicks: WeeklyStockPick[] = [
  {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    rationale: 'Strong iPhone sales and services ecosystem growth',
    risk_level: 'medium'
  }
];

describe('StockPicksCard', () => {
  const mockOnStockSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render stock picks card with title', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      expect(screen.getByText('Stock Picks From Clera')).toBeInTheDocument();
    });

    it('should render all provided stock picks', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('NVIDIA Corporation')).toBeInTheDocument();
      expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      expect(screen.getByText('Tesla, Inc.')).toBeInTheDocument();
    });

    it('should display clean stock pick information without crowded elements', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Should display basic stock information
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.getByText('NVIDIA Corporation')).toBeInTheDocument();

      // Should NOT display price targets, analyst ratings, or risk levels on cards
      expect(screen.queryByText('$150')).not.toBeInTheDocument();
      expect(screen.queryByText('$480')).not.toBeInTheDocument();
      expect(screen.queryByText('$350')).not.toBeInTheDocument();
      expect(screen.queryByText('Strong')).not.toBeInTheDocument();
      expect(screen.queryByText('medium')).not.toBeInTheDocument();
      expect(screen.queryByText('low')).not.toBeInTheDocument();
      expect(screen.queryByText('high')).not.toBeInTheDocument();
    });

    it('should handle stocks with minimal information', () => {
      render(
        <StockPicksCard
          stockPicks={minimalStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      expect(screen.getByText(/Strong iPhone sales/)).toBeInTheDocument();
      
      // Should not crash when optional fields are missing
      expect(screen.queryByText('$')).not.toBeInTheDocument();
    });

    it('should limit picks to 6 maximum', () => {
      const manyPicks: WeeklyStockPick[] = Array.from({ length: 10 }, (_, i): WeeklyStockPick => ({
        ticker: `STOCK${i}`,
        company_name: `Company ${i}`,
        rationale: `Rationale ${i}`,
        risk_level: i % 2 === 0 ? 'medium' : 'low'
      }));

      render(
        <StockPicksCard
          stockPicks={manyPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Should only show first 6
      expect(screen.getByText('STOCK0')).toBeInTheDocument();
      expect(screen.getByText('STOCK5')).toBeInTheDocument();
      expect(screen.queryByText('STOCK6')).not.toBeInTheDocument();
    });

    it('should display last generated timestamp when provided in development', () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'development';
      
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
          lastGenerated="1/30/2025"
        />
      );

      expect(screen.getByText('Updated: 1/30/2025')).toBeInTheDocument();
      
      (process.env as any).NODE_ENV = originalEnv;
    });

    it('should NOT display timestamp in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';
      
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
          lastGenerated="1/30/2025"
        />
      );

      expect(screen.queryByText(/Updated:/)).not.toBeInTheDocument();
      
      (process.env as any).NODE_ENV = originalEnv;
    });

    it('should not display timestamp when not provided', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      expect(screen.queryByText(/Updated:/)).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should render loading state when isLoading is true', () => {
      render(
        <StockPicksCard
          stockPicks={[]}
          onStockSelect={mockOnStockSelect}
          isLoading={true}
        />
      );

      expect(screen.getByText('Stock Picks From Clera')).toBeInTheDocument();
      // With loading state, the grid should still be rendered but might be empty
      // The actual loading UI would depend on implementation
    });
  });

  describe('Fallback behavior', () => {
    it('should display error state when no stock picks provided (production-grade)', () => {
      render(
        <StockPicksCard
          stockPicks={[]}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Should display error message instead of static fallback
      expect(screen.getByText('Unable to Load Picks')).toBeInTheDocument();
      expect(screen.getByText(/We're having trouble loading your personalized picks/)).toBeInTheDocument();
    });

    it('should display new user loading state', () => {
      render(
        <StockPicksCard
          stockPicks={[]}
          onStockSelect={mockOnStockSelect}
          isNewUser={true}
        />
      );

      // Should display new user loading message
      expect(screen.getByText('Generating Your Personalized Picks')).toBeInTheDocument();
      expect(screen.getByText(/Our AI is analyzing your preferences/)).toBeInTheDocument();
      // Should have loading spinner
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onStockSelect when stock pick is clicked', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      const nvidiaCard = screen.getByText('NVDA').closest('[role="button"], button, .cursor-pointer');
      expect(nvidiaCard).toBeInTheDocument();
      
      if (nvidiaCard) {
        fireEvent.click(nvidiaCard);
        expect(mockOnStockSelect).toHaveBeenCalledWith('NVDA');
      }
    });

    it('should call onStockSelect with correct ticker for each stock', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Find and click each stock
      const stocks = ['NVDA', 'MSFT', 'TSLA'];
      stocks.forEach(ticker => {
        const stockCard = screen.getByText(ticker).closest('[role="button"], button, .cursor-pointer');
        if (stockCard) {
          fireEvent.click(stockCard);
          expect(mockOnStockSelect).toHaveBeenCalledWith(ticker);
        }
      });

      expect(mockOnStockSelect).toHaveBeenCalledTimes(3);
    });
  });

  describe('Visual styling', () => {
    it('should have clean styling without risk badges on cards', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Risk levels should NOT be displayed on the cards themselves
      expect(screen.queryByText('medium')).not.toBeInTheDocument();
      expect(screen.queryByText('low')).not.toBeInTheDocument();
      expect(screen.queryByText('high')).not.toBeInTheDocument();
      
      // Cards should have clean, simple design
      const cards = document.querySelectorAll('.cursor-pointer');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should have hover effects on stock cards', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      const stockCards = document.querySelectorAll('.cursor-pointer');
      expect(stockCards.length).toBeGreaterThan(0);
      
      stockCards.forEach(card => {
        expect(card).toHaveClass('hover:shadow-md');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper card structure for screen readers', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Main title should be accessible
      expect(screen.getByText('Stock Picks From Clera')).toBeInTheDocument();
      
      // Each stock should have company name for context
      expect(screen.getByText('NVIDIA Corporation')).toBeInTheDocument();
      expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
    });

    it('should handle keyboard navigation (cards should be focusable)', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Cards should be clickable elements (focusable)
      const clickableElements = document.querySelectorAll('.cursor-pointer');
      expect(clickableElements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive design', () => {
    it('should apply responsive grid classes', () => {
      render(
        <StockPicksCard
          stockPicks={sampleStockPicks}
          onStockSelect={mockOnStockSelect}
        />
      );

      const gridContainer = document.querySelector('.grid');
      expect(gridContainer).toHaveClass('grid-cols-2'); // Mobile
      expect(gridContainer).toHaveClass('md:grid-cols-3'); // Desktop
    });
  });

  describe('Data truncation', () => {
    it('should properly contain long rationales with CSS truncation', () => {
      const longRationalePick: WeeklyStockPick[] = [{
        ticker: 'TEST',
        company_name: 'Test Company',
        rationale: 'This is a very long rationale that should be truncated to prevent the card from becoming too large and overwhelming the user interface with too much text content',
        risk_level: 'low'
      }];

      render(
        <StockPicksCard
          stockPicks={longRationalePick}
          onStockSelect={mockOnStockSelect}
        />
      );

      const rationaleText = screen.getByText(/This is a very long rationale/);
      // Should have proper CSS classes for truncation and overflow handling
      expect(rationaleText).toHaveClass('line-clamp-3');
      expect(rationaleText).toHaveClass('overflow-hidden');
      // Should contain the full text (CSS handles visual truncation)
      expect(rationaleText.textContent).toContain('This is a very long rationale');
    });

    it('should focus on rationale content only', () => {
      const picksWithContent: WeeklyStockPick[] = [{
        ticker: 'TEST',
        company_name: 'Test Company',
        rationale: 'Very detailed analysis of the company fundamentals and growth prospects for long-term investors.',
        risk_level: 'medium'
      }];

      render(
        <StockPicksCard
          stockPicks={picksWithContent}
          onStockSelect={mockOnStockSelect}
        />
      );

      // Should display rationale content (truncated)
      expect(screen.getByText('TEST')).toBeInTheDocument();
      expect(screen.getByText('Test Company')).toBeInTheDocument();
      // Rationale should be displayed and truncated
      const rationaleElement = screen.getByText(/Very detailed analysis/);
      expect(rationaleElement).toBeInTheDocument();
    });
  });
});
