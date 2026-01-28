"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Loader2, AlertCircle, Clock } from "lucide-react";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
import { useMemo } from 'react';

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
  
  // Helper function to generate proxied image URL
  const getProxiedImageUrl = (imageUrl: string): string => {
    if (!imageUrl) return '';
    return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  };
  
  // Format relative time - rounded to nearest 5 minutes
  const getRelativeTime = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      // Round minutes to nearest 5
      const roundedMins = Math.round(diffMins / 5) * 5;
      
      if (diffMins < 60) return `${roundedMins || 5}m`; // Minimum 5m
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };
  
  
  // Memoize prompt and UI text generation
  const { contextualPrompt, triggerText, description } = useMemo(() => {
    const selectedCategories = Object.entries(watchlist).filter(([_, selected]) => selected).map(([category, _]) => category);
    const numSelectedCategories = selectedCategories.length;
    const hasSelectedCategories = numSelectedCategories > 0;
    
    if (disabled) {
      return {
        contextualPrompt: "Can you explain the different market sectors and news categories? I'd like to know which areas are worth following based on my investment interests.",
        triggerText: "Learn sectors",
        description: "Understand different investment sectors and categories"
      };
    }
    
    if (!hasSelectedCategories) {
      return {
        contextualPrompt: `I haven't selected any news categories. Based on my portfolio holdings, which 3-5 sectors would be most relevant for me to follow?`,
        triggerText: "Choose sectors",
        description: "Get sector recommendations based on your holdings"
      };
    }
    
    // Build concise watchlist prompt
    const selectedList = selectedCategories.map(c => formatCategoryName(c)).join(', ');
    
    let prompt = `I'm following ${numSelectedCategories} news categories: ${selectedList}. `;
    prompt += `Based on my actual portfolio holdings, am I following the right sectors? `;
    prompt += `Should I add or remove any to better match what I own?`;
    
    return {
      contextualPrompt: prompt,
      triggerText: "Optimize this",
      description: "Match your news feed to your actual holdings"
    };
  }, [watchlist, watchlistNews, disabled, formatCategoryName]);
  
  // Get filtered news for display
  const filteredNews = getFilteredWatchlistNews();

  // Render category pill - clean black/white aesthetic
  const renderCategoryPill = (category: string) => {
    const isSelected = watchlist[category];
    
    return (
      <button
        key={category}
        onClick={() => toggleWatchlistItem(category)}
        className={`
          px-3 py-1.5 rounded-full text-xs font-medium
          transition-all duration-200
          ${isSelected 
            ? 'bg-white text-black' 
            : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }
        `}
      >
        {formatCategoryName(category)}
        {isSelected && <span className="ml-1">✓</span>}
      </button>
    );
  };

  // Render news content (shared between both card variants)
  const renderNewsContent = () => (
    <div className="space-y-4">
      {/* Category selection grid with gradients */}
      <div className="mb-4">
        <ScrollArea className="max-h-[140px]">
          <div className="flex flex-wrap gap-2 pb-2">
            {categoryRows.flat().map((category) => renderCategoryPill(category))}
          </div>
        </ScrollArea>
      </div>
      
      {/* Watchlist News Items */}
      {isLoading && (
        <div className="flex items-center space-x-2 text-muted-foreground text-sm py-6 justify-center">
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
          className="h-[220px] pr-2" 
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
                  className="flex gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-white/10">
                    {item.banner_image ? (
                      <img 
                        src={getProxiedImageUrl(item.banner_image)} 
                        alt={item.source}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : item.logo_url ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <img 
                          src={item.logo_url} 
                          alt={item.source}
                          className="w-8 h-8 object-contain" 
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-bold text-lg text-white/60">{getSourceInitials(item.source || '')}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h4 className="font-medium text-sm text-gray-100 leading-tight line-clamp-2 group-hover:text-blue-200 transition-colors">
                      {item.title}
                    </h4>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span className="truncate max-w-[80px]">{item.source}</span>
                      {item.published_at && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {getRelativeTime(item.published_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </a>
            ))}
            
            {filteredNews.length === 0 && (
              <div className="text-center py-8 px-3 border border-dashed border-white/10 rounded-lg bg-gradient-to-br from-white/5 to-transparent">
                {Object.values(watchlist).some(selected => selected) ? (
                  <p className="text-muted-foreground text-sm">
                    No news available in your selected categories.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <Eye className="w-8 h-8 mx-auto text-muted-foreground/50" />
                    <h3 className="text-base font-medium">Build Your Watchlist</h3>
                    <p className="text-muted-foreground text-sm">
                      Select categories above to view relevant financial news.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  if (!isEnabled) {
    // Fallback to original card when assist is disabled
    return (
      <Card className="flex-[0.8]">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="flex items-center text-lg">
            <Eye className="mr-2 h-5 w-5 text-purple-400" />
            Your News Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {renderNewsContent()}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Your News Watchlist"
      content="Sector and topic focused news categories"
      context="news_watchlist_optimization"
      prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "news_watchlist_optimization")}
      disabled={disabled}
      className="flex-[0.8]"
    >
      <div className="px-4 pb-4 pt-0">
        {renderNewsContent()}
      </div>
    </CleraAssistCard>
  );
};

export default NewsWatchlistWithAssist;
