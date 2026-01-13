"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PortfolioAnalyticsData {
  risk_score: string; // Decimal as string
  diversification_score: string; // Decimal as string
}

interface RiskDiversificationScoresProps {
  accountId: string | null;
  // apiKey: string | null; // Remove apiKey prop
  initialData: PortfolioAnalyticsData | null;
  // Option 1: Pass fetch function
  // fetchData: (endpoint: string, options?: RequestInit) => Promise<any>;
  // Option 2: Pass API base URL (Simpler for component)
}

// --- Constants --- 
const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- Helper Functions --- 

// Convert score (1-10) to percentage (0-100) for Progress bar
const scoreToPercentage = (score: string | number | null): number => {
    if (score === null || score === undefined) return 0;
    const numericScore = typeof score === 'string' ? parseFloat(score) : score;
    if (isNaN(numericScore)) return 0;
    // Scale 1-10 to 0-100 range approximately
    return Math.max(0, Math.min(100, (numericScore / 10) * 100));
};

// Get descriptive text based on score
const getRiskDescription = (score: number): string => {
    if (score <= 3) return "Low Risk";
    if (score <= 6) return "Moderate Risk";
    if (score <= 8) return "High Risk";
    return "Very High Risk";
};

const getDiversificationDescription = (score: number): string => {
    if (score <= 3) return "Poorly Diversified";
    if (score <= 5) return "Moderately Concentrated";
    if (score <= 7) return "Fairly Diversified";
    return "Well Diversified";
};

// Get color class based on score for tooltip text
const getRiskTextColor = (score: number): string => {
    if (score <= 3) return "text-green-500";
    if (score <= 6) return "text-yellow-500";
    if (score <= 8) return "text-orange-500";
    return "text-red-500";
};

const getDiversificationTextColor = (score: number): string => {
    if (score <= 3) return "text-red-500";
    if (score <= 5) return "text-orange-500";
    if (score <= 7) return "text-yellow-500";
    return "text-green-500";
};

// PRODUCTION-GRADE: Detect special portfolio states
// Both cash-only and empty portfolios return 0/0 from backend
// The differentiator is whether we have valid analyticsData
const isZeroScorePortfolio = (riskScore: number, divScore: number): boolean => {
    // Returns true for both cash-only and empty portfolios (both return 0/0)
    return riskScore === 0 && divScore === 0;
};

const RiskDiversificationScores: React.FC<RiskDiversificationScoresProps> = ({
    accountId,
    // apiKey, // Remove apiKey from destructuring
    initialData
}) => {

    const [analyticsData, setAnalyticsData] = useState<PortfolioAnalyticsData | null>(initialData);
    const [isLoading, setIsLoading] = useState<boolean>(!initialData);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Update internal state if initialData prop changes
    useEffect(() => {
        setAnalyticsData(initialData);
        // If initialData is now present, and we were in a loading state due to its absence, set loading to false.
        if (initialData && isLoading) {
            setIsLoading(false);
        }
    }, [initialData]);

    const riskScore = analyticsData ? parseFloat(analyticsData.risk_score) : 0;
    const diversificationScore = analyticsData ? parseFloat(analyticsData.diversification_score) : 0;

    // --- Polling Logic --- 
    useEffect(() => {
        // Function to fetch latest analytics data
        const fetchLatestAnalytics = async () => {
            // if (!accountId || !apiKey) return; // Remove apiKey check
            if (!accountId) {
                // console.log("Polling skipped: No accountId");
                return;
            }

            // console.log("Polling for analytics update...");
            setError(null);

            try {
                 // Call the NEW frontend API route
                 const frontendEndpoint = `/api/portfolio/poll-analytics?accountId=${accountId}`;
                 // Use relative path for frontend route
                 const response = await fetch(frontendEndpoint, {
                    headers: {
                        'Content-Type': 'application/json',
                        // No API key needed here - the frontend route handles it
                    },
                 });

                if (!response.ok) {
                    const errorData = await response.json();
                    // Use error message from the frontend API route if available
                    throw new Error(`API Error (${response.status}): ${errorData.error || errorData.detail || response.statusText}`);
                }
                const latestData: PortfolioAnalyticsData = await response.json();
                setAnalyticsData(latestData);
            } catch (err: any) {
                console.error("Error polling for analytics:", err);
                setError(`Failed to update scores: ${err.message}`);
            }
        };

        // Start polling if accountId is available
        // if (accountId && apiKey) { // Remove apiKey check
        if (accountId) {
            // Clear any existing interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            // Set up new interval
            intervalRef.current = setInterval(fetchLatestAnalytics, POLLING_INTERVAL_MS);

            // Initial fetch if needed
             if (!initialData) {
                setIsLoading(true);
                fetchLatestAnalytics().finally(() => setIsLoading(false));
             }
        }

        // Cleanup function
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

    // }, [accountId, apiKey, apiBaseUrl, initialData]); // Remove apiKey dependency
    }, [accountId, initialData]); // Only rerun effect if accountId or initialData changes

    // --- Render Component --- 

    if (isLoading) {
         return (
            <div className="space-y-6">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
            </div>
         );
    }

    // PRODUCTION-GRADE: Handle special portfolio states
    // Both cash-only and empty portfolios return 0/0 from backend
    // Differentiator: analyticsData exists = cash-only, no analyticsData = truly empty
    const hasZeroScores = isZeroScorePortfolio(riskScore, diversificationScore);
    const isCashOnly = analyticsData !== null && hasZeroScores;
    const isEmpty = analyticsData === null || (!analyticsData && hasZeroScores);

    // Empty portfolio (no data at all) - show connect message
    if (isEmpty && !analyticsData) {
        return (
            <div className="space-y-4">
                <div className="text-center py-6 px-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                        Connect a brokerage account or make your first investment to see your portfolio analytics.
                    </p>
                </div>
            </div>
        );
    }

    // Cash-only portfolio (has data but 0/0 scores) - show informative message
    if (isCashOnly) {
        return (
            <div className="space-y-4">
                <div className="text-center py-6 px-4 rounded-lg bg-muted/50 border border-dashed border-muted-foreground/30">
                    <p className="text-sm font-medium text-foreground mb-2">
                        💰 100% Cash Portfolio
                    </p>
                    <p className="text-xs text-muted-foreground">
                        You&apos;re currently all in cash. Risk and diversification scores apply once you invest in securities.
                    </p>
                    <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>Risk: <span className="text-green-500 font-medium">0/10</span> (no market risk)</span>
                        <span>Diversification: <span className="text-gray-400 font-medium">N/A</span></span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="space-y-4">
                {/* Risk Score */}
                <div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex justify-between items-center mb-1 cursor-default">
                                <span className="text-sm font-medium">Risk Score</span>
                                <span className="text-sm font-semibold">
                                    {analyticsData ? `${riskScore.toFixed(1)} / 10` : '--'}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{getRiskDescription(riskScore)} (Higher = More Risk)</p>
                        </TooltipContent>
                    </Tooltip>
                    <div className="relative w-full h-4 bg-gradient-to-r from-green-500 to-red-500 rounded-full overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full flex items-center">
                            <div className="bg-background h-full" style={{ width: `${100 - scoreToPercentage(riskScore)}%`, marginLeft: `${scoreToPercentage(riskScore)}%` }}></div>
                        </div>
                        <div className="absolute top-0 left-0 h-full w-0.5 bg-white" style={{ left: `${scoreToPercentage(riskScore)}%` }}></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Your portfolio is <span className={getRiskTextColor(riskScore)}>{getRiskDescription(riskScore).toLowerCase()}</span>
                    </p>
                </div>

                {/* Diversification Score */}
                <div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <div className="flex justify-between items-center mb-1 cursor-default">
                                <span className="text-sm font-medium">Diversification Score</span>
                                <span className="text-sm font-semibold">
                                     {analyticsData ? `${diversificationScore.toFixed(1)} / 10` : '--'}
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{getDiversificationDescription(diversificationScore)} (Higher = Better Diversified)</p>
                        </TooltipContent>
                    </Tooltip>
                    <div className="relative w-full h-4 bg-gradient-to-r from-red-500 to-green-500 rounded-full overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full flex items-center">
                            <div className="bg-background h-full" style={{ width: `${100 - scoreToPercentage(diversificationScore)}%`, marginLeft: `${scoreToPercentage(diversificationScore)}%` }}></div>
                        </div>
                        <div className="absolute top-0 left-0 h-full w-0.5 bg-white" style={{ left: `${scoreToPercentage(diversificationScore)}%` }}></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Your portfolio is <span className={getDiversificationTextColor(diversificationScore)}>{getDiversificationDescription(diversificationScore).toLowerCase()}</span>
                        {isCashOnly && ' (invest to diversify)'}
                    </p>
                </div>

                {/* Display polling error if any */} 
                {error && (
                    <p className="text-xs text-destructive mt-2">Error updating scores: {error}</p>
                )}
            </div>
        </TooltipProvider>
    );
};

export default RiskDiversificationScores; 