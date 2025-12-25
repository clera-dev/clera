'use client'

import * as React from "react"
import { useState, useEffect, useMemo } from "react";
import { Check, Search, Loader2, X, Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CompanyLogo } from "@/components/ui/CompanyLogo"
import { useCompanyProfiles } from "@/hooks/useCompanyProfile"
import { ResearchMethodModal } from "@/components/invest/ResearchMethodModal"

// Define Asset type
interface Asset {
  symbol: string;
  name: string;
}

interface StockSearchBarProps {
  onStockSelect: (symbol: string) => void;
  accountId?: string | null;
  watchlistSymbols?: Set<string>;
  onWatchlistChange?: () => void;
  onOptimisticAdd?: (symbol: string) => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  showTriggerButton?: boolean;
}

export default function StockSearchBar({ onStockSelect, accountId, watchlistSymbols, onWatchlistChange, onOptimisticAdd, externalOpen, onExternalOpenChange, showTriggerButton = true }: StockSearchBarProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [researchMethodOpen, setResearchMethodOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("") 
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localWatchlistSymbols, setLocalWatchlistSymbols] = useState<Set<string>>(new Set());
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);

  // Use external open state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onExternalOpenChange || setInternalOpen;

  // Use prop watchlist symbols if provided, otherwise use local state
  const currentWatchlistSymbols = watchlistSymbols || localWatchlistSymbols;
  
  // Fetch all assets on component mount
  useEffect(() => {
    const fetchAssets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/market/assets'); 
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.detail || result.message || 'Failed to fetch assets');
        }
        setAllAssets(result.assets || []);
      } catch (err: any) {
        console.error("Error fetching assets:", err);
        setError(err.message || 'Could not load stock data.');
        setAllAssets([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssets();
  }, []);

  // Fetch watchlist data only if not provided via props
  useEffect(() => {
    if (watchlistSymbols) return; // Skip if watchlist provided via props
    
    const fetchWatchlist = async () => {
      if (!accountId) {
        setLocalWatchlistSymbols(new Set());
        return;
      }
      
      try {
        const response = await fetch(`/api/watchlist/${accountId}`);
        
        if (response.ok) {
          const result = await response.json();
          setLocalWatchlistSymbols(new Set(result.symbols || []));
        }
      } catch (err) {
        console.warn('Failed to fetch watchlist for search:', err);
      }
    };

    fetchWatchlist();
  }, [accountId, watchlistSymbols]);

  // Add/remove from watchlist
  const toggleWatchlist = async (symbol: string, isInWatchlist: boolean) => {
    if (!accountId || isUpdatingWatchlist) return;
    
    setIsUpdatingWatchlist(true);
    
    // IMMEDIATE UI UPDATE: Use optimistic update for instant feedback
    if (!isInWatchlist && onOptimisticAdd) {
      onOptimisticAdd(symbol);
    }
    
    // Update local state if not using props (for internal state management)
    if (!watchlistSymbols) {
      const newWatchlistSymbols = new Set(localWatchlistSymbols);
      if (isInWatchlist) {
        newWatchlistSymbols.delete(symbol);
      } else {
        newWatchlistSymbols.add(symbol);
      }
      setLocalWatchlistSymbols(newWatchlistSymbols);
    }
    
    try {
      const endpoint = isInWatchlist ? 'remove' : 'add';
      const method = isInWatchlist ? 'DELETE' : 'POST';
      
      const response = await fetch(`/api/watchlist/${accountId}/${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase() })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to ${isInWatchlist ? 'remove' : 'add'} ${symbol}`);
      }

      // Call parent refresh callback for data consistency
      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (err) {
      console.error('Error toggling watchlist:', err);
      
      // ROLLBACK: Revert optimistic update on error
      if (!isInWatchlist && onOptimisticAdd) {
        // For adding that failed, we need a remove function - but we don't have onOptimisticRemove in props
        // For now, we'll rely on the parent's onWatchlistChange to refresh and fix the state
        if (onWatchlistChange) {
          onWatchlistChange();
        }
      }
      
      // Revert local state if not using props
      if (!watchlistSymbols) {
        const revertedWatchlistSymbols = new Set(localWatchlistSymbols);
        if (isInWatchlist) {
          revertedWatchlistSymbols.add(symbol);
        } else {
          revertedWatchlistSymbols.delete(symbol);
        }
        setLocalWatchlistSymbols(revertedWatchlistSymbols);
      }
    } finally {
      setIsUpdatingWatchlist(false);
    }
  };

  // Filter and rank assets based on search term with smart prioritization
  const filteredAssets = useMemo(() => {
    const lowerCaseSearch = searchTerm.toLowerCase().trim();
    if (!lowerCaseSearch) return allAssets.slice(0, 50);

    // Normalize search: replace spaces with flexible matching (handles "coca cola" matching "Coca-Cola")
    const normalizedSearch = lowerCaseSearch.replace(/\s+/g, '');
    const searchWords = lowerCaseSearch.split(/\s+/).filter(w => w.length > 0);

    // Score each asset based on match quality
    const scoredAssets = allAssets
      .map((asset) => {
        const symbolLower = asset.symbol.toLowerCase();
        const nameLower = asset.name.toLowerCase();
        // Normalize name by removing hyphens and spaces for fuzzy matching
        const nameNormalized = nameLower.replace(/[-\s]+/g, '');
        
        let score = 0;
        
        // Priority 1: Exact symbol match (highest priority)
        if (symbolLower === lowerCaseSearch || symbolLower === normalizedSearch) {
          score = 1000;
        }
        // Priority 2: Symbol starts with search term
        else if (symbolLower.startsWith(lowerCaseSearch) || symbolLower.startsWith(normalizedSearch)) {
          // Shorter symbols get higher scores (more relevant)
          score = 800 - (symbolLower.length - lowerCaseSearch.length) * 5;
        }
        // Priority 3: Name starts with search term (exact or normalized)
        else if (nameLower.startsWith(lowerCaseSearch) || nameNormalized.startsWith(normalizedSearch)) {
          score = 600;
        }
        // Priority 4: All search words found at word boundaries in name
        else if (searchWords.length > 1 && searchWords.every(word => 
          new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(nameLower)
        )) {
          score = 500;
        }
        // Priority 5: Name contains search term at word boundary
        else if (new RegExp(`\\b${searchWords[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(nameLower)) {
          score = 400;
        }
        // Priority 6: Symbol contains search term
        else if (symbolLower.includes(lowerCaseSearch) || symbolLower.includes(normalizedSearch)) {
          score = 200;
        }
        // Priority 7: Name contains search term anywhere (normalized match)
        else if (nameNormalized.includes(normalizedSearch)) {
          score = 150;
        }
        // Priority 8: Name contains search term anywhere
        else if (nameLower.includes(lowerCaseSearch)) {
          score = 100;
        }
        
        return { asset, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        // Sort by score descending, then by symbol length ascending (shorter = more relevant)
        if (b.score !== a.score) return b.score - a.score;
        return a.asset.symbol.length - b.asset.symbol.length;
      })
      .slice(0, 50)
      .map(({ asset }) => asset);

    return scoredAssets;
  }, [searchTerm, allAssets]);

  // Get company profiles for filtered assets to show logos
  const symbols = filteredAssets.map(asset => asset.symbol);
  const { profiles, getProfile } = useCompanyProfiles(symbols);

  const handleSelect = (currentValue: string) => {
    const selectedSymbol = currentValue.toUpperCase();
    setOpen(false);
    setSearchTerm("");
    onStockSelect(selectedSymbol);
  };

  const handleManualResearch = () => {
    setOpen(true);
  };

  return (
    <div className="relative w-full">
      {/* Trigger Button - only show if showTriggerButton is true */}
      {showTriggerButton && (
        <Button
          variant="outline"
          onClick={() => setResearchMethodOpen(true)}
          disabled={isLoading}
          className="relative w-full justify-start border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 h-12 px-4 py-2 shadow-sm rounded-lg"
        >
          <div className="flex items-center gap-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {isLoading ? "Loading..." : "Search for stocks..."}
            </span>
          </div>
        </Button>
      )}

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 sm:max-w-[550px] overflow-hidden border-0 shadow-xl rounded-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Search Stocks</DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false} className="rounded-lg">
            <CommandInput 
              placeholder="Search for a stock symbol or company name..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
              autoFocus
              className="border-none h-14 px-4 text-base focus:ring-0"
            />
            <CommandList className="max-h-[400px] overflow-auto p-2">
              {isLoading ? (
                <div className="py-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                  <p className="text-sm text-muted-foreground">Loading stocks...</p>
                </div>
              ) : error ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              ) : filteredAssets.length === 0 ? (
                <CommandEmpty className="py-6 text-center">No stocks matching "{searchTerm}"</CommandEmpty>
              ) : (
                <CommandGroup heading="Stocks" className="pb-2">
                  {filteredAssets.map((asset) => {
                    const profile = getProfile(asset.symbol);
                    const isInWatchlist = currentWatchlistSymbols.has(asset.symbol);
                    
                    return (
                      <CommandItem
                        key={asset.symbol}
                        value={asset.symbol}
                        onSelect={handleSelect}
                        className="cursor-pointer p-3 my-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors data-[selected=true]:bg-slate-200 dark:data-[selected=true]:bg-slate-700 flex items-center"
                      >
                        <div className="mr-3">
                          <CompanyLogo
                            symbol={asset.symbol}
                            companyName={profile?.companyName || asset.name}
                            imageUrl={profile?.image || undefined}
                            size="md"
                            className="border border-slate-300 dark:border-slate-600"
                          />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate font-semibold">{asset.symbol}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {profile?.companyName || asset.name}
                          </p>
                        </div>
                        {accountId && (
                          <div className="ml-3 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "p-1 h-8 w-8 transition-all duration-200",
                                isInWatchlist 
                                  ? "text-yellow-500 hover:text-yellow-600 scale-110" 
                                  : "text-slate-400 hover:text-yellow-500 border border-yellow-500/30"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleWatchlist(asset.symbol, isInWatchlist);
                              }}
                              disabled={isUpdatingWatchlist}
                            >
                              <Star 
                                className={cn(
                                  "h-4 w-4 transition-all duration-200",
                                  isInWatchlist 
                                    ? "fill-yellow-500 text-yellow-500" 
                                    : "fill-transparent"
                                )}
                              />
                            </Button>
                          </div>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Research Method Modal */}
      <ResearchMethodModal
        isOpen={researchMethodOpen}
        onClose={() => setResearchMethodOpen(false)}
        onManualSearch={handleManualResearch}
      />
    </div>
  )
} 