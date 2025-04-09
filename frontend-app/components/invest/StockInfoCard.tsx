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
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StockInfoCardProps {
  symbol: string;
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

// Helper to format large numbers
const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return 'N/A';
  if (Math.abs(num) >= 1e12) {
    return (num / 1e12).toFixed(2) + 'T';
  }
  if (Math.abs(num) >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B';
  }
  if (Math.abs(num) >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  }
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Helper to format currency
const formatCurrency = (num: number | null | undefined, currency: string = 'USD'): string => {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString(undefined, { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function StockInfoCard({ symbol }: StockInfoCardProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [priceTarget, setPriceTarget] = useState<PriceTargetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const DESCRIPTION_LIMIT = 150;

  useEffect(() => {
    if (!symbol) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setProfile(null);
      setPriceTarget(null);
      setIsDescriptionExpanded(false);
      
      try {
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
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-20 w-full" />
           <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
       <Alert variant="destructive" className="w-full max-w-2xl mx-auto">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Fetching Data for {symbol}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
    );
  }

  if (!profile) {
     return (
       <div className="text-center text-muted-foreground py-10 w-full max-w-2xl mx-auto">
          No profile data found for {symbol}.
       </div>
     );
  }

  const description = profile.description;
  const isDescriptionLong = description && description.length > DESCRIPTION_LIMIT;

  const toggleDescription = () => {
      setIsDescriptionExpanded(!isDescriptionExpanded);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-2xl font-bold">{profile.companyName} ({profile.symbol})</CardTitle>
          <CardDescription>{profile.exchangeShortName} | {profile.sector} | {profile.industry}</CardDescription>
        </div>
        {profile.image && 
            <img src={profile.image} alt={`${profile.companyName} logo`} className="h-12 w-12 rounded-md object-contain bg-muted p-1" />
        }
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price & Market Cap */}
        <div className="grid grid-cols-2 gap-4 border-b pb-4">
           <div>
             <p className="text-sm text-muted-foreground">Price</p>
             <p className="text-xl font-semibold">{formatCurrency(profile.price, profile.currency)}</p>
           </div>
           <div>
             <p className="text-sm text-muted-foreground">Market Cap</p>
             <p className="text-xl font-semibold">{formatNumber(profile.mktCap)}</p>
           </div>
        </div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 border-b pb-4">
          <div>
            <p className="text-xs text-muted-foreground">Avg Volume</p>
            <p className="text-sm font-medium">{formatNumber(profile.volAvg)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">52 Week Range</p>
            <p className="text-sm font-medium">{profile.range || 'N/A'}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">Beta</p>
            <p className="text-sm font-medium">{profile.beta?.toFixed(2) ?? 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Dividend</p>
            <p className="text-sm font-medium">{formatCurrency(profile.lastDiv, profile.currency)}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">CEO</p>
            <p className="text-sm font-medium truncate">{profile.ceo || 'N/A'}</p>
          </div>
           <div>
            <p className="text-xs text-muted-foreground">Website</p>
            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline truncate block">
              {profile.website?.replace(/^https?:\/\//, '') || 'N/A'}
            </a>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div className="border-b pb-4">
             <p className="text-sm text-muted-foreground mb-1">Description</p>
             <p className="text-sm text-foreground leading-relaxed">
                {isDescriptionLong && !isDescriptionExpanded 
                    ? `${description.substring(0, DESCRIPTION_LIMIT)}...` 
                    : description
                }
             </p>
             {isDescriptionLong && (
                 <button 
                    onClick={toggleDescription} 
                    className="text-sm text-muted-foreground hover:text-primary mt-1 focus:outline-none focus:ring-0 font-medium"
                 >
                    {isDescriptionExpanded ? "Show Less" : "Show More"}
                 </button>
             )}
          </div>
        )}

        {/* Price Target Summary */}
        {priceTarget && (Object.keys(priceTarget).length > 0) && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Analyst Price Targets</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-muted p-2 rounded-md text-center">
                    <p className="text-xs text-muted-foreground">Last Year Avg</p>
                    <p className="text-md font-semibold">{formatCurrency(priceTarget.lastYearAvgPriceTarget, profile.currency)}</p>
                    <p className="text-xs text-muted-foreground">({priceTarget.lastYearCount} analysts)</p>
                </div>
                 <div className="bg-muted p-2 rounded-md text-center">
                    <p className="text-xs text-muted-foreground">Last Quarter Avg</p>
                    <p className="text-md font-semibold">{formatCurrency(priceTarget.lastQuarterAvgPriceTarget, profile.currency)}</p>
                     <p className="text-xs text-muted-foreground">({priceTarget.lastQuarterCount} analysts)</p>
                </div>
                 <div className="bg-muted p-2 rounded-md text-center">
                    <p className="text-xs text-muted-foreground">Last Month Avg</p>
                    <p className="text-md font-semibold">{formatCurrency(priceTarget.lastMonthAvgPriceTarget, profile.currency)}</p>
                     <p className="text-xs text-muted-foreground">({priceTarget.lastMonthCount} analysts)</p>
                </div>
                 <div className="bg-muted p-2 rounded-md text-center">
                    <p className="text-xs text-muted-foreground">All Time Avg</p>
                    <p className="text-md font-semibold">{formatCurrency(priceTarget.allTimeAvgPriceTarget, profile.currency)}</p>
                    <p className="text-xs text-muted-foreground">({priceTarget.allTimeCount} analysts)</p>
                </div>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
} 