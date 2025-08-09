"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, AlertCircle } from "lucide-react";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';

interface WatchlistNewsItem {
  title: string;
  source: string;
  url?: string;
  published_at?: string;
  banner_image?: string;
  summary?: string;
  sentiment_score?: number;
  sentiment_label?: string;
  category?: string;
  logo_url?: string;
}

interface WatchlistCategories {
  globalMarkets: boolean;
  crypto: boolean;
  commodities: boolean;
  fixedIncome: boolean;
  forex: boolean;
  energy: boolean;
  financials: boolean;
  healthcare: boolean;
  technology: boolean;
  consumer: boolean;
  realEstate: boolean;
  esg: boolean;
  macroeconomic: boolean;
  [key: string]: boolean;
}

interface WatchlistNewsData {
  globalMarkets: WatchlistNewsItem[];
  crypto: WatchlistNewsItem[];
  commodities: WatchlistNewsItem[];
  fixedIncome: WatchlistNewsItem[];
  forex: WatchlistNewsItem[];
  energy: WatchlistNewsItem[];
  financials: WatchlistNewsItem[];
  healthcare: WatchlistNewsItem[];
  technology: WatchlistNewsItem[];
  consumer: WatchlistNewsItem[];
  realEstate: WatchlistNewsItem[];
  esg: WatchlistNewsItem[];
  macroeconomic: WatchlistNewsItem[];
  [key: string]: WatchlistNewsItem[];
}

interface NewsWatchlistWithAssistProps {
  watchlist: WatchlistCategories;
  watchlistNews: WatchlistNewsData;
  categoryRows: string[][];
  isLoading: boolean;
  error: string | null;
  disabled?: boolean;
  toggleWatchlistItem: (item: string) => void;
  formatCategoryName: (category: string) => string;
  getSourceInitials: (source: string) => string;
  getSourceColor: (source: string) => string;
  getFilteredWatchlistNews: () => WatchlistNewsItem[];
}

const NewsWatchlistWithAssist: React.FC<NewsWatchlistWithAssistProps> = ({
  watchlist,
  watchlistNews,
  categoryRows,
  isLoading,
  error,
  disabled = false,
  toggleWatchlistItem,
  formatCategoryName,
  getSourceInitials,
  getSourceColor,
  getFilteredWatchlistNews
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Extract watchlist context for dynamic prompts
  const selectedCategories = Object.entries(watchlist).filter(([_, selected]) => selected).map(([category, _]) => category);
  const numSelectedCategories = selectedCategories.length;
  const hasSelectedCategories = numSelectedCategories > 0;
  const filteredNews = getFilteredWatchlistNews();
  
  const watchlistContext = hasSelectedCategories 
    ? `following ${numSelectedCategories} categories: ${selectedCategories.slice(0, 3).join(', ')}${selectedCategories.length > 3 ? ' and others' : ''}`
    : "no categories selected yet";
  
  const diversificationContext = numSelectedCategories >= 5 ? "good diversification across sectors"
    : numSelectedCategories >= 3 ? "moderate diversification"
    : numSelectedCategories >= 1 ? "focused on specific areas"
    : "no areas selected";

  // Create contextual prompt with watchlist analysis
  const generatePrompt = useContextualPrompt(
    "Given my news watchlist ({watchlistContext}, {diversificationContext}), recommend which sectors to follow and which to drop to stay informed without noise.\n\nAvailable sectors: {availableSectors}\nCurrently selected: {selectedSectors}",
    "news_watchlist_optimization",
    {
      watchlistContext: watchlistContext,
      diversificationContext: diversificationContext,
      numCategories: numSelectedCategories.toString(),
      availableSectors: Object.keys(watchlist).map(category => formatCategoryName(category)).join(', '),
      selectedSectors: hasSelectedCategories 
        ? selectedCategories.map(category => formatCategoryName(category)).join(', ')
        : "None selected yet"
    }
  );

  const getContextualPrompt = () => {
    if (disabled) {
      return "I'm interested in learning about different market sectors and financial news categories. Can you explain which areas young investors should follow and how to build investment knowledge through focused news consumption?";
    }
    
    if (!hasSelectedCategories) {
      return "I haven't selected any categories yet. Suggest a small set of sectors to follow that will give good coverage without overwhelm, and explain why.";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (disabled) return "Learn about sectors";
    if (!hasSelectedCategories) return "Which sectors to follow?";
    return "Optimize my selections";
  };

  const getDescription = () => {
    if (disabled) return "Learn about different investment sectors and market categories";
    if (!hasSelectedCategories) return "Get guidance on which market sectors to follow for investment insights";
    return "Get recommendations on which sectors to add or remove from your watchlist";
  };

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="flex-[0.8]">
        <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
          <CardTitle className="flex items-center text-lg">
            <Eye className="mr-2 h-4 w-4" />
            Your News Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {/* Category selection grid */}
          <div className="mb-3">
            <ScrollArea className="max-h-[160px]">
              <div className="pb-2">
                {categoryRows.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap gap-2 mb-2">
                    {row.map((category) => (
                      <Badge 
                        key={category} 
                        variant={watchlist[category] ? "default" : "outline"}
                        className="cursor-pointer text-xs px-2 py-1 hover:bg-accent transition-colors"
                        onClick={() => toggleWatchlistItem(category)}
                      >
                        {formatCategoryName(category)}
                        {watchlist[category] ? " ✓" : ""}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          {/* Watchlist News Items */}
          {isLoading && (
            <div className="flex items-center space-x-2 text-muted-foreground text-sm py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading watchlist news...</span>
            </div>
          )}
          
          {error && !isLoading && (
            <Alert variant="destructive" className="text-xs p-2 my-2">
              <AlertCircle className="h-3 w-3 mr-1" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {!isLoading && !error && (
            <ScrollArea 
              className="h-[240px] pr-2" 
              style={{
                "--scrollbar-foreground": "rgba(255, 255, 255, 0.7)",
                "--scrollbar-background": "rgba(255, 255, 255, 0.1)"
              } as React.CSSProperties}
            >
              <div className="space-y-2">
                {filteredNews.map((item, index) => (
                  <a 
                    key={`${item.category}-${index}`} 
                    href={item.url || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-3 border border-muted rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Left Column: Category, Logo and Source */}
                      <div className="flex flex-col items-start gap-1.5 min-w-[100px] max-w-[100px]">
                        {/* Category Badge */}
                        <Badge variant="secondary" className="text-xs whitespace-nowrap mb-1">
                          {formatCategoryName(item.category || '')}
                        </Badge>
                        
                        {/* Source with Logo */}
                        <div className="flex items-center gap-1.5">
                          {/* Publisher Logo or Fallback */}
                          {item.logo_url ? (
                            <img 
                              src={item.logo_url} 
                              alt={item.source}
                              className="w-4 h-4 rounded-sm object-contain" 
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                if (target.nextElementSibling) {
                                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className={`w-4 h-4 rounded-sm flex items-center justify-center ${getSourceColor(item.source || '')} ${item.logo_url ? 'hidden' : ''}`}>
                            <span className="font-semibold text-[10px]">{getSourceInitials(item.source || '')}</span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[70px]">{item.source}</div>
                        </div>
                      </div>
                      
                      {/* Right Column: Article Title */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-2">{item.title}</div>
                      </div>
                    </div>
                  </a>
                ))}
                
                {filteredNews.length === 0 && (
                  <div className="text-center py-8 px-3 border border-dashed border-muted rounded-md">
                    {Object.values(watchlist).some(selected => selected) ? (
                      <p className="text-muted-foreground text-sm">
                        No news available in your selected categories.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <h3 className="text-base font-medium">Welcome to Your News Watchlist!</h3>
                        <p className="text-muted-foreground text-sm">
                          Select categories above to view relevant financial news tailored to your interests.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Your News Watchlist"
      content="Sector and topic focused news categories"
      context="news_watchlist_optimization"
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "news_watchlist_optimization")}
      disabled={disabled}
      className="flex-[0.8]"
    >
      <div className="p-3 pt-0">
        {/* Category selection grid */}
        <div className="mb-3">
          <ScrollArea className="max-h-[160px]">
            <div className="pb-2">
              {categoryRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex flex-wrap gap-2 mb-2">
                  {row.map((category) => (
                    <Badge 
                      key={category} 
                      variant={watchlist[category] ? "default" : "outline"}
                      className="cursor-pointer text-xs px-2 py-1 hover:bg-accent transition-colors"
                      onClick={() => toggleWatchlistItem(category)}
                    >
                      {formatCategoryName(category)}
                      {watchlist[category] ? " ✓" : ""}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {/* Watchlist News Items */}
        {isLoading && (
          <div className="flex items-center space-x-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading watchlist news...</span>
          </div>
        )}
        
        {error && !isLoading && (
          <Alert variant="destructive" className="text-xs p-2 my-2">
            <AlertCircle className="h-3 w-3 mr-1" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {!isLoading && !error && (
          <ScrollArea 
            className="h-[240px] pr-2" 
            style={{
              "--scrollbar-foreground": "rgba(255, 255, 255, 0.7)",
              "--scrollbar-background": "rgba(255, 255, 255, 0.1)"
            } as React.CSSProperties}
          >
            <div className="space-y-2">
              {filteredNews.map((item, index) => (
                <a 
                  key={`${item.category}-${index}`} 
                  href={item.url || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-3 border border-muted rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Left Column: Category, Logo and Source */}
                    <div className="flex flex-col items-start gap-1.5 min-w-[100px] max-w-[100px]">
                      {/* Category Badge */}
                      <Badge variant="secondary" className="text-xs whitespace-nowrap mb-1">
                        {formatCategoryName(item.category || '')}
                      </Badge>
                      
                      {/* Source with Logo */}
                      <div className="flex items-center gap-1.5">
                        {/* Publisher Logo or Fallback */}
                        {item.logo_url ? (
                          <img 
                            src={item.logo_url} 
                            alt={item.source}
                            className="w-4 h-4 rounded-sm object-contain" 
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-4 h-4 rounded-sm flex items-center justify-center ${getSourceColor(item.source || '')} ${item.logo_url ? 'hidden' : ''}`}>
                          <span className="font-semibold text-[10px]">{getSourceInitials(item.source || '')}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[70px]">{item.source}</div>
                      </div>
                    </div>
                    
                    {/* Right Column: Article Title */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium line-clamp-2">{item.title}</div>
                    </div>
                  </div>
                </a>
              ))}
              
              {filteredNews.length === 0 && (
                <div className="text-center py-8 px-3 border border-dashed border-muted rounded-md">
                  {Object.values(watchlist).some(selected => selected) ? (
                    <p className="text-muted-foreground text-sm">
                      No news available in your selected categories.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-base font-medium">Welcome to Your News Watchlist!</h3>
                      <p className="text-muted-foreground text-sm">
                        Select categories above to view relevant financial news tailored to your interests.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </CleraAssistCard>
  );
};

export default NewsWatchlistWithAssist; 