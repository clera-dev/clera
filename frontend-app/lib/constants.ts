// Constants for rate limiting
export const DAILY_QUERY_LIMIT = 50; // Maximum number of queries per day
export const DAILY_QUERY_LIMIT_MESSAGE = "You've reached your daily limit of queries. Please try again tomorrow or upgrade your plan.";

// Add other application constants here as needed 

// Asset Allocation Colors - Clera Brand Gradient
export const ASSET_ALLOCATION_COLORS = {
  cash: '#87CEEB',    // Sky Blue (top of gradient)
  stock: '#4A90E2',   // Medium Blue (middle of gradient)  
  bond: '#2E5BBA'     // Deep Blue (bottom of gradient)
} as const; 