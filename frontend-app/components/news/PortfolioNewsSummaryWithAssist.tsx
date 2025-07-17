"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe, Volume2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';

interface EnrichedArticle {
  url: string;
  title: string;
  snippet: string;
  source: string;
  sentimentScore: number;
  used_for_paragraph: number | null;
  shouldDisplay?: boolean;
}

interface PortfolioSummaryData {
  summary_text: string;
  referenced_articles: EnrichedArticle[];
  generated_at: string;
  perplexity_model: string;
}

interface WatchlistNewsItemClientProps {
  title: string;
  source: string;
  sentimentScore: number;
  logoUrl?: string;
  ticker?: string;
  className?: string;
  articleUrl?: string;
}

interface PortfolioNewsSummaryWithAssistProps {
  portfolioSummary: PortfolioSummaryData | null;
  isLoadingSummary: boolean;
  summaryError: string | null;
  isPlaying: boolean;
  onReadSummary: () => void;
  WatchlistNewsItemClient: React.FC<WatchlistNewsItemClientProps>;
  disabled?: boolean; // Disable when no portfolio data
}

const PortfolioNewsSummaryWithAssist: React.FC<PortfolioNewsSummaryWithAssistProps> = ({
  portfolioSummary,
  isLoadingSummary,
  summaryError,
  isPlaying,
  onReadSummary,
  WatchlistNewsItemClient,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Maximum number of articles to display to prevent layout issues
  const MAX_PORTFOLIO_ARTICLES = 5;
  
  // Extract key data for dynamic prompts
  const articleCount = portfolioSummary?.referenced_articles?.length || 0;
  const hasPositiveNews = portfolioSummary?.referenced_articles?.some(article => article.sentimentScore > 0) || false;
  const hasNegativeNews = portfolioSummary?.referenced_articles?.some(article => article.sentimentScore < 0) || false;
  
  // Create contextual prompt with news analysis
  const generatePrompt = useContextualPrompt(
    "I'm reading my personalized portfolio news summary below. Can you briefly analyze how this specific news might impact my investments and suggest what I should watch for?\n\n<portfolio_news_summary>\n{summaryText}\n</portfolio_news_summary>\n\nPlease focus on the most important actionable insights and keep your response concise and practical.",
    "portfolio_news_analysis",
    {
      summaryText: portfolioSummary?.summary_text || "No summary available"
    }
  );

  // Different prompts based on content availability
  const getContextualPrompt = () => {
    if (!portfolioSummary || disabled) {
      return "I'm interested in understanding how market news affects my investments. Can you explain how to read financial news and what to look for?";
    }
    
    if (summaryError) {
      return "I'm having trouble accessing my personalized news summary. Can you help me understand what financial news I should be paying attention to as someone in my 20s who's actively building wealth?";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (!portfolioSummary || disabled) return "Get news guidance";
    if (summaryError) return "Ask about market news";
    return "Get actionable insights";
  };

  const getDescription = () => {
    if (!portfolioSummary || disabled) return "Learn how to read financial news";
    if (summaryError) return "Get help understanding what market news matters for you";
    return "Get specific analysis of how this news affects your investments and what actions to consider";
  };

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="flex-1 flex flex-col h-full">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 px-4">
          <CardTitle className="flex items-center text-lg">
            News Impacting Your Portfolio
            <Globe className="ml-2 h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden p-3 pt-0">
          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-between">
              <p className="text-base font-medium">Your Summary:</p>
            </div>
            {isLoadingSummary && (
              <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading your personalized summary...</span>
              </div>
            )}
            {summaryError && !isLoadingSummary && (
              <Alert variant="destructive" className="text-xs p-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                <AlertDescription>{summaryError}</AlertDescription>
              </Alert>
            )}
            {!isLoadingSummary && !summaryError && portfolioSummary && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p style={{ whiteSpace: 'pre-line' }}>
                  {portfolioSummary.summary_text.replace(/\\n/g, '\n')}
                </p>
                {/* Display Enriched Referenced Articles */}
                {portfolioSummary.referenced_articles.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">Sources Used:</p>
                    {portfolioSummary.referenced_articles
                      .filter(article => article.shouldDisplay !== false)
                      .slice(0, MAX_PORTFOLIO_ARTICLES)
                      .map((article, index) => (
                      <WatchlistNewsItemClient
                        key={`${article.url}-${index}`}
                        title={article.title || 'N/A'} 
                        source={article.source || 'Unknown source'} 
                        sentimentScore={article.sentimentScore} 
                        articleUrl={article.url}
                      />
                    ))}
                    {portfolioSummary.referenced_articles.filter(article => article.shouldDisplay !== false).length > MAX_PORTFOLIO_ARTICLES && (
                      <p className="text-xs text-muted-foreground italic">
                        Showing {MAX_PORTFOLIO_ARTICLES} of {portfolioSummary.referenced_articles.filter(article => article.shouldDisplay !== false).length} referenced articles
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm mt-2">
                    No specific articles were referenced for this summary.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="News Impacting Your Portfolio"
      content="Personalized market analysis and news summary"
      context="portfolio_news_summary"
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "portfolio_news_summary")}
      disabled={disabled}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        
        <div className="space-y-1 mb-2 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium">Your Summary:</p>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isLoadingSummary && (
              <div className="flex items-center space-x-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading your personalized summary...</span>
              </div>
            )}
            {summaryError && !isLoadingSummary && (
              <Alert variant="destructive" className="text-xs p-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                <AlertDescription>{summaryError}</AlertDescription>
              </Alert>
            )}
            {!isLoadingSummary && !summaryError && portfolioSummary && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p style={{ whiteSpace: 'pre-line' }}>
                  {portfolioSummary.summary_text.replace(/\\n/g, '\n')}
                </p>
                {/* Display Enriched Referenced Articles */}
                {portfolioSummary.referenced_articles.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">Sources Used:</p>
                    {portfolioSummary.referenced_articles
                      .filter(article => article.shouldDisplay !== false)
                      .slice(0, MAX_PORTFOLIO_ARTICLES)
                      .map((article, index) => (
                      <WatchlistNewsItemClient
                        key={`${article.url}-${index}`}
                        title={article.title || 'N/A'} 
                        source={article.source || 'Unknown source'} 
                        sentimentScore={article.sentimentScore} 
                        articleUrl={article.url}
                      />
                    ))}
                    {portfolioSummary.referenced_articles.filter(article => article.shouldDisplay !== false).length > MAX_PORTFOLIO_ARTICLES && (
                      <p className="text-xs text-muted-foreground italic">
                        Showing {MAX_PORTFOLIO_ARTICLES} of {portfolioSummary.referenced_articles.filter(article => article.shouldDisplay !== false).length} referenced articles
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm mt-2">
                    No specific articles were referenced for this summary.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </CleraAssistCard>
  );
};

export default PortfolioNewsSummaryWithAssist; 