"use client";

import React from 'react';
import { Building2, Layers, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Account {
  account_id: string;
  institution_name: string;
  account_name?: string;
  account_type?: string;
  total_value?: number;
  holdings_count?: number;
}

interface AccountBreakdownSelectorProps {
  selectedFilter: 'total' | string;
  onFilterChange: (filter: 'total' | string) => void;
  accounts: Account[];
  className?: string;
}

export default function AccountBreakdownSelector({
  selectedFilter,
  onFilterChange,
  accounts,
  className
}: AccountBreakdownSelectorProps) {
  // Don't render if there's only one or no accounts
  if (!accounts || accounts.length <= 1) {
    return null;
  }

  const getSelectedLabel = () => {
    if (selectedFilter === 'total') {
      return 'All Accounts';
    }
    const account = accounts.find(a => a.account_id === selectedFilter);
    return account?.institution_name || 'Select Account';
  };

  const formatValue = (value?: number) => {
    if (value === undefined || value === null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground hidden sm:inline">View:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-2 min-w-[140px] justify-between"
          >
            <div className="flex items-center gap-2">
              {selectedFilter === 'total' ? (
                <Layers className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Building2 className="h-3.5 w-3.5" />
              )}
              <span className="truncate max-w-[100px]">{getSelectedLabel()}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Portfolio View
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* All Accounts (Aggregate) */}
          <DropdownMenuItem
            onClick={() => onFilterChange('total')}
            className={cn(
              "flex items-center justify-between cursor-pointer",
              selectedFilter === 'total' && "bg-accent"
            )}
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <div>
                <div className="font-medium">All Accounts</div>
                <div className="text-xs text-muted-foreground">
                  Combined view of {accounts.length} accounts
                </div>
              </div>
            </div>
            {selectedFilter === 'total' && (
              <Badge variant="secondary" className="text-xs">Active</Badge>
            )}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Individual Accounts
          </DropdownMenuLabel>
          
          {/* Individual Accounts */}
          {accounts.map((account) => (
            <DropdownMenuItem
              key={account.account_id}
              onClick={() => onFilterChange(account.account_id)}
              className={cn(
                "flex items-center justify-between cursor-pointer",
                selectedFilter === account.account_id && "bg-accent"
              )}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{account.institution_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {account.account_name || account.account_type || 'Investment Account'}
                    {account.holdings_count !== undefined && (
                      <span> · {account.holdings_count} holdings</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {account.total_value !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {formatValue(account.total_value)}
                  </span>
                )}
                {selectedFilter === account.account_id && (
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

