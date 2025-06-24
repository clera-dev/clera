import { useState, useEffect, useMemo } from 'react';

interface CompanyProfile {
  symbol: string;
  price: number | null;
  beta: number | null;
  volAvg: number | null;
  mktCap: number | null;
  lastDiv: number | null;
  range: string | null;
  changes: number | null;
  companyName: string;
  currency: string;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  exchange: string | null;
  exchangeShortName: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  ceo: string | null;
  sector: string | null;
  country: string | null;
  fullTimeEmployees: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dcfDiff: number | null;
  dcf: number | null;
  image: string | null;
  ipoDate: string | null;
  defaultImage: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
  isAdr: boolean;
  isFund: boolean;
}

// In-memory cache for company profiles
const profileCache = new Map<string, CompanyProfile>();
// Cache for known 404s to avoid repeated requests
const notFoundCache = new Set<string>();

// Helper function to check if a symbol is likely not available in our system
function isLikelyUnavailableSymbol(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  // Check for common patterns of symbols that aren't in FMP/our system
  return (
    upperSymbol.includes('.WS') ||    // Warrants (.WS)
    upperSymbol.includes('.U') ||     // Units (.U) 
    upperSymbol.includes('.WT') ||    // Warrants (.WT)
    upperSymbol.includes('.RT') ||    // Rights (.RT)
    upperSymbol.includes('.TO') ||    // Toronto exchange
    upperSymbol.includes('.V') ||     // TSX Venture
    upperSymbol.includes('.CN') ||    // Canadian securities
    upperSymbol.length > 5            // Very long symbols are often special securities
  );
}

export function useCompanyProfile(symbol: string | null) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = symbol?.toUpperCase();

  useEffect(() => {
    if (!symbol) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Check if we know this symbol is not found
    if (cacheKey && notFoundCache.has(cacheKey)) {
      setProfile(null);
      setError(`No profile found for ${symbol}`);
      setLoading(false);
      return;
    }

    // Check cache first
    if (cacheKey && profileCache.has(cacheKey)) {
      const cachedProfile = profileCache.get(cacheKey)!;
      setProfile(cachedProfile);
      setError(null);
      setLoading(false);
      return;
    }

    // Skip fetching for symbols that are likely unavailable
    if (isLikelyUnavailableSymbol(symbol)) {
      if (cacheKey) {
        notFoundCache.add(cacheKey);
      }
      setProfile(null);
      setError(`Symbol ${symbol} not available in our database`);
      setLoading(false);
      return;
    }

    // Fetch from API
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/companies/profiles/${symbol.toUpperCase()}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            // Add to not found cache to avoid future requests
            if (cacheKey) {
              notFoundCache.add(cacheKey);
            }
            throw new Error(`No profile found for ${symbol}`);
          }
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const profileData: CompanyProfile = await response.json();
        
        // Cache the result
        if (cacheKey) {
          profileCache.set(cacheKey, profileData);
        }
        
        setProfile(profileData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [symbol, cacheKey]);

  // Memoized derived values
  const logoUrl = useMemo(() => {
    if (!profile?.image || profile.defaultImage) {
      return null;
    }
    return profile.image;
  }, [profile?.image, profile?.defaultImage]);

  const displayName = useMemo(() => {
    return profile?.companyName || symbol || '';
  }, [profile?.companyName, symbol]);

  return {
    profile,
    loading,
    error,
    logoUrl,
    displayName,
    // Helper methods
    clearCache: () => {
      if (cacheKey) {
        profileCache.delete(cacheKey);
        notFoundCache.delete(cacheKey);
      }
    },
    refreshProfile: () => {
      if (cacheKey) {
        profileCache.delete(cacheKey);
        notFoundCache.delete(cacheKey);
        // Re-trigger the effect by updating a dependency
        // Since useEffect depends on symbol, we'll need to re-fetch
      }
    }
  };
}

// Hook for fetching multiple company profiles
export function useCompanyProfiles(symbols: string[]) {
  const [profiles, setProfiles] = useState<Map<string, CompanyProfile>>(new Map());
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (symbols.length === 0) {
      setProfiles(new Map());
      setErrors(new Map());
      setLoading(false);
      return;
    }

    const fetchProfiles = async () => {
      setLoading(true);
      const newProfiles = new Map<string, CompanyProfile>();
      const newErrors = new Map<string, string>();

      // Process symbols in parallel, but skip likely unavailable ones
      const fetchPromises = symbols.map(async (symbol) => {
        const upperSymbol = symbol.toUpperCase();
        
        try {
          // Check if we know this symbol is not found
          if (notFoundCache.has(upperSymbol)) {
            newErrors.set(upperSymbol, `Symbol ${symbol} not available in our database`);
            return;
          }

          // Check cache first
          if (profileCache.has(upperSymbol)) {
            newProfiles.set(upperSymbol, profileCache.get(upperSymbol)!);
            return;
          }

          // Skip fetching for symbols that are likely unavailable
          if (isLikelyUnavailableSymbol(symbol)) {
            notFoundCache.add(upperSymbol);
            newErrors.set(upperSymbol, `Symbol ${symbol} not available in our database`);
            return;
          }

          const response = await fetch(`/api/companies/profiles/${upperSymbol}`);
          
          if (!response.ok) {
            if (response.status === 404) {
              // Add to not found cache to avoid future requests
              notFoundCache.add(upperSymbol);
              throw new Error(`No profile found for ${symbol}`);
            }
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const profileData: CompanyProfile = await response.json();
          
          // Cache the result
          profileCache.set(upperSymbol, profileData);
          newProfiles.set(upperSymbol, profileData);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          newErrors.set(upperSymbol, errorMessage);
        }
      });

      await Promise.all(fetchPromises);
      
      setProfiles(newProfiles);
      setErrors(newErrors);
      setLoading(false);
    };

    fetchProfiles();
  }, [JSON.stringify(symbols)]); // Use JSON.stringify to properly compare arrays

  return {
    profiles,
    loading,
    errors,
    getProfile: (symbol: string) => profiles.get(symbol.toUpperCase()),
    getError: (symbol: string) => errors.get(symbol.toUpperCase()),
    hasError: (symbol: string) => errors.has(symbol.toUpperCase()),
  };
} 