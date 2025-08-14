"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe, Volume2, Loader2, AlertCircle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    "Analyze the personalized portfolio news summary below. Explain the likely impact on a diversified long-term portfolio and call out 1–2 concrete watch items or actions if needed.\n\n<portfolio_news_summary>\n{summaryText}\n</portfolio_news_summary>",
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
      return "The personalized summary isn't available. What kinds of market news should a long-term investor actually pay attention to, and what can usually be ignored?";
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

  // Parse model output into headline, yesterday bullets, and today bullets.
  const parseSummary = (text: string) => {
    const normalize = (s: string) => s.replace(/’/g, "'").trim();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let headline = '';
    const yesterday: string[] = [];
    const today: string[] = [];
    let mode: 'none' | 'y' | 't' = 'none';
    for (const line of lines) {
      const n = normalize(line);
      if (!headline && !/^yesterday'?s market recap:/i.test(n) && !/^what to watch today:/i.test(n) && !/^•\s*/.test(n) && !/^\-\s*/.test(n)) {
        headline = line;
        continue;
      }
      if (/^yesterday'?s market recap:/i.test(n)) { mode = 'y'; continue; }
      if (/^what to watch today:/i.test(n)) { mode = 't'; continue; }
      const bullet = n.replace(/^•\s*/, '').replace(/^\-\s*/, '').trim();
      if (!bullet) continue;
      if (mode === 'y') yesterday.push(bullet);
      else if (mode === 't') today.push(bullet);
    }
    return { headline, yesterday, today };
  };

  const structured = portfolioSummary?.summary_text
    ? parseSummary(portfolioSummary.summary_text.replace(/\\n/g, '\n'))
    : { headline: '', yesterday: [], today: [] };

  const splitIntoBullets = (text: string, maxBullets: number = 4): string[] => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    // Browser-compatible sentence splitting without look-behind assertions
    const result: string[] = [];
    let currentPiece = '';
    
    for (let i = 0; i < normalized.length; i++) {
      currentPiece += normalized[i];
      
      // Check if we've reached a sentence boundary
      if (/[\.!?]/.test(normalized[i])) {
        const nextChar = normalized[i + 1];
        const nextNextChar = normalized[i + 2];
        
        // If next char is whitespace and following char is capital letter or opening parenthesis
        if (nextChar && /\s/.test(nextChar) && nextNextChar && /[A-Z\(]/.test(nextNextChar)) {
          const trimmed = currentPiece.trim();
          if (trimmed) {
            result.push(trimmed);
            currentPiece = '';
          }
        }
      }
    }
    
    // Add any remaining text
    if (currentPiece.trim()) {
      result.push(currentPiece.trim());
    }
    
    // Post-process to handle abbreviations and short pieces
    const processed: string[] = [];
    for (let i = 0; i < result.length; i++) {
      let current = result[i];
      if (!current) continue;
      
      const endsWithAbbrev = /(U\.S\.|U\.K\.|U\.N\.|E\.U\.|Inc\.|Ltd\.|Co\.|Mr\.|Ms\.|Dr\.)$/.test(current);
      const tooShort = current.length < 40;
      
      if ((endsWithAbbrev || tooShort) && i < result.length - 1) {
        current = current + ' ' + (result[++i] || '').trim();
      }
      
      if (current) processed.push(current);
      if (processed.length >= maxBullets) break;
    }
    
    return processed;
  };

  const getFallbackSections = (text: string) => {
    const cleaned = text.replace(/\\n/g, '\n');
    const parts = cleaned.split(/\n\n+/);
    const y = parts[0] ? splitIntoBullets(parts[0].replace(/\n/g, ' ')) : [];
    const t = parts[1] ? splitIntoBullets(parts[1].replace(/\n/g, ' ')) : [];
    return { yesterday: y, today: t };
  };

  const fallback = (!structured.yesterday.length && !structured.today.length && portfolioSummary?.summary_text)
    ? getFallbackSections(portfolioSummary.summary_text)
    : { yesterday: [] as string[], today: [] as string[] };

  // Emphasis: bold common company names and safe tickers (avoid generic acronyms)
  const COMPANY_NAMES = [
    'Apple', 'Microsoft', 'Tesla', 'Nvidia', 'Meta', 'Alphabet', 'Google', 'Amazon',
    'Cisco', 'Applied Materials', 'Broadcom', 'AMD', 'Intel', 'Oracle', 'Salesforce',
    'Netflix', 'Spotify', 'Uber'
  ];
  const TICKER_STOP = new Set(['US', 'AI', 'CPI', 'GDP', 'CEO', 'EPS', 'FOMC', 'ETF']);

  const renderWithEmphasis = (text: string): React.ReactNode => {
    // Step 1: Emphasize known company names (including multi-word)
    let parts: (string | React.ReactNode)[] = [text];
    COMPANY_NAMES.forEach((name) => {
      const regex = new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'gi');
      const next: (string | React.ReactNode)[] = [];
      parts.forEach((piece, idx) => {
        if (typeof piece !== 'string') { next.push(piece); return; }
        const segments = piece.split(regex);
        const matches = piece.match(regex) || [];
        segments.forEach((seg, i) => {
          if (seg) next.push(seg);
          if (i < matches.length) {
            next.push(<strong key={`n-${name}-${idx}-${i}`}>{matches[i]}</strong>);
          }
        });
      });
      parts = next;
    });

    // Step 2: Emphasize ticker-like tokens (2–5 uppercase letters), excluding stopwords
    const tickerRegex = /\b[A-Z]{2,5}\b/g;
    const next: (string | React.ReactNode)[] = [];
    parts.forEach((piece, pIdx) => {
      if (typeof piece !== 'string') { next.push(piece); return; }
      const segments = piece.split(tickerRegex);
      const matches = piece.match(tickerRegex) || [];
      segments.forEach((seg, i) => {
        if (seg) next.push(seg);
        if (i < matches.length) {
          const tk = matches[i];
          if (!TICKER_STOP.has(tk)) {
            next.push(<strong key={`t-${tk}-${pIdx}-${i}`}>{tk}</strong>);
          } else {
            next.push(tk);
          }
        }
      });
    });
    return <>{next}</>;
  };

  const handleBulletAssist = (sectionLabel: string, bullet: string) => {
    const prompt = `Deep-dive this news point from the user's daily briefing.\nSection: ${sectionLabel}\nBullet: "${bullet}"\n\nExplain what it means, why it matters to a long-term growth investor, key drivers, risks, and concrete upcoming catalysts. Provide 2–4 reputable sources/links.`;
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
                {structured.yesterday.length > 0 ? (
                  <ul className="space-y-2">
                    {structured.yesterday.map((b, idx) => (
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
                ) : (
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {portfolioSummary.summary_text.replace(/\\n/g, '\n')}
                  </p>
                )}

                {structured.today.length > 0 && (
                  <div className="mt-4">
                    <p className="text-base font-medium text-foreground mb-1">What to Watch Out For:</p>
                    <ul className="space-y-2">
                      {structured.today.map((b, idx) => (
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
            <p className="text-base font-medium">Market Recap:</p>
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
              <div className="text-[15px] text-gray-200 space-y-3">
                {(structured.yesterday.length ? structured.yesterday : fallback.yesterday).length > 0 ? (
                  <ul className="space-y-2">
                    {(structured.yesterday.length ? structured.yesterday : fallback.yesterday).map((b, idx) => (
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

                {(structured.today.length ? structured.today : fallback.today).length > 0 && (
                  <div className="mt-4">
                    <p className="text-base font-medium text-foreground mb-1">What to Watch Out For:</p>
                    <ul className="space-y-2">
                      {(structured.today.length ? structured.today : fallback.today).map((b, idx) => (
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