"use client";

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe, Volume2, Loader2, AlertCircle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  parseSummary, 
  sanitizeForPrompt 
} from '@/utils/newsTextProcessing';
import { renderWithEmphasis } from '@/utils/newsTextRendering';

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
  
  // Memoize prompt and UI text generation - only recalculates when data changes
  const { contextualPrompt, triggerText, description } = useMemo(() => {
    if (!portfolioSummary || disabled) {
      return {
        contextualPrompt: "How does market news typically affect investments? I want to understand what to pay attention to without overreacting to every story.",
        triggerText: "Get guidance",
        description: "Understand how news affects your investments"
      };
    }
    
    if (summaryError) {
      return {
        contextualPrompt: "The summary isn't loading right now. What kinds of market news should I actually pay attention to, and what can I safely tune out?",
        triggerText: "Ask about news",
        description: "Understand what market news matters for your investments"
      };
    }
    
    // Extract key data
    const articleCount = portfolioSummary.referenced_articles?.length || 0;
    const positiveArticles = portfolioSummary.referenced_articles?.filter(a => a.sentimentScore > 0.2) || [];
    const negativeArticles = portfolioSummary.referenced_articles?.filter(a => a.sentimentScore < -0.2) || [];
    
    // Extract key topics from summary with human-readable labels
    const topicMappings: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\b(?:fed|federal reserve|interest rate|rate cut|rate hike)\b/i, label: "Interest Rates/Fed" },
      { pattern: /\b(?:inflation|cpi|pce|prices)\b/i, label: "Inflation" },
      { pattern: /\b(?:earnings|revenue|profit|beat|miss)\b/i, label: "Earnings" },
      { pattern: /\b(?:tech|technology|ai|artificial intelligence|nvidia|apple|microsoft|google)\b/i, label: "Tech" },
      { pattern: /\b(?:crypto|bitcoin|ethereum|btc|eth)\b/i, label: "Crypto" },
      { pattern: /\b(?:oil|energy|gas|opec)\b/i, label: "Energy" },
      { pattern: /\b(?:jobs|employment|unemployment|labor|payroll)\b/i, label: "Jobs/Labor" },
      { pattern: /\b(?:gdp|economy|recession|growth)\b/i, label: "Economy" },
    ];
    
    const topics: string[] = [];
    topicMappings.forEach(({ pattern, label }) => {
      if (pattern.test(portfolioSummary.summary_text) && !topics.includes(label)) {
        topics.push(label);
      }
    });
    const topTopics = topics.slice(0, 3);
    
    const sentimentSummary = positiveArticles.length > negativeArticles.length 
      ? "mostly positive" 
      : negativeArticles.length > positiveArticles.length 
        ? "mostly negative" 
        : "mixed";
    
    // Build a concise, conversational prompt
    let prompt = `Today's news summary covers ${articleCount} articles with ${sentimentSummary} sentiment overall.`;
    if (topTopics.length > 0) {
      prompt += ` Key themes: ${topTopics.join(', ')}.`;
    }
    prompt += `\n\nHere's the summary:\n"${portfolioSummary.summary_text.slice(0, 500)}${portfolioSummary.summary_text.length > 500 ? '...' : ''}"`;
    prompt += `\n\nLooking at my portfolio, which of my holdings might be affected by this news? What's the key takeaway I should remember?`;
    
    return {
      contextualPrompt: prompt,
      triggerText: "Get insights",
      description: "See how today's news affects your specific holdings"
    };
  }, [portfolioSummary, summaryError, disabled]);

  // Parse model output into headline, yesterday bullets, and today bullets.


  const structured = portfolioSummary?.summary_text
    ? parseSummary(portfolioSummary.summary_text.replace(/\\n/g, '\n'))
    : { headline: '', yesterday: [], today: [] };





  // Simple fallback: if parsing found no "today" section but has items in yesterday,
  // split the bullets in half (for backward compatibility with old summaries without headers)
  // Threshold is 2+ bullets - we expect at least one for each section
  const needsFallbackSplit = structured.yesterday.length >= 2 && structured.today.length === 0;
  
  const finalYesterday = needsFallbackSplit
    ? structured.yesterday.slice(0, Math.ceil(structured.yesterday.length / 2))
    : structured.yesterday;
    
  const finalToday = needsFallbackSplit
    ? structured.yesterday.slice(Math.ceil(structured.yesterday.length / 2))
    : structured.today;





  const handleBulletAssist = (sectionLabel: string, bullet: string) => {
    const sanitizedBullet = sanitizeForPrompt(bullet);
    const sanitizedSection = sanitizeForPrompt(sectionLabel);
    const prompt = `Deep-dive this news point from the user's daily briefing.\nSection: ${sanitizedSection}\nBullet: "${sanitizedBullet}"\n\nExplain what it means, why it matters to a long-term growth investor, key drivers, risks, and concrete upcoming catalysts.`;
    openChatWithPrompt(prompt, 'portfolio_news_bullet');
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
              <p className="text-base font-medium">Market Recap:</p>
            </div>
            {isLoadingSummary && (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Refreshing your personalized news summary</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing latest market news for your portfolio...</p>
                </div>
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
                {finalYesterday.length > 0 ? (
                  <ul className="space-y-2">
                    {finalYesterday.map((b, idx) => (
                      <li key={`y-${idx}`} className="flex items-start gap-2">
                        <span className="text-muted-foreground" aria-hidden>•</span>
                        <span className="flex-1 leading-6">{b}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-blue-400 hover:text-blue-300 p-1"
                              onClick={() => handleBulletAssist("Market Recap", b)}
                              aria-label="Learn more"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Learn more</TooltipContent>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                ) : portfolioSummary.summary_text && portfolioSummary.summary_text.trim() ? (
                  // Fallback: Show raw summary text if parsing yielded no bullets
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {portfolioSummary.summary_text.replace(/\\n/g, '\n')}
                  </p>
                ) : (
                  // Last resort: Show a meaningful message if there's no content at all
                  <p className="text-muted-foreground italic">
                    No market summary available at this time. Check back later for your personalized news digest.
                  </p>
                )}

                {finalToday.length > 0 && (
                  <div className="mt-4">
                    <p className="text-base font-medium text-foreground mb-1">What to Watch Out For:</p>
                    <ul className="space-y-2">
                      {finalToday.map((b, idx) => (
                        <li key={`t-${idx}`} className="flex items-start gap-2">
                          <span className="text-muted-foreground" aria-hidden>•</span>
                          <span className="flex-1 leading-6">{b}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-blue-400 hover:text-blue-300 p-1"
                                onClick={() => handleBulletAssist("What to Watch Out For", b)}
                                aria-label="Learn more"
                              >
                                <ArrowUpRight className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">Learn more</TooltipContent>
                          </Tooltip>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
      prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "portfolio_news_summary")}
      disabled={disabled}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        
        <div className="space-y-1 mb-2 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium">Market Recap:</p>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isLoadingSummary && (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Refreshing your personalized news summary</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing latest market news for your portfolio...</p>
                </div>
              </div>
            )}
            {summaryError && !isLoadingSummary && (
              <Alert variant="destructive" className="text-xs p-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                <AlertDescription>{summaryError}</AlertDescription>
              </Alert>
            )}
            {!isLoadingSummary && !summaryError && portfolioSummary && (
              <div className="text-[15px] text-gray-200 space-y-3">
                {finalYesterday.length > 0 ? (
                  <ul className="space-y-2">
                    {finalYesterday.map((b, idx) => (
                      <li key={`y-enabled-${idx}`} className="flex items-start gap-2">
                        <span className="text-gray-400" aria-hidden>•</span>
                        <span className="flex-1 leading-7">{renderWithEmphasis(b)}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-blue-400 hover:text-blue-300 p-1"
                              onClick={() => handleBulletAssist("Market Recap", b)}
                              aria-label="Learn more"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Learn more</TooltipContent>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {finalToday.length > 0 && (
                  <div className="mt-4">
                    <p className="text-base font-medium text-foreground mb-1">What to Watch Out For:</p>
                    <ul className="space-y-2">
                      {finalToday.map((b, idx) => (
                        <li key={`t-enabled-${idx}`} className="flex items-start gap-2">
                          <span className="text-gray-400" aria-hidden>•</span>
                          <span className="flex-1 leading-7">{renderWithEmphasis(b)}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-blue-400 hover:text-blue-300 p-1"
                                onClick={() => handleBulletAssist("What to Watch Out For", b)}
                                aria-label="Learn more"
                              >
                                <ArrowUpRight className="w-4 h-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">Learn more</TooltipContent>
                          </Tooltip>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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