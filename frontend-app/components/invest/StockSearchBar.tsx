'use client'

import * as React from "react"
import { useState, useEffect, useMemo } from "react";
import { Check, Search, Loader2, X } from "lucide-react"

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

// Define Asset type
interface Asset {
  symbol: string;
  name: string;
}

interface StockSearchBarProps {
  onStockSelect: (symbol: string) => void;
}

export default function StockSearchBar({ onStockSelect }: StockSearchBarProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("") 
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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

  // Filter assets based on search term
  const filteredAssets = useMemo(() => {
    const lowerCaseSearch = searchTerm.toLowerCase().trim();
    if (!lowerCaseSearch) return allAssets.slice(0, 50);

    return allAssets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(lowerCaseSearch) ||
        asset.name.toLowerCase().includes(lowerCaseSearch)
    ).slice(0, 50);
  }, [searchTerm, allAssets]);

  const handleSelect = (currentValue: string) => {
    const selectedSymbol = currentValue.toUpperCase();
    setOpen(false);
    setSearchTerm("");
    onStockSelect(selectedSymbol);
  };

  return (
    <div className="relative w-full">
      {/* Trigger Button */}
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isLoading}
        className="relative w-full justify-between border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 h-12 px-4 py-2 shadow-sm rounded-lg"
      >
        <div className="flex items-center">
          <span className="text-sm">
            {isLoading ? "Loading..." : "Search for stocks..."}
          </span>
        </div>
      </Button>

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
                  {filteredAssets.map((asset) => (
                    <CommandItem
                      key={asset.symbol}
                      value={asset.symbol}
                      onSelect={handleSelect}
                      className="cursor-pointer p-3 my-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors data-[selected=true]:bg-slate-200 dark:data-[selected=true]:bg-slate-700"
                    >
                      <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm font-semibold">
                        {asset.symbol.charAt(0)}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate font-semibold">{asset.symbol}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {asset.name}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
} 