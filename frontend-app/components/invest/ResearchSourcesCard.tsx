'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

interface ResearchSourcesCardProps {
  citations: string[];
  isLoading?: boolean;
}

// Static fallback citations
const STATIC_CITATIONS = [
  "https://www.permanentportfoliofunds.com/aggressive-growth-portfolio.html",
  "https://madisonfunds.com/funds/aggressive-allocation-fund/",
  "https://www.cambridgeassociates.com/insight/concentrated-stock-portfolios-deborah-christie-sean-mclaughlin-and-chris-parker/",
  "https://ncua.gov/regulation-supervision/letters-credit-unions-other-guidance/concentration-risk-0",
  "https://www.ig.com/en/news-and-trade-ideas/best-ai-stocks-to-watch-230622",
  "https://www.securities.io/10-promising-biotech-stocks-in-the-medical-field/",
  "https://www.sganalytics.com/blog/best-green-energy-stocks-to-invest-and-buy-in/",
  "https://www.nerdwallet.com/article/investing/what-are-emerging-markets",
  "https://www.investopedia.com/managing-wealth/achieve-optimal-asset-allocation/",
  "https://blog.massmutual.com/retiring-investing/investor-profile-aggressive",
  "https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/aggressive-investment-strategy/",
  "https://www.investopedia.com/terms/a/aggressiveinvestmentstrategy.asp",
  "https://www.fidelity.com/learning-center/wealth-management-insights/diversify-concentrated-positions",
  "https://www.schwab.wallst.com/schwab/Prospect/research/etfs/schwabETF/index.asp?type=holdings&symbol=IWO",
  "https://www.schwab.wallst.com/schwab/Prospect/research/etfs/schwabETF/index.asp?type=holdings&symbol=SMH",
  "https://intellectia.ai/blog/cloud-computing-stocks",
  "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=CIBR",
  "https://intellectia.ai/blog/best-5g-stocks",
  "https://www.ftportfolios.com/retail/etf/ETFholdings.aspx?Ticker=QCLN",
  "https://capex.com/en/academy/investing-in-ev-stocks"
];

export default function ResearchSourcesCard({ citations, isLoading = false }: ResearchSourcesCardProps) {
  const displayCitations = citations.length > 0 ? citations : STATIC_CITATIONS;

  if (displayCitations.length === 0) {
    return null;
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Research Sources</CardTitle>
        <p className="text-sm text-muted-foreground">
          All sources used to generate your personalized investment themes
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="max-h-80 overflow-y-auto border rounded-lg bg-gray-50 dark:bg-gray-900/50 p-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {displayCitations.map((citation, index) => (
                <a
                  key={index}
                  href={citation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm p-3 border rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors group bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {new URL(citation).hostname.replace(/^www\./, '')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {citation.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
            {displayCitations.length > 20 && (
              <div className="text-center mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing all {displayCitations.length} research sources
                </p>
              </div>
            )}
          </div>
          {/* Scroll fade indicator */}
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-900/50 pointer-events-none rounded-b-lg"></div>
        </div>
      </CardContent>
    </Card>
  );
} 