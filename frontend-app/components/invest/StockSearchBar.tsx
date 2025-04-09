'use client'

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

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

// Mock Asset Data (Replace with actual API call later if needed)
const popularAssets = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc. (Google)" },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "META", name: "Meta Platforms, Inc." },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
  { symbol: "JPM", name: "JPMorgan Chase & Co." },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "V", name: "Visa Inc." },
];

interface StockSearchBarProps {
  onStockSelect: (symbol: string) => void;
}

export default function StockSearchBar({ onStockSelect }: StockSearchBarProps) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("") // Stores the selected symbol
  const [searchTerm, setSearchTerm] = React.useState("") // Stores the input value

  // Filter assets based on search term (simple name/symbol matching)
  const filteredAssets = React.useMemo(() => {
    const lowerCaseSearch = searchTerm.toLowerCase();
    if (!lowerCaseSearch) return popularAssets; // Show all popular if search is empty

    return popularAssets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(lowerCaseSearch) ||
        asset.name.toLowerCase().includes(lowerCaseSearch)
    );
  }, [searchTerm]);

  const handleSelect = (currentValue: string) => {
    const selectedSymbol = currentValue.toUpperCase();
    setValue(selectedSymbol);
    setOpen(false);
    setSearchTerm(""); // Clear search term after selection
    onStockSelect(selectedSymbol); // Notify parent component
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-md justify-between text-muted-foreground hover:text-foreground"
        >
          {value
            ? popularAssets.find((asset) => asset.symbol === value)?.name ?? `Select ${value}...`
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
            <CommandEmpty>No stock found.</CommandEmpty>
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
                      value === asset.symbol ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 