"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Loader2, AlertCircle } from "lucide-react";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
import { useMemo } from 'react';

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

interface TrendingNewsWithAssistProps {
  trendingNews: TrendingNewsItem[];
  isLoading: boolean;
  error: string | null;
  disabled?: boolean;
  getSourceInitials: (source: string) => string;
  getSourceColor: (source: string) => string;
}

const TrendingNewsWithAssist: React.FC<TrendingNewsWithAssistProps> = ({
  trendingNews,
  isLoading,
  error,
  disabled = false,
  getSourceInitials,
  getSourceColor
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Maximum number of trending articles to display to prevent layout issues
  const MAX_TRENDING_ARTICLES = 7;
  
  // Helper function to generate proxied image URL
  const getProxiedImageUrl = (imageUrl: string): string => {
    return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  };
  
  // Memoize all prompt and UI text generation
  const { contextualPrompt, triggerText, description } = useMemo(() => {
    if (disabled) {
      return {
        contextualPrompt: "How should I approach reading financial news? I want to stay informed without getting overwhelmed or reacting to every headline.",
        triggerText: "Learn about news",
        description: "Understand how to read financial news effectively"
      };
    }
    
    const hasNews = trendingNews.length > 0;
    
    if (!hasNews) {
      return {
        contextualPrompt: "No articles are loading right now. What types of news actually matter for long-term investing, and what can I safely ignore?",
        triggerText: "Learn market news",
        description: "Understand what financial news matters for your investments"
      };
    }
    
    const newsCount = trendingNews.length;
    
    // Categorize news by topic
    const marketMovingTopics = ['earnings', 'fed', 'inflation', 'jobs', 'gdp', 'interest rate', 'recession'];
    const marketMovingNews = trendingNews.filter(news => 
      news.topics?.some(topic => 
        marketMovingTopics.some(keyword => topic.toLowerCase().includes(keyword))
      ) || marketMovingTopics.some(keyword => news.title.toLowerCase().includes(keyword))
    );
    
    // Calculate overall sentiment
    const avgSentiment = trendingNews.reduce((sum, n) => sum + (n.sentiment_score || 0), 0) / newsCount;
    const sentimentLabel = avgSentiment > 0.15 ? "bullish" : avgSentiment < -0.15 ? "bearish" : "neutral";
    
    // Build concise trending news prompt  
    const topHeadlines = trendingNews.slice(0, 5).map(n => n.title).join('; ');
    
    let prompt = `There are ${newsCount} trending stories right now with ${sentimentLabel} sentiment overall. `;
    if (marketMovingNews.length > 0) {
      prompt += `${marketMovingNews.length} appear to be market-moving. `;
    }
    prompt += `\n\nTop headlines: ${topHeadlines}\n\n`;
    prompt += `Which of these stories are relevant to my portfolio? What should I pay attention to vs ignore?`;
    
    return {
      contextualPrompt: prompt,
      triggerText: "Analyze headlines",
      description: "Find out which headlines matter for your holdings"
    };
  }, [trendingNews, disabled]);

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between py-2 px-4">
          <CardTitle className="flex items-center text-lg">
            <TrendingUp className="mr-2 h-4 w-4" />
            Trending Market News
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 overflow-y-auto p-3 pt-0">
          {isLoading && (
            <div className="flex items-center space-x-2 text-muted-foreground text-sm py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading trending news...</span>
            </div>
          )}
          
          {error && !isLoading && (
            <Alert variant="destructive" className="text-xs p-2 my-2">
              <AlertCircle className="h-3 w-3 mr-1" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {!isLoading && !error && (
            <div className="space-y-2">
              {trendingNews.length > 0 ? (
                <>
                  {trendingNews.slice(0, MAX_TRENDING_ARTICLES).map((news) => (
                    <a 
                      key={news.id} 
                      href={news.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {news.banner_image ? (
                          <img 
                            src={getProxiedImageUrl(news.banner_image)} 
                            alt={news.source}
                            className="w-6 h-6 rounded-md object-cover" 
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${getSourceColor(news.source)} ${news.banner_image ? 'hidden' : ''}`}>
                          <span className="font-semibold text-xs">{getSourceInitials(news.source)}</span>
                        </div>
                        <span className="font-medium text-xs sm:text-sm line-clamp-2 leading-tight">{news.title}</span>
                      </div>
                    </a>
                  ))}
                  {trendingNews.length > MAX_TRENDING_ARTICLES && (
                    <p className="text-xs text-muted-foreground italic text-center">
                      Showing {MAX_TRENDING_ARTICLES} of {trendingNews.length} trending articles
                    </p>
                  )}
                </>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-4">
                  No trending news available at the moment.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Trending Market News"
      content="Latest financial news and market trends"
      context="trending_news_analysis"
        prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "trending_news_analysis")}
      disabled={disabled}
      className="flex-1"
    >
      <div className="px-2 overflow-y-auto p-3 pt-0">
        {isLoading && (
          <div className="flex items-center space-x-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading trending news...</span>
          </div>
        )}
        
        {error && !isLoading && (
          <Alert variant="destructive" className="text-xs p-2 my-2">
            <AlertCircle className="h-3 w-3 mr-1" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {!isLoading && !error && (
          <div className="space-y-2">
            {trendingNews.length > 0 ? (
              <>
                {trendingNews.slice(0, MAX_TRENDING_ARTICLES).map((news) => (
                  <a 
                    key={news.id} 
                    href={news.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {news.banner_image ? (
                        <img 
                          src={getProxiedImageUrl(news.banner_image)} 
                          alt={news.source}
                          className="w-6 h-6 rounded-md object-cover" 
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.nextElementSibling) {
                              (target.nextElementSibling as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center ${getSourceColor(news.source)} ${news.banner_image ? 'hidden' : ''}`}>
                        <span className="font-semibold text-xs">{getSourceInitials(news.source)}</span>
                      </div>
                                              <span className="font-medium text-xs sm:text-sm line-clamp-2 leading-tight">{news.title}</span>
                    </div>
                  </a>
                ))}
                {trendingNews.length > MAX_TRENDING_ARTICLES && (
                  <p className="text-xs text-muted-foreground italic text-center">
                    Showing {MAX_TRENDING_ARTICLES} of {trendingNews.length} trending articles
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-4">
                No trending news available at the moment.
              </p>
            )}
          </div>
        )}
      </div>
    </CleraAssistCard>
  );
};

export default TrendingNewsWithAssist; 