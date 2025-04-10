import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to format large numbers
export const formatNumber = (num: number | null | undefined): string => {
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
  // Format smaller numbers or those without suffixes
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); 
};

// Helper to format currency
export const formatCurrency = (num: number | null | undefined, currency: string = 'USD'): string => {
  if (num === null || num === undefined) return 'N/A';
  // Check if the number is extremely small and format appropriately
  if (Math.abs(num) < 0.01 && Math.abs(num) > 0) {
      return num.toLocaleString(undefined, { style: 'currency', currency: currency, minimumSignificantDigits: 1, maximumSignificantDigits: 3 });
  }
  // Default formatting for most numbers
  return num.toLocaleString(undefined, { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
