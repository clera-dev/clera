'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RelevantStocks } from './RelevantStocks';
import { formatInvestmentThemeReport, cleanInlineCitations } from '@/utils/textFormatting';

interface InvestmentTheme {
  title: string;
  summary: string;
  report: string;
  relevant_tickers: string[];
}

interface InvestmentIdeasCardProps {
  investmentThemes: InvestmentTheme[];
  onStockSelect: (symbol: string) => void;
  onThemeSelect?: () => void;
  isLoading?: boolean;
  isNewUser?: boolean; // Show special loading state for new users
}

// Removed: cleanInlineCitations moved to utils/textFormatting.ts

// Production-grade: No static fallbacks - handle states properly

export default function InvestmentIdeasCard({ investmentThemes, onStockSelect, onThemeSelect, isLoading = false, isNewUser = false }: InvestmentIdeasCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<InvestmentTheme | null>(null);

  // New user loading state
  if (isNewUser) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Personalized Investment Themes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Generating Your Investment Themes</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Creating personalized investment themes based on your preferences and market analysis.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state - show skeleton while data is being fetched
  if (isLoading) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Personalized Investment Themes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Production-grade: If no themes and not loading, something went wrong
  if (investmentThemes.length === 0) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Personalized Investment Themes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Unable to Load Themes</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              We're having trouble loading your investment themes. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Personalized Investment Themes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {investmentThemes.map((theme, index) => (
              <Card 
                key={index}
                className="border hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 h-40 flex flex-col relative z-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Auto-collapse sidebar when investment theme dialog opens
                  onThemeSelect?.();
                  setSelectedTheme(theme);
                }}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col h-full relative">
                  <div className="flex flex-col h-full space-y-2">
                    <div className="font-bold text-base sm:text-lg relative z-10 truncate">{theme.title}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground relative z-10 line-clamp-4 flex-1">
                      {cleanInlineCitations(theme.summary)}
                    </div>
                    <div className="h-3 flex-shrink-0"></div> {/* Consistent bottom spacing */}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                    <TrendingUp className="h-16 w-16 sm:h-20 sm:w-20 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Investment Theme Dialog */}
      <Dialog open={!!selectedTheme} onOpenChange={(open) => {
        if (!open) {
          setSelectedTheme(null);
        }
      }}>
        <DialogContent 
          className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background border border-border shadow-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{selectedTheme?.title}</DialogTitle>
          </DialogHeader>
          {selectedTheme && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2 text-foreground">Summary:</h4>
                <p className="text-sm text-muted-foreground">{cleanInlineCitations(selectedTheme.summary)}</p>
              </div>
              
              {/* Relevant stocks in dialog */}
              {selectedTheme.relevant_tickers && selectedTheme.relevant_tickers.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-foreground">Relevant Stocks:</h4>
                  <RelevantStocks 
                    tickers={selectedTheme.relevant_tickers}
                    onStockSelect={(symbol) => {
                      setSelectedTheme(null); // Close dialog first
                      onStockSelect(symbol);  // Then trigger stock selection
                    }}
                    maxDisplay={selectedTheme.relevant_tickers.length} // Show all in dialog
                  />
                </div>
              )}
              
              <div>
                <h4 className="font-semibold mb-2 text-foreground">Report:</h4>
                <div className="text-sm text-muted-foreground leading-relaxed break-words space-y-3">
                  {formatInvestmentThemeReport(selectedTheme.report)
                    .split('\n\n')
                    .map((para, idx) => (
                      <p key={idx} className="mb-3 whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                </div>
              </div>
              
              {/* Note about sources being available below */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  All research sources are available in the "Research Sources" section below
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
} 