"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface TradeActionButtonsProps {
  symbol: string;
  onInvestClick: (symbol: string) => void;
  onSellClick: (symbol: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'inline' | 'stacked' | 'minimal';
  size?: 'sm' | 'default' | 'lg';
}

const TradeActionButtons: React.FC<TradeActionButtonsProps> = ({
  symbol,
  onInvestClick,
  onSellClick,
  isLoading = false,
  disabled = false,
  variant = 'inline',
  size = 'sm'
}) => {
  const handleInvestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && !isLoading) {
      onInvestClick(symbol);
    }
  };

  const handleSellClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && !isLoading) {
      onSellClick(symbol);
    }
  };

  const investButtonClasses = `
    bg-green-500 hover:bg-green-600 text-white font-medium
    border-green-500 hover:border-green-600
    transition-all duration-200
    ${size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'}
  `;

  const sellButtonClasses = `
    bg-red-500 hover:bg-red-600 text-white font-medium
    border-red-500 hover:border-red-600
    transition-all duration-200
    ${size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm'}
  `;

  const buttonProps = {
    disabled: disabled || isLoading,
    size: size as "sm" | "default" | "lg"
  };

  if (variant === 'stacked') {
    return (
      <div className="flex flex-col gap-2 w-full">
        <Button
          {...buttonProps}
          className={investButtonClasses}
          onClick={handleInvestClick}
          aria-label={`Buy ${symbol}`}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Buy"
          )}
        </Button>
        <Button
          {...buttonProps}
          className={sellButtonClasses}
          onClick={handleSellClick}
          aria-label={`Sell ${symbol}`}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Sell"
          )}
        </Button>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className="flex gap-1">
        <Button
          {...buttonProps}
          variant="ghost"
          className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 px-2 py-1 text-xs font-medium h-auto"
          onClick={handleInvestClick}
          aria-label={`Buy ${symbol}`}
        >
          Buy
        </Button>
        <Button
          {...buttonProps}
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 px-2 py-1 text-xs font-medium h-auto"
          onClick={handleSellClick}
          aria-label={`Sell ${symbol}`}
        >
          Sell
        </Button>
      </div>
    );
  }

  // Default inline variant
  return (
    <div className="flex gap-2">
      <Button
        {...buttonProps}
        className={investButtonClasses}
        onClick={handleInvestClick}
        aria-label={`Buy ${symbol}`}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Buy"
        )}
      </Button>
      <Button
        {...buttonProps}
        className={sellButtonClasses}
        onClick={handleSellClick}
        aria-label={`Sell ${symbol}`}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Sell"
        )}
      </Button>
    </div>
  );
};

export default TradeActionButtons; 