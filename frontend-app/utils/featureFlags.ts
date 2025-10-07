// Centralized feature flag utility for the frontend
// Keep all flag names here to avoid scattering string literals across the codebase

export enum FeatureFlagName {
  ENABLE_ADD_FUNDS = 'ENABLE_ADD_FUNDS',
}

const envVarByFlag: Record<FeatureFlagName, string> = {
  [FeatureFlagName.ENABLE_ADD_FUNDS]: 'NEXT_PUBLIC_ENABLE_ADD_FUNDS',
};

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  const envVarName = envVarByFlag[flag];
  const value = process.env[envVarName];
  return String(value).toLowerCase() === 'true';
}







