/**
 * Security Utilities
 * 
 * SECURITY: This module implements protection against open-redirect attacks.
 * All redirect URLs are validated to ensure they are safe, same-origin paths.
 * 
 * Security Features:
 * - URL validation against whitelist of allowed paths
 * - Prevention of directory traversal attacks
 * - Blocking of sensitive routes (API, admin, etc.)
 * - Protection against URL encoding attacks
 * - Protection against backslash attacks
 * - Logging of invalid redirect attempts
 * - Graceful fallback to safe default routes
 * 
 * Allowed redirect paths: /dashboard, /portfolio, /invest, /news, /chat, /settings, /account, /info
 * Blocked patterns: /api/, /_next/, /admin/, /internal/, /debug/, /test/, /protected/, /auth/
 * 
 * This utility is designed to be used in both client and server contexts.
 */

/**
 * Validates that a redirect URL is safe and same-origin
 * @param url The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Must start with '/' to be a relative path
  if (!url.startsWith('/')) {
    return false;
  }
  
  // Prevent directory traversal attacks
  if (url.includes('..') || url.includes('//')) {
    return false;
  }
  
  // Prevent backslash attacks (directory traversal)
  if (url.includes('\\')) {
    return false;
  }
  
  // Allow legitimate URL encoding but prevent double-encoding attacks
  // Check for suspicious patterns like %2e%2e (encoded ..) or %2f%2f (encoded //)
  // Use case-insensitive check to prevent bypass attempts
  if (url.toLowerCase().includes('%2e%2e') || url.toLowerCase().includes('%2f%2f') || url.toLowerCase().includes('%5c')) {
    return false;
  }
  
  // Extract the path part before query parameters and hash
  const pathPart = url.split('?')[0].split('#')[0];
  
  // Only allow safe paths within the application
  const allowedPaths = [
    '/dashboard',
    '/portfolio', 
    '/invest',
    '/news',
    '/chat',
    '/settings',
    '/account',
    '/info'
  ];
  
  // Check if the path starts with any allowed path
  const isAllowedPath = allowedPaths.some(path => pathPart.startsWith(path));
  
  // Additional safety: ensure it's not trying to access sensitive routes
  const blockedPatterns = [
    '/api/',
    '/_next/',
    '/admin/',
    '/internal/',
    '/debug/',
    '/test/',
    '/protected/',
    '/auth/'
  ];
  
  const isBlockedPath = blockedPatterns.some(pattern => pathPart.startsWith(pattern));
  
  return isAllowedPath && !isBlockedPath;
}

/**
 * Get a safe default redirect URL when validation fails
 * @returns A safe default redirect path
 */
export function getSafeDefaultRedirect(): string {
  return '/portfolio';
}

/**
 * Validates and sanitizes a redirect URL, returning a safe fallback if invalid
 * @param url The URL to validate and sanitize
 * @returns A safe redirect URL
 */
export function validateAndSanitizeRedirectUrl(url: string): string {
  if (isValidRedirectUrl(url)) {
    return url;
  }
  
  // Log the invalid URL for security monitoring
  console.warn('[Security] Invalid redirect URL detected:', url);
  
  // Return safe default
  return getSafeDefaultRedirect();
} 

/**
 * Security utilities for domain validation and SSRF prevention
 * 
 * These functions are critical for preventing security vulnerabilities
 * and must be thoroughly tested and maintained consistently.
 */

/**
 * Securely validates if a domain matches a wildcard pattern
 * Prevents SSRF attacks by ensuring only proper subdomains are allowed
 * 
 * SECURITY: This function implements strict wildcard matching that:
 * - Rejects base domain matches (e.g., "example.com" does NOT match "*.example.com")
 * - Only allows proper subdomains (e.g., "api.example.com" matches "*.example.com")
 * - Prevents SSRF attacks by maintaining strict allowlist boundaries
 * - Ensures wildcard patterns behave as expected for security
 * 
 * @param domain - The domain to validate (e.g., "api.example.com")
 * @param wildcardPattern - The wildcard pattern (e.g., "*.example.com")
 * @returns true if domain is a valid match, false otherwise
 */
export const isSecureWildcardMatch = (domain: string, wildcardPattern: string): boolean => {
  if (!wildcardPattern.startsWith('*.')) {
    return false;
  }
  
  const baseDomain = wildcardPattern.substring(2); // Remove "*.", so "*.example.com" -> "example.com"
  
  // SECURITY: Wildcard patterns should NOT match the base domain
  // This prevents SSRF attacks by ensuring only proper subdomains are allowed
  if (domain === baseDomain) {
    return false;
  }
  
  // Case 2: Proper subdomain match
  // Ensure domain ends with the base domain
  if (!domain.endsWith(baseDomain)) {
    return false;
  }
  
  // Check that there's a dot separator before the base domain
  const dotIndex = domain.length - baseDomain.length - 1;
  if (dotIndex < 0 || domain.charAt(dotIndex) !== '.') {
    return false;
  }
  
  // Ensure the part before the dot is not empty (prevents "..example.com")
  const subdomainPart = domain.substring(0, dotIndex);
  if (subdomainPart.length === 0) {
    return false;
  }
  
  // Additional security check: ensure the subdomain part doesn't start or end with a dot
  // This prevents domains like ".example.com" or "example.com."
  if (subdomainPart.startsWith('.') || subdomainPart.endsWith('.')) {
    return false;
  }
  
  return true;
};

/**
 * Validates and sanitizes a stock symbol to prevent SSRF attacks
 * 
 * SECURITY: This function implements comprehensive symbol validation that:
 * - Prevents path injection attacks (../../../admin/users)
 * - Prevents protocol attacks (file:///etc/passwd, http://internal-service.com)
 * - Prevents directory traversal attacks (.., //, \\)
 * - Prevents overly long symbols (buffer overflow protection)
 * - Only allows valid stock symbol characters (A-Z, 0-9, ., -)
 * - Provides security logging for attack attempts
 * - Maintains compatibility with legitimate stock symbols
 * 
 * @param symbol The symbol to validate
 * @returns The sanitized symbol or null if invalid
 */
export function validateAndSanitizeSymbol(symbol: string): string | null {
  if (!symbol || typeof symbol !== 'string') {
    return null;
  }

  // Remove whitespace and convert to uppercase
  const sanitizedSymbol = symbol.trim().toUpperCase();

  // SECURITY: Validate symbol format to prevent SSRF attacks
  // Only allow alphanumeric characters, dots, and hyphens
  // This prevents path injection, protocol attacks, and other SSRF vectors
  const validSymbolPattern = /^[A-Z0-9.-]+$/;
  
  if (!validSymbolPattern.test(sanitizedSymbol)) {
    console.warn(`[Security] Invalid symbol format detected: ${symbol}`);
    return null;
  }

  // SECURITY: Prevent directory traversal attacks
  if (sanitizedSymbol.includes('..') || sanitizedSymbol.includes('//') || sanitizedSymbol.includes('\\')) {
    console.warn(`[Security] Directory traversal attempt detected in symbol: ${symbol}`);
    return null;
  }

  // SECURITY: Prevent protocol attacks
  if (sanitizedSymbol.includes('://') || sanitizedSymbol.includes(':')) {
    console.warn(`[Security] Protocol attack attempt detected in symbol: ${symbol}`);
    return null;
  }

  // SECURITY: Prevent overly long symbols (potential buffer overflow)
  if (sanitizedSymbol.length > 20) {
    console.warn(`[Security] Symbol too long: ${symbol}`);
    return null;
  }

  // SECURITY: Prevent empty symbols after sanitization
  if (sanitizedSymbol.length === 0) {
    return null;
  }

  return sanitizedSymbol;
}

/**
 * Validates and sanitizes an array of stock symbols, filtering out invalid ones
 * 
 * SECURITY: This function provides batch validation for multiple symbols:
 * - Validates each symbol individually using validateAndSanitizeSymbol
 * - Filters out invalid symbols while preserving valid ones
 * - Logs security events when symbols are filtered
 * - Returns empty array if no valid symbols provided
 * - Maintains order of valid symbols
 * 
 * @param symbols Array of symbols to validate
 * @returns Array of valid, sanitized symbols
 */
export function validateAndSanitizeSymbols(symbols: string[]): string[] {
  if (!Array.isArray(symbols)) {
    return [];
  }

  const validatedSymbols = symbols
    .map(symbol => validateAndSanitizeSymbol(symbol))
    .filter((symbol): symbol is string => symbol !== null);

  // Log security event if symbols were filtered out
  if (validatedSymbols.length < symbols.length) {
    console.warn(`[Security] ${symbols.length - validatedSymbols.length} invalid symbols filtered out`);
  }

  return validatedSymbols;
}

/**
 * Checks if a symbol is valid without sanitizing it
 * 
 * @param symbol The symbol to check
 * @returns true if the symbol is valid, false otherwise
 */
export function isValidSymbol(symbol: string): boolean {
  return validateAndSanitizeSymbol(symbol) !== null;
} 