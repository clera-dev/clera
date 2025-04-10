'use client'

import * as React from "react"
import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react"

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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
  const [selectedValue, setSelectedValue] = useState<string | null>(null); // Stores the selected symbol
  const [searchTerm, setSearchTerm] = useState("") // Stores the input value
  const [allAssets, setAllAssets] = useState<Asset[]>([]); // Store all fetched assets
  const [isLoading, setIsLoading] = useState(true); // Loading state
  const [error, setError] = useState<string | null>(null); // Error state

  // Fetch all assets on component mount
  useEffect(() => {
    const fetchAssets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/market/assets'); // Use the backend endpoint
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.detail || result.message || 'Failed to fetch assets');
        }
        setAllAssets(result.assets || []);
      } catch (err: any) {
        console.error("Error fetching assets:", err);
        setError(err.message || 'Could not load stock data.');
        setAllAssets([]); // Clear assets on error
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssets();
  }, []); // Empty dependency array means run once on mount

  // Filter assets based on search term
  const filteredAssets = useMemo(() => {
    const lowerCaseSearch = searchTerm.toLowerCase();
    if (!lowerCaseSearch) return allAssets.slice(0, 50); // Show first 50 if search is empty

    return allAssets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(lowerCaseSearch) ||
        asset.name.toLowerCase().includes(lowerCaseSearch)
    ).slice(0, 50); // Limit results for performance
  }, [searchTerm, allAssets]);

  const handleSelect = (currentValue: string) => {
    const selectedSymbol = currentValue.toUpperCase();
    setSelectedValue(selectedSymbol); // Update selected value state
    setOpen(false);
    setSearchTerm(""); // Clear search term after selection
    onStockSelect(selectedSymbol); // Notify parent component
  };

  // Get the name of the selected asset
  const selectedAssetName = useMemo(() => {
     if (!selectedValue) return null;
     return allAssets.find(asset => asset.symbol === selectedValue)?.name;
  }, [selectedValue, allAssets]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-md justify-between text-muted-foreground hover:text-foreground"
          disabled={isLoading || !!error} // Disable button while loading or if error
        >
          {isLoading 
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Stocks...</>
            : error
            ? `Error: ${error}`
            : selectedValue
            ? selectedAssetName ?? `Select ${selectedValue}...`
            : "Search for a stock (e.g., AAPL, TSLA)..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}> {/* We handle filtering manually */}
          {/* Wrap Input and Icon */}
          <div className="relative flex items-center px-2 border-b">
             <Search className="absolute left-4 h-4 w-4 text-muted-foreground" /> {/* Position Icon */}
             <CommandInput 
                placeholder="Search stock symbol or name..." 
                value={searchTerm}
                onValueChange={setSearchTerm} 
                className="h-9 w-full pl-8 pr-4 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 border-0" // Adjust padding for icon and remove border/ring
             />
          </div>
          <CommandList>
            {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : error ? (
                <div className="p-4 text-center text-sm text-destructive">{error}</div>
            ) : filteredAssets.length === 0 ? (
                <CommandEmpty>No stock found.</CommandEmpty>
            ) : (
                <CommandGroup heading="Suggestions">
                {filteredAssets.map((asset) => (
                    <CommandItem
                    key={asset.symbol}
                    value={asset.symbol} // Use symbol as the value for selection
                    onSelect={handleSelect}
                    >
                    <span className="font-medium mr-2">{asset.symbol}</span>
                    <span className="text-muted-foreground">{asset.name}</span>
                    <Check
                        className={cn(
                        "ml-auto h-4 w-4",
                        selectedValue === asset.symbol ? "opacity-100" : "opacity-0"
                        )}
                    />
                    </CommandItem>
                ))}
                </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 