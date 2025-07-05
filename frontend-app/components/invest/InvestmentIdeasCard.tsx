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
}

// Clean inline citations from text for cleaner reading
const cleanInlineCitations = (text: string) => {
  return text.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
};

// Static fallback investment ideas
const STATIC_INVESTMENT_IDEAS = [
  {
    title: "AI Infrastructure Revolution",
    summary: "Capitalize on the accelerating adoption of artificial intelligence across industries through infrastructure companies enabling AI computing, data processing, and cloud services.",
    report: "The AI infrastructure market is experiencing unprecedented growth as enterprises accelerate their digital transformation initiatives. Companies providing GPU computing, cloud infrastructure, and AI-optimized hardware are positioned to benefit from this multi-trillion dollar opportunity. Key areas include semiconductor companies developing AI chips, cloud service providers expanding AI capabilities, and software companies creating AI development platforms.",
    relevant_tickers: ["NVDA", "AMD", "MSFT", "GOOGL", "AMZN"]
  },
  {
    title: "Cybersecurity Dominance",
    summary: "Target companies leading the essential defense against escalating cyber threats in our increasingly digital world, focusing on next-generation security solutions.",
    report: "The cybersecurity market continues to expand as organizations face increasingly sophisticated threats. Companies offering cloud-native security, zero-trust architectures, and AI-powered threat detection are seeing strong demand. The shift to remote work and cloud infrastructure has created new attack vectors, driving investment in endpoint security, identity management, and security orchestration platforms.",
    relevant_tickers: ["CRWD", "ZS", "OKTA", "PANW", "FTNT"]
  },
  {
    title: "Biotech Innovation Wave",
    summary: "Invest in breakthrough therapeutic platforms addressing multi-billion dollar unmet medical needs through innovative drug development and delivery systems.",
    report: "The biotechnology sector is experiencing a renaissance driven by advances in gene therapy, immunotherapy, and precision medicine. Companies with innovative platforms for drug discovery and development are attracting significant investment. Areas of particular interest include mRNA technology, CAR-T cell therapy, and novel drug delivery systems that can address previously untreatable conditions.",
    relevant_tickers: ["BNTX", "MRNA", "ILMN", "REGN", "GILD"]
  },
  {
    title: "Emerging Markets Ascendancy",
    summary: "Capture hypergrowth in developing economies leading the global technology adoption curve, focusing on fintech and digital transformation leaders.",
    report: "Emerging markets are experiencing rapid digital transformation, with companies in fintech, e-commerce, and digital payments seeing explosive growth. These markets often leapfrog traditional infrastructure, creating opportunities for innovative business models. Key themes include mobile-first financial services, digital payment platforms, and technology companies serving the growing middle class in developing economies.",
    relevant_tickers: ["SEZL", "PYPL", "SQ", "MELI", "SHOP"]
  }
];

export default function InvestmentIdeasCard({ investmentThemes, onStockSelect, onThemeSelect, isLoading = false }: InvestmentIdeasCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<InvestmentTheme | null>(null);
  const displayThemes = investmentThemes.length > 0 ? investmentThemes : STATIC_INVESTMENT_IDEAS;

  return (
    <>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Your Personalized Investment Ideas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayThemes.map((theme, index) => (
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
                <p className="text-sm text-muted-foreground leading-relaxed break-words">{cleanInlineCitations(selectedTheme.report)}</p>
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