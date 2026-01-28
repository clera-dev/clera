"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  
  // Maximum number of trending articles to display
  const MAX_TRENDING_ARTICLES = 7;
  
  // Helper function to generate proxied image URL
  const getProxiedImageUrl = (imageUrl: string): string => {
    if (!imageUrl) return '';
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

  // Separate featured article from the rest
  const featuredArticle = trendingNews.length > 0 ? trendingNews[0] : null;
  const secondaryArticles = trendingNews.slice(1, MAX_TRENDING_ARTICLES);

  // Render the news content (shared between both card variants)
  const renderNewsContent = () => (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center space-x-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading trending news...</span>
        </div>
      )}
      
      {error && !isLoading && (
        <Alert variant="destructive" className="text-xs p-2 my-2">
          <AlertCircle className="h-3 w-3 mr-1" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {!isLoading && !error && trendingNews.length > 0 && (
        <>
          {/* Featured/Hero Article */}
          {featuredArticle && (
            <a 
              href={featuredArticle.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 hover:border-white/20 transition-all duration-300">
                {/* Hero Image */}
                {featuredArticle.banner_image && (
                  <div className="relative h-44 w-full overflow-hidden">
                    <img 
                      src={getProxiedImageUrl(featuredArticle.banner_image)} 
                      alt={featuredArticle.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                    
                    {/* Featured badge - positioned at top left with solid background */}
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 shadow-lg px-3 py-1 text-sm font-semibold">
                        <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                        Featured
                      </Badge>
                    </div>
                  </div>
                )}
                
                {/* Content overlay */}
                <div className={`${featuredArticle.banner_image ? 'absolute bottom-0 left-0 right-0' : ''} p-4`}>
                  
                  {/* Title */}
                  <h3 className="font-semibold text-base sm:text-lg text-white leading-tight mb-2 line-clamp-2 group-hover:text-blue-200 transition-colors">
                    {featuredArticle.title}
                  </h3>
                  
                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-xs text-gray-300">
                    <span className="font-medium">{featuredArticle.source}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </a>
          )}

          {/* Secondary Articles Grid */}
          {secondaryArticles.length > 0 && (
            <div className="space-y-2">
              {secondaryArticles.map((news) => (
                <a 
                  key={news.id} 
                  href={news.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group"
                >
                  {/* Thumbnail - larger now */}
                  <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted/30">
                    {news.banner_image ? (
                      <img 
                        src={getProxiedImageUrl(news.banner_image)} 
                        alt={news.source}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.nextElementSibling) {
                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center ${getSourceColor(news.source)} ${news.banner_image ? 'hidden' : ''}`}>
                      <span className="font-bold text-lg text-white/80">{getSourceInitials(news.source)}</span>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-gray-100 leading-tight line-clamp-2 group-hover:text-blue-200 transition-colors">
                      {news.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <span>{news.source}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
      
      {!isLoading && !error && trendingNews.length === 0 && (
        <div className="text-center py-8">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">
            No trending news available at the moment.
          </p>
        </div>
      )}
    </div>
  );

  if (!isEnabled) {
    // Fallback to original card when assist is disabled
    return (
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="flex items-center text-lg">
            <TrendingUp className="mr-2 h-5 w-5 text-blue-400" />
            Trending Market News
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
      <div className="px-4 pb-4 pt-0">
        {renderNewsContent()}
      </div>
    </CleraAssistCard>
  );
};

export default TrendingNewsWithAssist;
