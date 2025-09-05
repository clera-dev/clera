'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

interface ResearchSourcesCardProps {
  citations: string[];
  isLoading?: boolean;
  isNewUser?: boolean; // Show special loading state for new users
}

// Production-grade: No static fallbacks - handle states properly

export default function ResearchSourcesCard({ citations, isLoading = false, isNewUser = false }: ResearchSourcesCardProps) {
  
  // New user loading state - only show when no citations are available
  if (isNewUser && citations.length === 0) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Research Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sources used to generate your personalized investment analysis
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Gathering Research Sources</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Collecting citation data from deep research analysis.
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
          <CardTitle className="text-xl font-semibold">Research Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sources used to generate your personalized investment analysis
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Production-grade: Show proper empty state when no citations available and not loading
  if (citations.length === 0) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Research Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sources used to generate your personalized investment analysis
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No Sources to Display</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Research sources will appear here once your personalized analysis is generated.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Research Sources</CardTitle>
        <p className="text-sm text-muted-foreground">
          Sources used to generate your personalized investment themes and stock picks
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="max-h-80 overflow-y-auto border rounded-lg bg-gray-50 dark:bg-gray-900/50 p-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {citations.map((citation, index) => (
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
                        {(() => {
                          try {
                            return new URL(citation).hostname.replace(/^www\./, '');
                          } catch {
                            return citation;
                          }
                        })()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {citation.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
            {citations.length > 20 && (
              <div className="text-center mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing all {citations.length} research sources
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