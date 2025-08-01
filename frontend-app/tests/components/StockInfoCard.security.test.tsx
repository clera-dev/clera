import React from 'react';
import { render, screen } from '@testing-library/react';
import StockInfoCard from '../../components/invest/StockInfoCard';

// Mock the StockChart component
jest.mock('../../components/invest/StockChart', () => {
  return function MockStockChart({ symbol }: { symbol: string }) {
    return <div data-testid="stock-chart">Chart for {symbol}</div>;
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('StockInfoCard - Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProfile = {
    symbol: 'AAPL',
    price: 150.0,
    beta: 1.2,
    volAvg: 1000000,
    mktCap: 2500000000000,
    lastDiv: 0.88,
    range: '120.0 - 180.0',
    changes: 2.5,
    companyName: 'Apple Inc.',
    currency: 'USD',
    cik: '0000320193',
    isin: 'US0378331005',
    cusip: '037833100',
    exchange: 'NASDAQ',
    exchangeShortName: 'NASDAQ',
    industry: 'Consumer Electronics',
    website: 'https://www.apple.com',
    description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables and accessories worldwide.',
    ceo: 'Tim Cook',
    sector: 'Technology',
    country: 'US',
    fullTimeEmployees: '164000',
    phone: '+1-408-996-1010',
    address: 'One Apple Park Way',
    city: 'Cupertino',
    state: 'CA',
    zip: '95014',
    image: 'https://example.com/apple-logo.png',
    ipoDate: '1980-12-12',
    defaultImage: false,
    isEtf: false,
    isActivelyTrading: true,
    isAdr: false,
    isFund: false
  };

  const setupMockResponses = () => {
    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfile
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });
  };

  it('should render valid website URLs as clickable links', async () => {
    setupMockResponses();

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that the website link is rendered correctly
    const websiteLink = screen.getByText('www.apple.com');
    expect(websiteLink).toBeInTheDocument();
    expect(websiteLink.closest('a')).toHaveAttribute('href', 'https://www.apple.com');
    expect(websiteLink.closest('a')).toHaveAttribute('target', '_blank');
    expect(websiteLink.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should block JavaScript protocol attacks', async () => {
    const maliciousProfile = {
      ...mockProfile,
      website: 'javascript:alert("xss")'
    };

    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => maliciousProfile
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that the malicious URL is blocked and shows N/A
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByText('javascript:alert("xss")')).not.toBeInTheDocument();
  });

  it('should block data protocol attacks', async () => {
    const maliciousProfile = {
      ...mockProfile,
      website: 'data:text/html,<script>alert("xss")</script>'
    };

    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => maliciousProfile
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that the malicious URL is blocked and shows N/A
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('should block localhost access', async () => {
    const maliciousProfile = {
      ...mockProfile,
      website: 'http://localhost:8080'
    };

    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => maliciousProfile
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that the malicious URL is blocked and shows N/A
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('should handle empty website URLs', async () => {
    const profileWithoutWebsite = {
      ...mockProfile,
      website: ''
    };

    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => profileWithoutWebsite
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that empty website shows N/A
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('should handle malformed URLs', async () => {
    const profileWithMalformedUrl = {
      ...mockProfile,
      website: 'not-a-valid-url'
    };

    (fetch as jest.Mock)
      // First call: /api/investment/research (Clera recommendations)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stock_picks: [] } })
      })
      // Second call: /api/fmp/profile/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => profileWithMalformedUrl
      })
      // Third call: /api/fmp/price-target/${symbol}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

    render(
      <StockInfoCard 
        symbol="AAPL" 
        accountId="test-account"
        isInWatchlist={false}
      />
    );

    // Wait for the component to load
    await screen.findByRole('heading', { name: /Apple Inc./ });

    // Check that malformed URL shows N/A
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
}); 