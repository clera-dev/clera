'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourcesTabProps {
  citations: string[];
  isVisible: boolean;
  onToggle: () => void;
}

export default function SourcesTab({ citations, isVisible, onToggle }: SourcesTabProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!citations || citations.length === 0) {
    return null;
  }

  const getDomainFromUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      return domain;
    } catch {
      return url;
    }
  };

  const getSourceTitle = (url: string): string => {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      return domain.split('.').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    } catch {
      return url;
    }
  };

  return (
    <div className="mt-3">
      {/* Compact Sources Button - ChatGPT style with Aceternity UI inspiration */}
      <button
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
          "bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200",
          "dark:from-gray-800 dark:to-gray-900 dark:hover:from-gray-700 dark:hover:to-gray-800",
          "border border-gray-200 dark:border-gray-700",
          "hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50",
          "hover:scale-[1.02] active:scale-[0.98] transform-gpu",
          "group relative overflow-hidden"
        )}
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <Link2 className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-300 relative z-10" />
        <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-300 relative z-10">
          Sources
        </span>
        <Badge
          variant="secondary"
          className="text-xs bg-gradient-to-r from-blue-100 to-blue-200 text-blue-700 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-300 px-2 py-1 rounded-full shadow-sm relative z-10"
        >
          {citations.length}
        </Badge>
        <div className="relative z-10">
          {isVisible ? (
            <ChevronUp className="h-4 w-4 text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-300" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-300" />
          )}
        </div>
      </button>

      {/* Compact Sources List with smooth animations */}
      <div
        className={cn(
          "mt-3 space-y-2 max-h-64 overflow-y-auto transition-all duration-300 ease-out",
          isVisible
            ? "opacity-100 max-h-64 translate-y-0"
            : "opacity-0 max-h-0 -translate-y-2 pointer-events-none"
        )}
      >
        {citations.map((citation, index) => (
          <div
            key={index}
            className={cn(
              "group flex items-center gap-3 p-3 rounded-xl transition-all duration-300",
              "bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200",
              "dark:from-gray-800/50 dark:to-gray-900/50 dark:hover:from-gray-800 dark:hover:to-gray-900",
              "border border-gray-200 dark:border-gray-700",
              "hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50",
              "hover:scale-[1.02] transform-gpu",
              "relative overflow-hidden"
            )}
            style={{
              animationDelay: `${index * 50}ms`,
              animation: isVisible ? 'fadeInUp 0.3s ease-out forwards' : 'none'
            }}
          >
            {/* Animated background on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="flex-1 min-w-0 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex-shrink-0 shadow-sm" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                  {getSourceTitle(citation)}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1 ml-5">
                {getDomainFromUrl(citation)}
              </div>
            </div>
            <a
              href={citation}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300",
                "bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200",
                "text-blue-700 hover:text-blue-800",
                "dark:from-blue-900/20 dark:to-blue-800/20 dark:hover:from-blue-900/30 dark:hover:to-blue-800/30",
                "dark:text-blue-300 dark:hover:text-blue-200",
                "hover:shadow-md hover:scale-105 active:scale-95 transform-gpu",
                "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0",
                "relative z-10"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Visit</span>
            </a>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
