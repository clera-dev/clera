"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Globe, TrendingUp, Eye, ArrowDown, ArrowUp, Volume2, Loader2, Search, Plus, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SideBySideLayout from '@/components/SideBySideLayout';
import { getAlpacaAccountId } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

interface NewsItem {
  source: string;
  title: string;
  sentiment?: 'positive' | 'negative';
  icon?: string;
  trend?: 'up' | 'down';
}

interface WatchlistNewsItem {
  title: string;
  source: string;
}

interface WatchlistCategories {
  tech: boolean;
  finance: boolean;
  crypto: boolean;
  commodities: boolean;
  globalMarkets: boolean;
  [key: string]: boolean; // Add index signature for dynamic properties
}

interface WatchlistNewsData {
  tech: WatchlistNewsItem[];
  finance: WatchlistNewsItem[];
  crypto: WatchlistNewsItem[];
  commodities: WatchlistNewsItem[];
  globalMarkets: WatchlistNewsItem[];
  [key: string]: WatchlistNewsItem[]; // Add index signature for dynamic properties
}

export default function NewsPage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingAccountData, setIsLoadingAccountData] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistCategories>({
    tech: true,
    finance: true,
    crypto: false,
    commodities: true,
    globalMarkets: false,
  });

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
        
        // Get Alpaca Account ID
        const fetchedAccountId = await getAlpacaAccountId();
        if (!fetchedAccountId) {
          console.error("Alpaca Account ID not found");
          setAccountError("Alpaca account setup not complete. Some features may be limited.");
          return;
        }
        
        setAccountId(fetchedAccountId);
      } catch (error) {
        console.error("Error fetching user or account data:", error);
        setAccountError("Failed to load user data. Please refresh the page.");
      } finally {
        setIsLoadingAccountData(false);
      }
    };

    fetchUserAndAccountData();
  }, []);

  // Available sectors/industries for search (mock data)
  const availableSectors = [
    "tech", "finance", "crypto", "commodities", "globalMarkets",
    "healthcare", "energy", "realestate", "automotive", "aerospace",
    "telecom", "media", "retail", "manufacturing", "biotech",
    "agriculture", "transportation", "utilities", "mining"
  ];

  // Mock data for UI development - will be replaced with API calls
  const portfolioNews: NewsItem[] = [
    {
      source: "WSJ",
      title: "Deepseek's Heyday Over: Cyber Attack Costs Millions",
      sentiment: "negative",
      trend: "down"
    },
    {
      source: "MarketWatch",
      title: "S&P Futures Remain High, Despite Down Week",
      sentiment: "positive",
      trend: "up"
    },
    {
      source: "WSJ",
      title: "Consumer Discretionary Stocks Poised to Make Come Back",
      sentiment: "positive",
      trend: "up"
    }
  ];

  const trendingNews: NewsItem[] = [
    {
      source: "Yahoo Finance",
      title: "Open AI Releases Model to Rival Deepseek"
    },
    {
      source: "WSJ",
      title: "Justin Trudeau Speaks on US Relations"
    },
    {
      source: "NYT",
      title: "UNH Finds its Way: New CEO Tim Noel"
    },
    {
      source: "Bloomberg",
      title: "Elon Musk Cuts $200B in Gov. Spending"
    },
    {
      source: "WSJ",
      title: "Energy Stocks Tumble Amidst AI Crisis"
    },
    {
      source: "MarketWatch",
      title: "Trump at Davos: Oil Prices Surge"
    },
    {
      source: "Yahoo Finance",
      title: "Deepseek's R1 Uproots Open AI"
    }
  ];

  // Watchlist news mock data
  const [watchlistNews, setWatchlistNews] = useState<WatchlistNewsData>({
    tech: [
      { title: "Apple's New AI Features Set to Transform User Experience", source: "TechCrunch" },
      { title: "Google Cloud Expands Enterprise AI Solutions", source: "CNBC" }
    ],
    finance: [
      { title: "Fed Signals Potential Rate Cuts in Coming Months", source: "WSJ" },
      { title: "Global Banking Regulations Tighten Amid Market Volatility", source: "Financial Times" }
    ],
    crypto: [
      { title: "Bitcoin Surpasses $70,000 Milestone", source: "CoinDesk" },
      { title: "Ethereum Upgrade Set for Q3 2024", source: "Cointelegraph" }
    ],
    commodities: [
      { title: "Gold Prices Rally as Inflation Concerns Persist", source: "Reuters" },
      { title: "Oil Markets Stabilize Following OPEC+ Decision", source: "Bloomberg" }
    ],
    globalMarkets: [
      { title: "Asian Markets Rally Despite Economic Headwinds", source: "Nikkei" },
      { title: "European Exchanges See Recovery in Tech Sector", source: "EuroNews" }
    ],
    // Additional sectors will be added dynamically
  });

  // Function to toggle watchlist items
  const toggleWatchlistItem = (item: string) => {
    setWatchlist(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  // Function to handle search
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    
    // Filter available sectors based on search term
    const results = availableSectors.filter(sector => 
      sector.toLowerCase().includes(searchTerm.toLowerCase()) && 
      !Object.keys(watchlist).includes(sector)
    );
    
    // Simulate API delay
    setTimeout(() => {
      setSearchResults(results);
      setIsSearching(false);
    }, 500);
  };

  // Function to add a new sector to watchlist
  const addSectorToWatchlist = (sector: string) => {
    // Add to watchlist state
    setWatchlist(prev => ({
      ...prev,
      [sector]: true
    }));
    
    // Add mock news for the new sector
    setWatchlistNews(prev => ({
      ...prev,
      [sector]: [
        { 
          title: `Latest developments in ${sector.replace(/([A-Z])/g, ' $1').trim()}`, 
          source: "Clera News" 
        },
        { 
          title: `${sector.replace(/([A-Z])/g, ' $1').trim().charAt(0).toUpperCase() + sector.replace(/([A-Z])/g, ' $1').trim().slice(1)} sector outlook for 2024`, 
          source: "Market Analysis" 
        }
      ]
    }));
    
    // Clear search
    setSearchTerm("");
    setSearchResults([]);
  };

  // Function to simulate audio playback
  const handleReadSummary = () => {
    setIsPlaying(true);
    
    // Simulate audio playback delay
    setTimeout(() => {
      setIsPlaying(false);
    }, 3000);
    
    // Future implementation would connect to a text-to-speech service
    console.log("Reading summary aloud...");
  };

  // Function to get source initials for logos
  const getSourceInitials = (source: string): string => {
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

  // Handle search when search term changes or Enter key is pressed
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchTerm) {
        handleSearch();
      }
    }, 300);
    
    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  return (
    <SideBySideLayout isChatOpen={isChatOpen} onCloseSideChat={() => setIsChatOpen(false)}>
      <div className="p-4 space-y-4 bg-background text-foreground w-full min-h-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Financial News and Analysis</h1>
            <h2 className="text-lg text-muted-foreground">How the world is impacting your investments today?</h2>
          </div>
        </div>

        {accountError && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Account Error</AlertTitle>
            <AlertDescription>
              {accountError}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 h-[calc(100vh-140px)]">
          {/* Left Section - 3 columns on large screens, full width on mobile */}
          <div className="lg:col-span-3 h-full flex flex-col">
            <Card className="flex-1 flex flex-col h-full">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 px-4">
                <CardTitle className="flex items-center text-lg">
                  <Globe className="mr-2 h-4 w-4" />
                  News Impacting Your Portfolio
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden p-3 pt-0">
                <div className="space-y-1 mb-2">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-medium">Your Summary:</p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="rounded-full h-7 w-7 p-0" 
                      onClick={handleReadSummary}
                      disabled={isPlaying}
                      title="Have Clera read summary aloud"
                    >
                      {isPlaying ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-primary" />
                      )}
                      <span className="sr-only">Read summary aloud</span>
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Recent news brings mixed effects on your portfolio. The cyberattack on Deepseek could hurt tech investments, 
                    while steady S&P futures show that most stocks might stay strong. Consumer Discretionary stocks are expected 
                    to bounce back, but since your portfolio has less money in this area, it might be a missed chance to make gains.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                  {portfolioNews.map((news, index) => (
                    <div 
                      key={index} 
                      className={`p-2 sm:p-3 rounded-lg border flex justify-between items-center ${
                        news.sentiment === 'negative' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 
                        'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                      }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center mr-2 ${getSourceColor(news.source)}`}>
                          <span className="font-semibold text-xs">{getSourceInitials(news.source)}</span>
                        </div>
                        <span className="font-medium text-sm">{news.title}</span>
                      </div>
                      <div className={`flex items-center ${
                        news.trend === 'down' ? 'text-red-500' : 'text-green-500'
                      } ml-2 flex-shrink-0`}>
                        {news.trend === 'down' ? 
                          <ArrowDown className="h-4 w-4" /> : 
                          <ArrowUp className="h-4 w-4" />
                        }
                      </div>
                    </div>
                  ))}
                  
                  {/* Additional news items */}
                  <div className="p-2 sm:p-3 rounded-lg border flex justify-between items-center bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                    <div className="flex items-center">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center mr-2 ${getSourceColor("CNBC")}`}>
                        <span className="font-semibold text-xs">{getSourceInitials("CNBC")}</span>
                      </div>
                      <span className="font-medium text-sm">Tech Sector Sees Record Growth Despite Market Concerns</span>
                    </div>
                    <div className="flex items-center text-green-500 ml-2 flex-shrink-0">
                      <ArrowUp className="h-4 w-4" />
                    </div>
                  </div>
                  
                  <div className="p-2 sm:p-3 rounded-lg border flex justify-between items-center bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                    <div className="flex items-center">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center mr-2 ${getSourceColor("Bloomberg")}`}>
                        <span className="font-semibold text-xs">{getSourceInitials("Bloomberg")}</span>
                      </div>
                      <span className="font-medium text-sm">Global Banking Leaders Agree on New Fintech Standards</span>
                    </div>
                    <div className="flex items-center text-green-500 ml-2 flex-shrink-0">
                      <ArrowUp className="h-4 w-4" />
                    </div>
                  </div>
                  
                  <div className="p-2 sm:p-3 rounded-lg border flex justify-between items-center bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                    <div className="flex items-center">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center mr-2 ${getSourceColor("Reuters")}`}>
                        <span className="font-semibold text-xs">{getSourceInitials("Reuters")}</span>
                      </div>
                      <span className="font-medium text-sm">Chip Shortage Continues to Impact Global Tech Supply Chain</span>
                    </div>
                    <div className="flex items-center text-red-500 ml-2 flex-shrink-0">
                      <ArrowDown className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Section - 2 columns on large screens, full width on mobile */}
          <div className="lg:col-span-2 h-full flex flex-col space-y-3">
            <Card className="flex-1">
              <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
                <CardTitle className="flex items-center text-lg">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Trending Market News
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 overflow-y-auto p-3 pt-0">
                <div className="space-y-2">
                  {trendingNews.map((news, index) => (
                    <div key={index} className="p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${getSourceColor(news.source)}`}>
                          <span className="font-semibold text-xs">{getSourceInitials(news.source)}</span>
                        </div>
                        <span className="font-medium text-xs sm:text-sm">{news.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="flex-[0.8]">
              <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
                <CardTitle className="flex items-center text-lg">
                  <Eye className="mr-2 h-4 w-4" />
                  Your News Watchlist
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {/* Search section to add new sectors */}
                <div className="mb-3">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search industries/sectors..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    {isSearching && (
                      <Loader2 className="absolute right-2.5 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  
                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="mt-1 border rounded-md p-1 max-h-24 overflow-y-auto bg-background">
                      {searchResults.map((result) => (
                        <div 
                          key={result} 
                          className="flex items-center justify-between p-1.5 hover:bg-accent rounded-sm cursor-pointer"
                          onClick={() => addSectorToWatchlist(result)}
                        >
                          <span className="text-xs">{result.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                            <Plus className="h-3 w-3" />
                            <span className="sr-only">Add {result}</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchTerm && searchResults.length === 0 && !isSearching && (
                    <div className="mt-1 text-xs text-muted-foreground text-center py-2">
                      No matching sectors found
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  {Object.entries(watchlist).map(([key, value]) => (
                    <Badge 
                      key={key} 
                      variant={value ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleWatchlistItem(key)}
                    >
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                      {value ? " ✓" : ""}
                    </Badge>
                  ))}
                </div>

                <Tabs defaultValue="tech" className="w-full">
                  <TabsList className="grid grid-cols-3 h-8">
                    <TabsTrigger value="tech" className="text-xs">Tech</TabsTrigger>
                    <TabsTrigger value="finance" className="text-xs">Finance</TabsTrigger>
                    <TabsTrigger value="commodities" className="text-xs">Commodities</TabsTrigger>
                  </TabsList>
                  {(Object.entries(watchlistNews) as [string, WatchlistNewsItem[]][]).map(([category, news]) => (
                    <TabsContent key={category} value={category} className="mt-2 max-h-[160px] overflow-y-auto">
                      {watchlist[category] ? (
                        <div className="space-y-2">
                          {news.map((item, i) => (
                            <div key={i} className="p-2 border rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center ${getSourceColor(item.source)}`}>
                                  <span className="font-semibold text-xs">{getSourceInitials(item.source)}</span>
                                </div>
                                <div className="text-xs font-medium">{item.title}</div>
                              </div>
                              <div className="text-xs text-muted-foreground ml-7 mt-1">{item.source}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-xs">Add {category} to your watchlist</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2 text-xs h-7"
                            onClick={() => toggleWatchlistItem(category)}
                          >
                            Add to watchlist
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SideBySideLayout>
  );
} 