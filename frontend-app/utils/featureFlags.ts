// Centralized feature flag utility for the frontend
// Keep all flag names here to avoid scattering string literals across the codebase

export enum FeatureFlagName {
  ENABLE_ADD_FUNDS = 'ENABLE_ADD_FUNDS',
}

/**
 * Check if a feature flag is enabled
 * 
 * ARCHITECTURE FIX: Next.js requires static property access to bundle environment variables.
 * Dynamic indexing (process.env[key]) returns undefined because Next.js can't statically
 * analyze which variables to inject at build time.
 * 
 * This implementation uses a switch statement with static property access to ensure
 * all environment variables are properly bundled into the client.
 */
export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  let value: string | undefined;
  
  // ARCHITECTURE FIX: Use static property access for each flag
  // This allows Next.js to properly inject env vars at build time
  switch (flag) {
    case FeatureFlagName.ENABLE_ADD_FUNDS:
      value = process.env.NEXT_PUBLIC_ENABLE_ADD_FUNDS;
      break;
    default:
      console.warn(`Unknown feature flag: ${flag}`);
      return false;
  }
  
  return String(value).toLowerCase() === 'true';
}







