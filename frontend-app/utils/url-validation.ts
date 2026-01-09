/**
 * URL Validation Utilities
 * 
 * SECURITY: Centralized URL validation for financial applications.
 * This module ensures consistent security validation across all components.
 */

/**
 * Validate reconnect URLs before opening in browser.
 * Only allows SnapTrade and known broker domains using exact domain matching.
 * 
 * SECURITY: Uses exact domain matching to prevent spoofing attacks
 * (e.g., evil-snaptrade.com would be rejected)
 */
export function isValidReconnectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow https
    if (parsed.protocol !== 'https:') return false;
    
    const host = parsed.hostname.toLowerCase();
    
    // Helper: check if host exactly matches or is a subdomain of allowed domain
    const matchesDomain = (allowedDomain: string): boolean => {
      return host === allowedDomain || host.endsWith('.' + allowedDomain);
    };
    
    // Allow SnapTrade domains
    if (matchesDomain('snaptrade.com') || matchesDomain('snaptrade.io')) return true;
    
    // Allow common broker OAuth domains
    const allowedDomains = [
      'webull.com',
      'coinbase.com', 
      'alpaca.markets',
      'schwab.com',
      'fidelity.com',
      'etrade.com',
      'robinhood.com',
      'tdameritrade.com',
      'interactivebrokers.com',
    ];
    
    return allowedDomains.some(d => matchesDomain(d));
  } catch {
    return false;
  }
}

/**
 * Safely open a URL in a new tab with security flags.
 * Validates the URL before opening and shows an error if invalid.
 */
export function safeOpenUrl(
  url: string | undefined | null,
  onError?: () => void
): boolean {
  if (!url) {
    onError?.();
    return false;
  }
  
  if (!isValidReconnectUrl(url)) {
    onError?.();
    return false;
  }
  
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

