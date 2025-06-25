'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  DollarSign, 
  BarChart3, 
  Clock, 
  ExternalLink, 
  X,
  FileText,
  AlertCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RelevantStocks } from './RelevantStocks';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';

// Types for investment research data
interface InvestmentTheme {
  title: string;
  summary: string;
  report: string;
  relevant_tickers: string[];
}

interface StockPick {
  ticker: string;
  company_name: string;
  rationale: string;
}

interface MarketAnalysis {
  current_environment: string;
  risk_factors: string;
}

interface InvestmentResearchData {
  investment_themes: InvestmentTheme[];
  stock_picks: StockPick[];
  market_analysis: MarketAnalysis;
}

interface InvestmentResearchProps {
  onStockSelect: (symbol: string) => void;
  isChatOpen?: boolean;
  onThemeSelect?: () => void;
}

// Mock user profile for MVP testing (only used when force generating)
const MOCK_USER_PROFILE = {
  age: "22-23 (fresh out of college)",
  location: "Newport Beach, California", 
  email: "cfmendo1@uci.edu",
  occupation: "Recent Graduate",
  income: "$80,000 - $90,000",
  portfolioValue: "$36,441.52",
  totalGain: "$296.66 (0.82% return)",
  riskScore: "8.9/10 (High)",
  diversificationScore: "1.6/10 (Poor)",
  holdings: `- AAPL: 55.9% ($20,369 - major concentration risk)
- FLOT: 27.5% ($10,021 - short-term bond ETF) 
- SPY: 14.9% ($5,428 - S&P 500 ETF)
- Asset Allocation: 100% Equity
- Security Types: 57.5% Individual Stocks, 42.5% ETFs`,
  investmentCapacity: "~$10,000",
  timeHorizon: "30+ years (retiring in 30+ years)",
  primaryGoal: "Long-term wealth building",
  targetPortfolio: "Aggressive Growth Portfolio",
  riskTolerance: "High/Aggressive",
  currentRiskProfile: "Aggressive",
  interests: `- Strong interest in technology sector
- Growth-focused investing approach
- Open to diversification beyond current concentrated AAPL position`,
  keyIssues: `- Extremely poor diversification (55.9% in single stock)
- High concentration risk in AAPL
- Need for better sector and geographic diversification
- Opportunity to leverage long time horizon for aggressive growth`
};

// Component for individual stock pick cards with company logos
function StockPickCard({ stock, onStockSelect }: { stock: StockPick; onStockSelect: (symbol: string) => void }) {
  const { logoUrl, displayName } = useCompanyProfile(stock.ticker);

  return (
    <Card 
      className="border hover:shadow-md transition-shadow cursor-pointer group h-[140px] flex flex-col"
      onClick={() => onStockSelect(stock.ticker)}
    >
      <CardContent className="p-3 flex flex-col h-full">
        <div className="flex flex-col space-y-2 h-full">
          <div className="flex items-center gap-2 mb-1 min-h-[24px]">
            <CompanyLogo
              symbol={stock.ticker}
              companyName={stock.company_name}
              imageUrl={logoUrl || undefined}
              size="sm"
            />
            <div className="text-sm font-bold truncate flex-1">{stock.ticker}</div>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2 min-h-[28px] flex-1">
            {stock.company_name}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 line-clamp-2 group-hover:text-blue-800 dark:group-hover:text-blue-300 flex-1">
            {stock.rationale.substring(0, 60)}...
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Citations from Perplexity response (fallback)
const CITATIONS = [
  "https://www.permanentportfoliofunds.com/aggressive-growth-portfolio.html",
  "https://madisonfunds.com/funds/aggressive-allocation-fund/",
  "https://www.cambridgeassociates.com/insight/concentrated-stock-portfolios-deborah-christie-sean-mclaughlin-and-chris-parker/",
  "https://ncua.gov/regulation-supervision/letters-credit-unions-other-guidance/concentration-risk-0",
  "https://www.ig.com/en/news-and-trade-ideas/best-ai-stocks-to-watch-230622",
  "https://www.securities.io/10-promising-biotech-stocks-in-the-medical-field/",
  "https://www.sganalytics.com/blog/best-green-energy-stocks-to-invest-and-buy-in/",
  "https://www.nerdwallet.com/article/investing/what-are-emerging-markets",
  "https://www.investopedia.com/managing-wealth/achieve-optimal-asset-allocation/",
  "https://blog.massmutual.com/retiring-investing/investor-profile-aggressive",
  "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/aggressive-investment-strategy/",
  "https://www.investopedia.com/terms/a/aggressiveinvestmentstrategy.asp",
  "https://www.fidelity.com/learning-center/wealth-management-insights/diversify-concentrated-positions",
  "https://www.schwab.wallst.com/schwab/Prospect/research/etfs/schwabETF/index.asp?type=holdings&symbol=IWO",
  "https://www.schwab.wallst.com/schwab/Prospect/research/etfs/schwabETF/index.asp?type=holdings&symbol=SMH",
  "https://intellectia.ai/blog/cloud-computing-stocks",
  "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=CIBR",
  "https://intellectia.ai/blog/best-5g-stocks",
  "https://www.ftportfolios.com/retail/etf/ETFholdings.aspx?Ticker=QCLN",
  "https://capex.com/en/academy/investing-in-ev-stocks"
];

export default function InvestmentResearch({ onStockSelect, isChatOpen = false, onThemeSelect }: InvestmentResearchProps) {
  const [researchData, setResearchData] = useState<InvestmentResearchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<InvestmentTheme | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [allCitations, setAllCitations] = useState<string[]>([]);

  // Clean inline citations from text for cleaner reading
  const cleanInlineCitations = (text: string) => {
    return text.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
  };

  // Collect all unique citations from all themes
  const collectAllCitations = (data: InvestmentResearchData | null) => {
    if (!data) return [];
    
    const citationSet = new Set<string>();
    
    // Add citations from metadata if available
    if (citations.length > 0) {
      citations.forEach(citation => citationSet.add(citation));
    }
    
    // Fallback to hardcoded citations if no dynamic ones
    if (citationSet.size === 0) {
      CITATIONS.forEach(citation => citationSet.add(citation));
    }
    
    return Array.from(citationSet);
  };

  // Load cached data on component mount (no cost)
  const loadCachedData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Loading cached investment research data...');
      
      // Use GET request to fetch cached data only
      const response = await fetch('/api/investment/research', {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No cached data available. Click "Generate AI Analysis" to create new content.');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setResearchData(result.data);
        setLastGenerated(new Date(result.metadata.generated_at).toLocaleDateString());
        setCitations(result.metadata?.citations || []); // Set citations from metadata
        setAllCitations(collectAllCitations(result.data));
        console.log('Cached investment research loaded successfully');
      } else {
        throw new Error(result.error || 'Failed to load cached research');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Failed to load cached investment research:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Load cached data on component mount
  useEffect(() => {
    loadCachedData();
  }, []);

  // Update allCitations whenever citations or researchData changes
  useEffect(() => {
    setAllCitations(collectAllCitations(researchData));
  }, [citations, researchData]);

  const LoadingSkeleton = () => (
    <div className="space-y-6">
      {/* Top Picks Skeleton */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="text-blue-500 h-5 w-5" />
          <h2 className="text-xl font-semibold">Stock Picks From Clera</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Investment Ideas Skeleton */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="text-yellow-500 h-5 w-5" />
          <h2 className="text-xl font-semibold">Your Personalized Investment Ideas</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const ErrorDisplay = () => (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="flex flex-col space-y-2">
            <span>Failed to load investment research: {error}</span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadCachedData}
                disabled={isLoading}
              >
                <FileText className="h-4 w-4 mr-1" />
                Retry Load Cache
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
      
      {/* Fallback to static content */}
      <div className="opacity-50">
        <StaticFallbackContent onStockSelect={onStockSelect} isChatOpen={isChatOpen} onThemeSelect={onThemeSelect} />
      </div>
    </div>
  );

  const ResearchContent = () => {
    if (!researchData) return null;

    return (
      <div className="space-y-6">
        {/* Generation timestamp and action buttons */}
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {lastGenerated && <span>Updated: {lastGenerated}</span>}
          </div>
        </div>

        {/* Top Picks Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-semibold">Stock Picks From Clera</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
            {researchData.stock_picks.map((stock, index) => (
              <StockPickCard 
                key={stock.ticker}
                stock={stock}
                onStockSelect={onStockSelect}
              />
            ))}
          </div>
        </div>

        {/* Investment Ideas Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-semibold">Your Personalized Investment Ideas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {researchData.investment_themes.map((theme, index) => (
              <Card 
                key={index}
                className="border hover:shadow-md transition-shadow cursor-pointer overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 h-40 flex flex-col"
                onClick={() => {
                  // Auto-collapse sidebar when investment theme dialog opens
                  onThemeSelect?.();
                  setSelectedTheme(theme);
                }}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col h-full relative">
                  <div className="flex flex-col h-full space-y-2">
                    <div className="font-bold text-base sm:text-lg relative z-10 truncate">{theme.title}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground relative z-10 line-clamp-4 flex-1">
                      {cleanInlineCitations(theme.summary)}
                    </div>
                    <div className="h-3 flex-shrink-0"></div> {/* Consistent bottom spacing */}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <TrendingUp className="h-16 w-16 sm:h-20 sm:w-20 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Comprehensive Sources Section */}
        {allCitations.length > 0 && (
          <div className="mt-8 border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-semibold">Research Sources</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              All sources used to generate your personalized investment themes
            </p>
            <div className="relative">
              <div className="max-h-80 overflow-y-auto border rounded-lg bg-gray-50 dark:bg-gray-900/50 p-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {allCitations.map((citation, index) => (
                  <a
                    key={index}
                    href={citation}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm p-3 border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors group bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-start gap-2">
                      <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {new URL(citation).hostname.replace(/^www\./, '')}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {citation.replace(/^https?:\/\//, '')}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
                              {allCitations.length > 20 && (
                  <div className="text-center mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing all {allCitations.length} research sources
                    </p>
                  </div>
                )}
                </div>
              </div>
              {/* Scroll fade indicator */}
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-900/50 pointer-events-none rounded-b-lg"></div>
            </div>
        )}

        {/* Investment Theme Dialog */}
        <Dialog open={!!selectedTheme} onOpenChange={(open) => !open && setSelectedTheme(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{selectedTheme?.title}</DialogTitle>
            </DialogHeader>
            {selectedTheme && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2 text-foreground">Summary:</h4>
                  <p className="text-sm text-muted-foreground">{cleanInlineCitations(selectedTheme.summary)}</p>
                </div>
                
                {/* Relevant stocks in dialog */}
                {selectedTheme.relevant_tickers && selectedTheme.relevant_tickers.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 text-foreground">Relevant Stocks:</h4>
                    <RelevantStocks 
                      tickers={selectedTheme.relevant_tickers}
                      onStockSelect={(symbol) => {
                        setSelectedTheme(null); // Close dialog first
                        onStockSelect(symbol);  // Then trigger stock selection
                      }}
                      maxDisplay={selectedTheme.relevant_tickers.length} // Show all in dialog
                    />
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold mb-2 text-foreground">Report:</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed break-words">{cleanInlineCitations(selectedTheme.report)}</p>
                </div>
                
                {/* Note about sources being available below */}
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <ExternalLink className="h-3 w-3" />
                    All research sources are available in the "Research Sources" section below
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Static fallback content (original content)
  const StaticFallbackContent = ({ onStockSelect, isChatOpen, onThemeSelect }: { onStockSelect: (symbol: string) => void, isChatOpen: boolean, onThemeSelect?: () => void }) => {
    const topStockPicks = [
      { symbol: 'MSFT', name: 'Microsoft', ytdReturn: '14.85%', buyRating: '4.86/5' },
      { symbol: 'AAPL', name: 'Apple', ytdReturn: '16.36%', buyRating: '4.02/5' },
      { symbol: 'SPY', name: 'S&P 500 ETF', ytdReturn: '7.46%', buyRating: '3.97/5' },
      { symbol: 'SPSB', name: 'SPDR Short Term Corporate Bond ETF', ytdReturn: '3.59%', buyRating: '4.38/5' },
      { symbol: 'TSLA', name: 'Tesla', ytdReturn: '17.81%', buyRating: '4.42/5' },
      { symbol: 'UNH', name: 'UnitedHealth Group', ytdReturn: '9.08%', buyRating: '4.93/5' },
    ];

    const investmentIdeas = [
      {
        title: "High-Growth Tech Stocks",
        description: "Explore cutting-edge technology companies with high-growth potential",
        icon: <TrendingUp className="h-20 w-20" />,
        color: "bg-blue-100 dark:bg-blue-900/30"
      },
      {
        title: "Dividend Royalty", 
        description: "Invest in companies with a history of consistently increasing their dividends",
        icon: <TrendingUp className="h-20 w-20" />,
        color: "bg-pink-100 dark:bg-pink-900/30"
      },
      {
        title: "Short Term Bond ETFs",
        description: "Explore low-risk, stable income generating short-term bond ETFs for low-risk return",
        icon: <TrendingUp className="h-20 w-20" />,
        color: "bg-purple-100 dark:bg-purple-900/30"
      },
      {
        title: "Medical Technology Gems",
        description: "Explore the rapidly innovating intersection of new age technology and healthcare",
        icon: <TrendingUp className="h-20 w-20" />,
        color: "bg-yellow-100 dark:bg-yellow-900/30"
      }
    ];

    return (
      <>
        {/* Top Picks Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-semibold">Stock Picks From Clera</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
            {topStockPicks.map((stock) => (
              <Card 
                key={stock.symbol}
                className="border hover:shadow-md transition-shadow cursor-pointer h-[140px] flex flex-col"
                onClick={() => onStockSelect(stock.symbol)}
              >
                <CardContent className="p-3 flex flex-col h-full">
                  <div className="flex flex-col space-y-1 h-full">
                    <div className="flex justify-between items-center mb-1">
                      <div className="bg-gray-800 dark:bg-gray-700 text-white w-6 h-6 rounded flex items-center justify-center text-xs font-medium">
                        {stock.symbol.charAt(0)}
                      </div>
                      <div className="text-sm font-bold truncate">{stock.symbol}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">YTD Return:</div>
                    <div className={`text-sm font-semibold ${parseFloat(stock.ytdReturn) > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                      {stock.ytdReturn}
                    </div>
                    <div className="text-xs text-muted-foreground mt-auto">Buy Rating:</div>
                    <div className="text-sm font-semibold">{stock.buyRating}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Investment Ideas Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-semibold">Your Personalized Investment Ideas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {investmentIdeas.map((idea, index) => (
              <Card 
                key={index}
                className={`border hover:shadow-md transition-shadow cursor-pointer overflow-hidden ${idea.color} h-40 flex flex-col`}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col h-full relative">
                  <div className="flex flex-col h-full space-y-2">
                    <div className="font-bold text-base sm:text-lg relative z-10 truncate">{idea.title}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground relative z-10 line-clamp-4 flex-1">{idea.description}</div>
                    <div className="h-3 flex-shrink-0"></div> {/* Consistent bottom spacing */}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <TrendingUp className="h-16 w-16 sm:h-20 sm:w-20 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorDisplay />;
  }

  if (researchData) {
    return <ResearchContent />;
  }

  // Fallback to static content if no data
  return <StaticFallbackContent onStockSelect={onStockSelect} isChatOpen={isChatOpen} onThemeSelect={onThemeSelect} />;
}