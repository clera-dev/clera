"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe, TrendingUp, Eye, ArrowDown, ArrowUp, Volume2, Loader2, AlertCircle, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAlpacaAccountId } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useCleraAssist } from "@/components/ui/clera-assist-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import PortfolioNewsSummaryWithAssist from '@/components/news/PortfolioNewsSummaryWithAssist';
import TrendingNewsWithAssist from '@/components/news/TrendingNewsWithAssist';
import NewsWatchlistWithAssist from '@/components/news/NewsWatchlistWithAssist';
import MarketEnvironment from '@/components/news/MarketEnvironment';

// Updated interface for enriched articles
interface EnrichedArticle {
  url: string;
  title: string;
  snippet: string;
  source: string; // e.g. "investopedia.com"
  sentimentScore: number; // e.g. -0.5 to 0.5 (comparative score)
  used_for_paragraph: number | null; // Or string, depending on how it's used
  shouldDisplay?: boolean; // Flag to determine if the article should be displayed
}

// Original NewsItem - can be deprecated if EnrichedArticle covers all needs
interface NewsItem {
  source: string;
  title: string;
  sentiment?: 'positive' | 'negative';
  icon?: string;
  trend?: 'up' | 'down';
  url?: string;
}

interface WatchlistNewsItem {
  title: string;
  source: string;
  url?: string;
  published_at?: string;
  banner_image?: string;
  summary?: string;
  sentiment_score?: number;
  sentiment_label?: string;
  category?: string; // Added category field to track which sector it belongs to
  logo_url?: string; // Added for publisher logo from Polygon.io
}

interface WatchlistCategories {
  // Row 1: Global markets and alternative investments
  globalMarkets: boolean;
  crypto: boolean;
  commodities: boolean;
  fixedIncome: boolean;
  forex: boolean;
  
  // Row 2: Sectors
  energy: boolean;
  financials: boolean;
  healthcare: boolean;
  technology: boolean;
  consumer: boolean;
  
  // Row 3: Other categories
  realEstate: boolean;
  esg: boolean;
  macroeconomic: boolean;
  
  [key: string]: boolean; // Add index signature for dynamic properties
}

interface WatchlistNewsData {
  // Row 1
  globalMarkets: WatchlistNewsItem[];
  crypto: WatchlistNewsItem[];
  commodities: WatchlistNewsItem[];
  fixedIncome: WatchlistNewsItem[];
  forex: WatchlistNewsItem[];
  
  // Row 2
  energy: WatchlistNewsItem[];
  financials: WatchlistNewsItem[];
  healthcare: WatchlistNewsItem[];
  technology: WatchlistNewsItem[];
  consumer: WatchlistNewsItem[];
  
  // Row 3
  realEstate: WatchlistNewsItem[];
  esg: WatchlistNewsItem[];
  macroeconomic: WatchlistNewsItem[];
  
  [key: string]: WatchlistNewsItem[]; // Add index signature for dynamic properties
}

// Define Record type for API response
type WatchlistNewsRecord = Record<string, WatchlistNewsItem[]>;

interface PortfolioSummaryData {
  summary_text: string;
  referenced_articles: EnrichedArticle[]; // Use the new enriched article interface
  generated_at: string;
  perplexity_model: string;
}

interface WatchlistNewsItemClientProps {
  title: string;
  source: string;
  sentimentScore: number; // Use the score directly
  logoUrl?: string;
  ticker?: string;
  className?: string;
  articleUrl?: string; // For making the item clickable
}

// Component to display individual news items in the watchlist
const WatchlistNewsItemClient: React.FC<WatchlistNewsItemClientProps> = ({ title, source, sentimentScore, logoUrl, ticker, className, articleUrl }) => {
  const getSourceInitials = (src: string): string => {
    if (!src) return '?';
    const cleanSource = src.replace(/^(www\.)|(^api\.)|(\.(com|org|net|io|co|ai|news|finance|money|app|xyz|gov|edu|biz|info|capital|markets|invest|trading|bloomberg|reuters|cnbc|wsj|ft))$/gi, '');
    return cleanSource.substring(0, 2).toUpperCase();
  };

  const getSourceColor = (src: string): string => {
    if (!src) return 'bg-gray-500';
    const hash = src.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const colors = ['bg-red-500', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
    return colors[Math.abs(hash) % colors.length];
  };

  const isPositive = sentimentScore >= 0;
  
  // Better fallback title detection and handling
  const isFallbackTitle = title === source || 
                         title === `Error fetching: ${source}` || 
                         title === `Non-HTML: ${source}` || 
                         title === 'N/A' ||
                         title.includes('Access to this page has been denied') ||
                         title.includes('access denied') ||
                         title.includes('Access denied') ||
                         title.includes('page has been denied');
  
  // Create a better fallback title when access is denied
  const displayTitle = isFallbackTitle ? 
    `${source} - ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}` : 
    title;
  
  // For portfolio summary articles, ALWAYS show sentiment arrows (never link icon)
  // For other contexts, show link icon only for true fallback cases
  const SentimentIcon = isPositive ? ArrowUp : ArrowDown;
  const sentimentColor = isPositive ? 'text-green-500' : 'text-red-500';
  const sentimentBg = isPositive ? 'bg-green-500/10' : 'bg-red-500/10';
  const sentimentBorder = isPositive ? 'border-green-500/50' : 'border-red-500/50';

  const content = (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${sentimentBorder} ${sentimentBg} hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-center space-x-3 flex-grow min-w-0 mr-2">
        {logoUrl ? (
          <img src={logoUrl} alt={source} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${getSourceColor(source)} flex-shrink-0`}>
            {getSourceInitials(source)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 group-hover:text-white truncate">{displayTitle}</p>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 truncate">{source}</span>
            {ticker && <Badge variant="outline" className="text-xs">{ticker}</Badge>}
          </div>
        </div>
      </div>
      <SentimentIcon className={`w-5 h-5 ${sentimentColor} flex-shrink-0`} />
    </div>
  );

  if (articleUrl) {
    return (
      <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="block group">
        {content}
      </a>
    );
  }
  return content;
};

interface TrendingNewsItem {
  id: string;
  title: string;
  url: string;
  published_at: string;
  source: string;
  banner_image: string;
  summary: string;
  sentiment_score: number;
  sentiment_label: string;
  topics: string[];
}

interface TrendingNewsResponse {
  articles: TrendingNewsItem[];
  last_updated: string | null;
  next_update: string | null;
}

interface WatchlistNewsResponse {
  categories: Record<string, WatchlistNewsItem[]>;
  last_updated: string | null;
  next_update: string | null;
}

export default function NewsPage() {
  const { sideChatVisible } = useCleraAssist();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingAccountData, setIsLoadingAccountData] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistCategories>({
    // Row 1
    globalMarkets: true,
    crypto: true,
    commodities: true,
    fixedIncome: false,
    forex: false,
    
    // Row 2
    energy: false,
    financials: true,
    healthcare: true,
    technology: true,
    consumer: false,
    
    // Row 3
    realEstate: false,
    esg: false,
    macroeconomic: true
  });

  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [trendingNews, setTrendingNews] = useState<TrendingNewsItem[]>([]);
  const [isLoadingTrendingNews, setIsLoadingTrendingNews] = useState(true);
  const [trendingNewsError, setTrendingNewsError] = useState<string | null>(null);

  // Load user and account data for the chat functionality
  useEffect(() => {
    const fetchUserAndAccountData = async () => {
      setIsLoadingAccountData(true);
      setAccountError(null);
      try {
        // Get user ID from Supabase Auth
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          console.error("User not authenticated", authError);
          setAccountError("Authentication error. Please log in again.");
          return;
        }
        
        setUserId(user.id);
        
        // Get Alpaca Account ID (optional - only for brokerage mode)
        const fetchedAccountId = await getAlpacaAccountId();
        if (fetchedAccountId) {
          setAccountId(fetchedAccountId);
        } else {
          // In aggregation mode, user doesn't have an Alpaca account
          // News features work fine with just user_id
          console.log("No Alpaca account found - user in aggregation mode");
          setAccountId(null);
        }
      } catch (error) {
        console.error("Error fetching user or account data:", error);
        setAccountError("Failed to load user data. Please refresh the page.");
      } finally {
        setIsLoadingAccountData(false);
      }
    };

    fetchUserAndAccountData();
  }, []);

  // Fetch Portfolio Summary
  useEffect(() => {
    const fetchPortfolioSummary = async () => {
      setIsLoadingSummary(true);
      setSummaryError(null);
      try {
        const response = await fetch('/api/news/portfolio-summary');
        if (!response.ok) {
          if (response.status === 404) {
            setSummaryError("No portfolio summary available yet for today.");
          } else {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
          setPortfolioSummary(null);
        } else {
          const data: PortfolioSummaryData = await response.json();
          setPortfolioSummary(data);
        }
      } catch (error: any) {
        console.error("Error fetching portfolio summary:", error);
        setSummaryError(`Failed to load summary: ${error.message}`);
        setPortfolioSummary(null);
      }
      setIsLoadingSummary(false);
    };

    fetchPortfolioSummary();
  }, []);

  // Fetch Trending Market News
  useEffect(() => {
    const fetchTrendingNews = async () => {
      setIsLoadingTrendingNews(true);
      setTrendingNewsError(null);
      try {
        const response = await fetch('/api/news/trending');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data: TrendingNewsResponse = await response.json();
        setTrendingNews(data.articles);
      } catch (error: any) {
        console.error("Error fetching trending news:", error);
        setTrendingNewsError(`Failed to load trending news: ${error.message}`);
      }
      setIsLoadingTrendingNews(false);
    };

    fetchTrendingNews();
  }, []);
  
  // Fetch Watchlist News
  const [isLoadingWatchlistNews, setIsLoadingWatchlistNews] = useState(true);
  const [watchlistNewsError, setWatchlistNewsError] = useState<string | null>(null);
  
  // Watchlist news mock data - initialized with empty arrays for each category
  const [watchlistNews, setWatchlistNews] = useState<WatchlistNewsData>({
    // Row 1
    globalMarkets: [
      { title: "Global Markets Remain Resilient Despite Headwinds", source: "Financial Times" },
      { title: "IMF Warns of Economic Slowdown in Emerging Markets", source: "Bloomberg" }
    ],
    crypto: [
      { title: "Bitcoin Surpasses $70,000 Milestone", source: "CoinDesk" },
      { title: "Ethereum Upgrade Set for Q3 2024", source: "Cointelegraph" }
    ],
    commodities: [
      { title: "Gold Prices Rally as Inflation Concerns Persist", source: "Reuters" },
      { title: "Oil Markets Stabilize Following OPEC+ Decision", source: "Bloomberg" }
    ],
    fixedIncome: [
      { title: "Treasury Yields Fluctuate Amid Fed Policy Uncertainty", source: "WSJ" },
      { title: "Corporate Bond Market Shows Signs of Stress", source: "MarketWatch" }
    ],
    forex: [
      { title: "Dollar Strengthens Against Major Currencies", source: "Reuters" },
      { title: "Currency Volatility Rises Amid Global Uncertainty", source: "FX Street" }
    ],
    
    // Row 2
    energy: [
      { title: "Renewable Energy Investments Reach Record High", source: "CleanTechnica" },
      { title: "Oil Majors Pivot Toward Green Energy Solutions", source: "Reuters" }
    ],
    financials: [
      { title: "Fed Signals Potential Rate Cuts in Coming Months", source: "WSJ" },
      { title: "Global Banking Regulations Tighten Amid Market Volatility", source: "Financial Times" }
    ],
    healthcare: [
      { title: "Breakthrough in Cancer Treatment Shows Promise", source: "Nature" },
      { title: "Healthcare Stocks Rally on Positive Trial Results", source: "CNBC" }
    ],
    technology: [
      { title: "Apple's New AI Features Set to Transform User Experience", source: "TechCrunch" },
      { title: "Google Cloud Expands Enterprise AI Solutions", source: "CNBC" }
    ],
    consumer: [
      { title: "Consumer Spending Shows Resilience Despite Inflation", source: "WSJ" },
      { title: "Retail Sales Surge in Holiday Season", source: "Bloomberg" }
    ],
    
    // Row 3
    realEstate: [
      { title: "Commercial Real Estate Faces Continued Challenges", source: "CNBC" },
      { title: "Housing Market Cools as Mortgage Rates Rise", source: "WSJ" }
    ],
    esg: [
      { title: "ESG Investing Gains Traction Among Institutional Investors", source: "Bloomberg" },
      { title: "Regulators Announce New ESG Disclosure Requirements", source: "Financial Times" }
    ],
    macroeconomic: [
      { title: "Inflation Data Points to Potential Economic Slowdown", source: "Reuters" },
      { title: "Central Banks Coordinate Policy Response to Global Challenges", source: "WSJ" }
    ]
  });
  
  useEffect(() => {
    const fetchWatchlistNews = async () => {
      setIsLoadingWatchlistNews(true);
      setWatchlistNewsError(null);
      try {
        try {
          const response = await fetch('/api/news/watchlist');
          
          if (!response.ok) {
            // Check for missing table error in response text
            if (response.status === 500) {
              const errorText = await response.text();
              if (errorText.includes('relation "public.watchlist_cached_news" does not exist')) {
                console.warn('Watchlist tables do not exist yet. Will use mock data instead.');
                return;
              }
              // Try to parse the error as JSON only if it's not the missing table error
              try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
              } catch (jsonError) {
                throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}...`);
              }
            } else {
              const errorData = await response.json();
              throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
          }
          
          const data: WatchlistNewsResponse = await response.json();
          // Convert to proper WatchlistNewsData type
          const categoriesData: WatchlistNewsData = data.categories as unknown as WatchlistNewsData;
          setWatchlistNews(categoriesData);
        } catch (error: any) {
          console.error("Error fetching watchlist news:", error);
          setWatchlistNewsError(`Failed to load watchlist news: ${error.message}`);
        }
      } catch (outerError: any) {
        console.error("Outer error handling watchlist news:", outerError);
      }
      setIsLoadingWatchlistNews(false);
    };

    fetchWatchlistNews();
  }, []);

  // Function to toggle watchlist selection
  const toggleWatchlistItem = (item: string) => {
    setWatchlist(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  // Function to simulate audio playback
  const handleReadSummary = () => {
    setIsPlaying(true);
    
    // Simulate audio playback delay
    setTimeout(() => {
      setIsPlaying(false);
    }, 3000);
    
    // Future implementation would connect to a text-to-speech service
  };

  // Function to get source initials for logos
  const getSourceInitials = (source: string): string => {
    if (!source) return '?';
    
    // Handle domain-like sources by removing common TLDs and prefixes
    if (source.includes('.')) {
      const cleanSource = source.replace(/^(www\.)|(^api\.)|(\.(com|org|net|io|co|ai|news|finance|money|app|xyz|gov|edu|biz|info|capital|markets|invest|trading|bloomberg|reuters|cnbc|wsj|ft))$/gi, '');
      return cleanSource.substring(0, 2).toUpperCase();
    }
    
    // Handle normal names by taking first letter of each word
    return source.split(' ').map(word => word[0]).join('').toUpperCase();
  };

  // Function to get a color based on source name (for consistent coloring)
  const getSourceColor = (source: string): string => {
    const colors = [
      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
      'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
      'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
    ];
    
    // Hash the source name to get a consistent index
    const hash = source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Format a category name for display (handling camelCase)
  const formatCategoryName = (category: string): string => {
    // Special cases for shorter display names
    if (category === 'globalMarkets') return 'Global';
    if (category === 'fixedIncome') return 'Bonds';
    if (category === 'technology') return 'Tech';
    if (category === 'realEstate') return 'Real Estate';
    if (category === 'macroeconomic') return 'Macro';
    if (category === 'commodities') return 'Commodities';
    
    // Add space before capital letters and uppercase the first letter
    return category
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  };
  
  // Get all watchlist news items from selected categories
  const getFilteredWatchlistNews = () => {
    const allNews: (WatchlistNewsItem & { category: string })[] = [];
    
    // Debug log selected categories
    const selectedCategories = Object.entries(watchlist)
      .filter(([_, isSelected]) => isSelected)
      .map(([category]) => category);
    
    // Iterate through all categories
    Object.entries(watchlist).forEach(([category, isSelected]) => {
      // Only include news from selected categories
      if (isSelected && watchlistNews[category]) {
        
        // Add category info to each news item
        const newsWithCategory = watchlistNews[category]
          .filter(item => item && item.title && item.source) // Ensure item has required fields
          .map(item => ({
            ...item,
            category,
            // Ensure required fields have fallback values
            url: item.url || '#',
            title: item.title || 'Untitled Article',
            source: item.source || 'Unknown Source'
          }));
        
        allNews.push(...newsWithCategory);
      }
    });
    
    
    // Sort by published date if available (most recent first)
    return allNews.sort((a, b) => {
      if (a.published_at && b.published_at) {
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      }
      return 0;
    });
  };
  
  // Organize categories into rows
  const categoryRows = [
    // Single flat array of all categories
    ['globalMarkets', 'crypto', 'commodities', 'fixedIncome', 'forex', 'energy', 'financials', 'healthcare', 'technology', 'consumer', 'realEstate', 'esg', 'macroeconomic']
  ];

  return (
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-4 space-y-6 bg-background text-foreground w-full min-h-full">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Financial News and Analysis</h1>
            <h2 className="text-lg text-muted-foreground mt-1">How the world is impacting your investments today</h2>
          </div>
        </div>

        {accountError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Account Error</AlertTitle>
            <AlertDescription>
              {accountError}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content Grid - Responsive Layout */}
        <div className={`grid grid-cols-1 gap-6 ${
          sideChatVisible 
            ? '2xl:grid-cols-5' // When chat is open, only go horizontal on 2xl+ screens
            : 'xl:grid-cols-5' // When chat is closed, use standard xl breakpoint
        }`}>
          {/* Left Section - Portfolio News (3 columns on xl screens) */}
          <div className={`flex flex-col ${
            sideChatVisible 
              ? '2xl:col-span-3' // When chat is open, take 3/5 of the 2xl grid
              : 'xl:col-span-3' // When chat is closed, take 3/5 of the xl grid
          }`}>
            <PortfolioNewsSummaryWithAssist
              portfolioSummary={portfolioSummary}
              isLoadingSummary={isLoadingSummary}
              summaryError={summaryError}
              isPlaying={isPlaying}
              onReadSummary={handleReadSummary}
              WatchlistNewsItemClient={WatchlistNewsItemClient}
              disabled={!portfolioSummary}
            />
          </div>

          {/* Right Section - Trending & Watchlist (2 columns on xl screens) */}
          <div className={`flex flex-col space-y-6 ${
            sideChatVisible 
              ? '2xl:col-span-2' // When chat is open, take 2/5 of the 2xl grid
              : 'xl:col-span-2' // When chat is closed, take 2/5 of the xl grid
          }`}>
            <TrendingNewsWithAssist
              trendingNews={trendingNews}
              isLoading={isLoadingTrendingNews}
              error={trendingNewsError}
              disabled={false}
              getSourceInitials={getSourceInitials}
              getSourceColor={getSourceColor}
            />

            <NewsWatchlistWithAssist
              watchlist={watchlist}
              watchlistNews={watchlistNews}
              categoryRows={categoryRows}
              isLoading={isLoadingWatchlistNews}
              error={watchlistNewsError}
              disabled={false}
              toggleWatchlistItem={toggleWatchlistItem}
              formatCategoryName={formatCategoryName}
              getSourceInitials={getSourceInitials}
              getSourceColor={getSourceColor}
              getFilteredWatchlistNews={getFilteredWatchlistNews}
            />
          </div>
        </div>

        {/* Market Environment Section - Full Width */}
        <div className="mt-8">
          <MarketEnvironment />
        </div>
      </div>
    </div>
  );
} 