'use client'

import { useEffect, useState } from 'react';
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { validateAndSanitizeExternalUrl } from "@/utils/security";
import { WeeklyStockPick } from "@/lib/types/weekly-stock-picks";
import { formatStockRationale } from "@/utils/textFormatting";
import StockChart from "./StockChart";

interface StockInfoCardProps {
  symbol: string;
  accountId?: string | null;
  isInWatchlist?: boolean;
  onWatchlistChange?: () => void;
  onOptimisticAdd?: (symbol: string) => void;
  onOptimisticRemove?: (symbol: string) => void;
}

interface CompanyProfile {
  symbol: string;
  price: number;
  beta: number;
  volAvg: number;
  mktCap: number;
  lastDiv: number;
  range: string;
  changes: number;
  companyName: string;
  currency: string;
  cik: string;
  isin: string;
  cusip: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dcfDiff?: number; 
  dcf?: number; 
  image: string;
  ipoDate: string;
  defaultImage: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
  isAdr: boolean;
  isFund: boolean;
}

interface PriceTargetSummary {
  symbol: string;
  publishDate?: string; // Optional based on different FMP versions/responses
  lastMonthCount: number;
  lastMonthAvgPriceTarget: number;
  lastQuarterCount: number;
  lastQuarterAvgPriceTarget: number;
  lastYearCount: number;
  lastYearAvgPriceTarget: number;
  allTimeCount: number;
  allTimeAvgPriceTarget: number;
  publishers?: string; // Often a stringified JSON array
}

// Using WeeklyStockPick type from the types file for consistency

export default function StockInfoCard({ symbol, accountId, isInWatchlist, onWatchlistChange, onOptimisticAdd, onOptimisticRemove }: StockInfoCardProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [priceTarget, setPriceTarget] = useState<PriceTargetSummary | null>(null);
  const [cleraRecommendation, setCleraRecommendation] = useState<WeeklyStockPick | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRationaleExpanded, setIsRationaleExpanded] = useState(false);
  const [localIsInWatchlist, setLocalIsInWatchlist] = useState(false);
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);

  // Use prop isInWatchlist if provided, otherwise use local state
  const currentIsInWatchlist = isInWatchlist !== undefined ? isInWatchlist : localIsInWatchlist;
  const DESCRIPTION_LIMIT = 150;
  const RATIONALE_LIMIT = 120; // Shorter limit for mobile space optimization

  // Load Clera's stock recommendations
  const loadCleraRecommendations = async () => {
    try {
      const response = await fetch('/api/investment/weekly-picks', {
        method: 'GET',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.stock_picks) {
          const recommendation = result.data.stock_picks.find(
            (pick: WeeklyStockPick) => pick.ticker.toUpperCase() === symbol.toUpperCase()
          );
          setCleraRecommendation(recommendation || null);
        } else {
          // Clear recommendation when API returns success: false or no data
          setCleraRecommendation(null);
        }
      } else {
        // Clear recommendation when API returns non-OK status
        setCleraRecommendation(null);
      }
    } catch (err) {
      console.log('No Clera recommendations available:', err);
      setCleraRecommendation(null);
    }
  };

  // Check if symbol is in watchlist (only if not provided via props)
  const checkWatchlistStatus = async () => {
    if (isInWatchlist !== undefined) return; // Skip if provided via props
    
    if (!accountId || !symbol) {
      setLocalIsInWatchlist(false);
      return;
    }
    
    try {
      const response = await fetch(`/api/watchlist/${accountId}/check/${symbol}`);
      
      if (response.ok) {
        const result = await response.json();
        setLocalIsInWatchlist(result.in_watchlist);
      }
    } catch (err) {
      console.warn('Failed to check watchlist status:', err);
    }
  };

  // Toggle watchlist status
  const toggleWatchlist = async () => {
    if (!accountId || !symbol || isUpdatingWatchlist) return;
    
    setIsUpdatingWatchlist(true);
    
    // IMMEDIATE UI UPDATE: Use optimistic update for instant feedback
    if (currentIsInWatchlist && onOptimisticRemove) {
      onOptimisticRemove(symbol);
    } else if (!currentIsInWatchlist && onOptimisticAdd) {
      onOptimisticAdd(symbol);
    }
    
    // Update local state if not using props (for internal state management)
    if (isInWatchlist === undefined) {
      setLocalIsInWatchlist(!currentIsInWatchlist);
    }
    
    try {
      const endpoint = currentIsInWatchlist ? 'remove' : 'add';
      const method = currentIsInWatchlist ? 'DELETE' : 'POST';
      
      const response = await fetch(`/api/watchlist/${accountId}/${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase() })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to ${currentIsInWatchlist ? 'remove' : 'add'} ${symbol}`);
      }

      // Call parent refresh callback for data consistency
      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (err) {
      console.error('Error toggling watchlist:', err);
      
      // ROLLBACK: Revert optimistic update on error
      if (currentIsInWatchlist && onOptimisticAdd) {
        onOptimisticAdd(symbol); // Add back if remove failed
      } else if (!currentIsInWatchlist && onOptimisticRemove) {
        onOptimisticRemove(symbol); // Remove if add failed
      }
      
      // Revert local state if not using props
      if (isInWatchlist === undefined) {
        setLocalIsInWatchlist(currentIsInWatchlist); // Revert to original state
      }
    } finally {
      setIsUpdatingWatchlist(false);
    }
  };

  useEffect(() => {
    checkWatchlistStatus();
  }, [accountId, symbol, isInWatchlist]);

  useEffect(() => {
    if (!symbol) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setProfile(null);
      setPriceTarget(null);
      setCleraRecommendation(null); // Clear previous recommendation when symbol changes
      setIsDescriptionExpanded(false);
      setIsRationaleExpanded(false);
      
      try {
        // Load Clera recommendations first
        await loadCleraRecommendations();

        const [profileRes, priceTargetRes] = await Promise.all([
          fetch(`/api/fmp/profile/${symbol}`),
          fetch(`/api/fmp/price-target/${symbol}`)
        ]);

        let profileError = null;
        let targetError = null;
        let fetchedProfile: CompanyProfile | null = null;
        let fetchedTarget: PriceTargetSummary | null = null;

        if (!profileRes.ok) {
            const errorData = await profileRes.json();
            profileError = errorData.error || `Profile fetch failed with status: ${profileRes.status}`;
        } else {
            fetchedProfile = await profileRes.json();
        }

        if (!priceTargetRes.ok) {
            const errorData = await priceTargetRes.json();
            targetError = errorData.error || `Price target fetch failed with status: ${priceTargetRes.status}`;
        } else {
            fetchedTarget = await priceTargetRes.json();
            // Handle FMP returning {} for no price target data
            if (Object.keys(fetchedTarget || {}).length === 0) {
                 fetchedTarget = null; // Treat empty object as no data
            }
        }

        setProfile(fetchedProfile);
        setPriceTarget(fetchedTarget);
        
        // Combine errors if both failed, prioritize profile error if only one
        if (profileError || targetError) {
            setError(profileError || targetError || "An unknown error occurred while fetching data.");
        }

      } catch (err: any) {
        console.error("Error fetching stock data:", err);
        setError(err.message || 'Failed to fetch stock data. Check console for details.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  if (loading) {
    return (
      <div className="w-full p-6">
        <Skeleton className="h-8 w-3/5 mb-2" />
        <Skeleton className="h-4 w-2/5 mb-6" />
        {/* Skeleton for potential Clera recommendation card */}
        <Skeleton className="h-24 w-full mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Fetching Data for {symbol}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!profile) {
     return (
       <div className="text-center text-muted-foreground py-10 w-full">
          No profile data found for {symbol}.
       </div>
     );
  }

  const description = profile.description;
  const isDescriptionLong = description && description.length > DESCRIPTION_LIMIT;
  
  const rationale = cleraRecommendation?.rationale;
  const isRationaleLong = rationale && rationale.length > RATIONALE_LIMIT;

  const toggleDescription = () => {
      setIsDescriptionExpanded(!isDescriptionExpanded);
  }

  const toggleRationale = () => {
      setIsRationaleExpanded(!isRationaleExpanded);
  }

  return (
    <div className="w-full bg-background">
      <div className="flex flex-row items-start justify-between space-y-0 pb-2 px-2 sm:px-4 pt-3">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1 sm:gap-2 max-w-full">
            <h2 className="text-lg sm:text-2xl font-bold truncate flex-1 min-w-0">{profile.companyName} ({profile.symbol})</h2>
            {accountId && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "p-1 h-7 w-7 sm:h-8 sm:w-8 transition-all duration-200 flex-shrink-0",
                  currentIsInWatchlist 
                    ? "text-yellow-500 hover:text-yellow-600 scale-110" 
                    : "text-slate-400 hover:text-yellow-500 border border-yellow-500/30"
                )}
                onClick={toggleWatchlist}
                disabled={isUpdatingWatchlist}
              >
                <Star 
                  className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5 transition-all duration-200",
                    currentIsInWatchlist 
                      ? "fill-yellow-500 text-yellow-500" 
                      : "fill-transparent"
                  )}
                />
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm truncate">{profile.exchangeShortName} | {profile.sector} | {profile.industry}</p>
        </div>
        {profile.image && 
            <img src={profile.image} alt={`${profile.companyName} logo`} className="h-10 w-10 sm:h-12 sm:w-12 rounded-md object-contain bg-muted p-1 flex-shrink-0" />
        }
      </div>

      {/* Clera Stock Pick Recommendation Card */}
      {cleraRecommendation && (
        <div className="px-2 sm:px-4 pb-3">
          <Card className="clera-glow bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800 rounded-xl">
            <CardHeader className="pb-1 pt-3 px-3 lg:px-4">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-bold text-sm sm:text-base">
                  Clera's Rationale (Risk: {cleraRecommendation.risk_level})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3 px-3 lg:px-4">
              <div className="text-xs sm:text-sm text-foreground leading-relaxed">
                {(() => {
                  const formattedRationale = formatStockRationale(rationale || '');
                  const displayText = isRationaleLong && !isRationaleExpanded 
                    ? `${formattedRationale.substring(0, RATIONALE_LIMIT)}...` 
                    : formattedRationale;
                  
                  // Render each bullet/line with spacing for readability
                  const lines = displayText.split('\n').filter(l => l.trim().length > 0);
                  return (
                    <div className="space-y-2">
                      {lines.map((line, idx) => (
                        <p key={idx} className="whitespace-pre-line">{line}</p>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {isRationaleLong && (
                <button 
                  onClick={toggleRationale} 
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 mt-2 focus:outline-none focus:ring-0 font-medium"
                >
                  {isRationaleExpanded ? "Show Less" : "Show More"}
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stock Chart Section */}
      <div className="px-2 sm:px-4 pb-3">
        <StockChart symbol={profile.symbol} />
      </div>

      <div className="px-2 sm:px-4 pb-4 space-y-3">
        {/* Price & Market Cap */}
        <div className="border-b pb-3">
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Current Price</p>
              <p className="text-base sm:text-lg font-semibold">{formatCurrency(profile.price, profile.currency)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">Market Cap</p>
              <p className="text-base sm:text-lg font-semibold">{formatNumber(profile.mktCap)}</p>
            </div>
          </div>
        </div>

        {/* Key Stats Grid */}
        <div className="border-b pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-3 w-full">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Avg Volume</p>
              <p className="text-xs sm:text-sm font-medium">{formatNumber(profile.volAvg)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">52 Week Range</p>
              <p className="text-xs sm:text-sm font-medium">{profile.range || 'N/A'}</p>
            </div>
             <div className="text-center">
              <p className="text-xs text-muted-foreground">Beta</p>
              <p className="text-xs sm:text-sm font-medium">{profile.beta?.toFixed(2) ?? 'N/A'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Last Dividend</p>
              <p className="text-xs sm:text-sm font-medium">{formatCurrency(profile.lastDiv, profile.currency)}</p>
            </div>
             <div className="text-center">
              <p className="text-xs text-muted-foreground">CEO</p>
              <p className="text-xs sm:text-sm font-medium truncate">{profile.ceo || 'N/A'}</p>
            </div>
             <div className="text-center">
              <p className="text-xs text-muted-foreground">Website</p>
              {(() => {
                const validatedUrl = validateAndSanitizeExternalUrl(profile.website);
                return validatedUrl ? (
                  <a href={validatedUrl} target="_blank" rel="noopener noreferrer" className="text-xs sm:text-sm font-medium text-blue-600 hover:underline truncate block">
                    {validatedUrl.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">N/A</span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="border-b pb-3">
            <div className="w-full">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Description</p>
              <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                 {isDescriptionLong && !isDescriptionExpanded 
                     ? `${description.substring(0, DESCRIPTION_LIMIT)}...` 
                     : description
                 }
              </p>
              {isDescriptionLong && (
                  <button 
                     onClick={toggleDescription} 
                     className="text-xs sm:text-sm text-muted-foreground hover:text-primary mt-1 focus:outline-none focus:ring-0 font-medium"
                  >
                     {isDescriptionExpanded ? "Show Less" : "Show More"}
                  </button>
              )}
            </div>
          </div>
        )}

        {/* Price Target Summary */}
        {priceTarget && (Object.keys(priceTarget).length > 0) && (
          <div>
            <div className="w-full">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 text-center">Analyst Price Targets</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-muted p-2 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">Last Year Avg</p>
                      <p className="text-xs sm:text-sm font-semibold">
                        {priceTarget.lastYearAvgPriceTarget && priceTarget.lastYearAvgPriceTarget > 0 
                          ? formatCurrency(priceTarget.lastYearAvgPriceTarget, profile.currency)
                          : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">({priceTarget.lastYearCount} analysts)</p>
                  </div>
                   <div className="bg-muted p-2 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">Last Quarter Avg</p>
                      <p className="text-xs sm:text-sm font-semibold">
                        {priceTarget.lastQuarterAvgPriceTarget && priceTarget.lastQuarterAvgPriceTarget > 0
                          ? formatCurrency(priceTarget.lastQuarterAvgPriceTarget, profile.currency)
                          : 'N/A'}
                      </p>
                       <p className="text-xs text-muted-foreground">({priceTarget.lastQuarterCount} analysts)</p>
                  </div>
                   <div className="bg-muted p-2 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">Last Month Avg</p>
                      <p className="text-xs sm:text-sm font-semibold">
                        {priceTarget.lastMonthAvgPriceTarget && priceTarget.lastMonthAvgPriceTarget > 0
                          ? formatCurrency(priceTarget.lastMonthAvgPriceTarget, profile.currency) 
                          : 'N/A'}
                      </p>
                       <p className="text-xs text-muted-foreground">({priceTarget.lastMonthCount} analysts)</p>
                  </div>
                   <div className="bg-muted p-2 rounded-md text-center">
                      <p className="text-xs text-muted-foreground">All Time Avg</p>
                      <p className="text-xs sm:text-sm font-semibold">
                        {priceTarget.allTimeAvgPriceTarget && priceTarget.allTimeAvgPriceTarget > 0
                          ? formatCurrency(priceTarget.allTimeAvgPriceTarget, profile.currency)
                          : 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">({priceTarget.allTimeCount} analysts)</p>
                  </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
} 