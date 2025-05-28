"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Loader2, AlertCircle } from "lucide-react";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';

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
  
  // Extract news context for dynamic prompts
  const hasNews = trendingNews.length > 0;
  const newsCount = trendingNews.length;
  const hasMarketMovingNews = trendingNews.some(news => 
    news.topics?.some(topic => 
      ['earnings', 'fed', 'inflation', 'jobs', 'gdp'].some(keyword => 
        topic.toLowerCase().includes(keyword)
      )
    )
  );
  
  const sentimentContext = hasNews ? 
    trendingNews.some(news => news.sentiment_score > 0.3) ? "positive market sentiment" :
    trendingNews.some(news => news.sentiment_score < -0.3) ? "negative market sentiment" :
    "mixed market sentiment" : "neutral sentiment";

  // Create contextual prompt with news analysis
  const generatePrompt = useContextualPrompt(
    "I'm looking at trending market news with {newsCount} articles. Can you analyze these specific headlines and explain what they might mean for the market and my investments?\n\n<trending_news_headlines>\n{newsHeadlines}\n</trending_news_headlines>\n\nPlease focus on the most important trends and actionable insights for me.",
    "trending_news_analysis",
    {
      newsCount: newsCount.toString(),
      sentimentContext: sentimentContext,
      newsHeadlines: hasNews 
        ? trendingNews.map(news => `- ${news.title} (${news.source})`).join('\n')
        : "No headlines available",
      marketContext: hasMarketMovingNews 
        ? "There appear to be some significant market-moving stories."
        : "The news seems to be mostly routine market updates."
    }
  );

  const getContextualPrompt = () => {
    if (disabled) {
      return "I'm interested in learning how to read financial news effectively. Can you explain what young investors should focus on when reading market news and how to avoid getting overwhelmed by daily market noise?";
    }
    
    if (!hasNews) {
      return "I'm looking at the trending news section but don't see any articles right now. Can you explain what kinds of financial news young investors should pay attention to and how to develop good news consumption habits for long-term investing?";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (disabled) return "Learn news analysis";
    if (!hasNews) return "Understanding market news";
    return "Analyze these headlines";
  };

  const getDescription = () => {
    if (disabled) return "Learn how to effectively analyze financial news and market trends";
    if (!hasNews) return "Understand what financial news matters for your investments";
    return "Get analysis of what these specific headlines mean for your investments";
  };

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
                trendingNews.map((news) => (
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
                          src={news.banner_image} 
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
                      <span className="font-medium text-xs sm:text-sm truncate">{news.title}</span>
                    </div>
                  </a>
                ))
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
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
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
              trendingNews.map((news) => (
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
                        src={news.banner_image} 
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
                    <span className="font-medium text-xs sm:text-sm truncate">{news.title}</span>
                  </div>
                </a>
              ))
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