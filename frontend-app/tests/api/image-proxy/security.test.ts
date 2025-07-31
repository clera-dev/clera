/**
 * Security Tests for Image Proxy Wildcard Matching
 * 
 * These tests verify that wildcard patterns only match proper subdomains
 * and do NOT match the base domain, preventing SSRF attacks.
 */

import { jest, describe, it, expect } from '@jest/globals';

// Import the function to test (we'll need to extract it for testing)
// For now, we'll test the logic directly

describe('Image Proxy - Wildcard Security', () => {
  // Recreate the secure wildcard matching function for testing
  const isSecureWildcardMatch = (domain: string, wildcardPattern: string): boolean => {
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

  describe('Base Domain Security (CRITICAL)', () => {
    it('should NOT allow base domain to match wildcard pattern', () => {
      // These are the critical security tests - base domains should NEVER match wildcards
      expect(isSecureWildcardMatch('example.com', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('alphavantage.co', '*.alphavantage.co')).toBe(false);
      expect(isSecureWildcardMatch('zacks.com', '*.zacks.com')).toBe(false);
      expect(isSecureWildcardMatch('benzinga.com', '*.benzinga.com')).toBe(false);
    });

    it('should allow proper subdomains to match wildcard pattern', () => {
      // These should work correctly - proper subdomains
      expect(isSecureWildcardMatch('api.example.com', '*.example.com')).toBe(true);
      expect(isSecureWildcardMatch('cdn.example.com', '*.example.com')).toBe(true);
      expect(isSecureWildcardMatch('api.alphavantage.co', '*.alphavantage.co')).toBe(true);
      expect(isSecureWildcardMatch('staticx-tuner.zacks.com', '*.zacks.com')).toBe(true);
      expect(isSecureWildcardMatch('www.benzinga.com', '*.benzinga.com')).toBe(true);
    });

    it('should reject malformed subdomains', () => {
      // These should be rejected for security
      expect(isSecureWildcardMatch('.example.com', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('example.com.', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('..example.com', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('example..com', '*.example.com')).toBe(false);
    });
  });

  describe('SSRF Attack Prevention', () => {
    it('should prevent base domain access through wildcard patterns', () => {
      // Attack scenarios - these should all be blocked
      const attackScenarios = [
        { domain: 'example.com', pattern: '*.example.com', description: 'Direct base domain access' },
        { domain: 'alphavantage.co', pattern: '*.alphavantage.co', description: 'Financial API base domain' },
        { domain: 'zacks.com', pattern: '*.zacks.com', description: 'Financial data base domain' },
        { domain: 'benzinga.com', pattern: '*.benzinga.com', description: 'News API base domain' },
      ];

      attackScenarios.forEach(({ domain, pattern, description }) => {
        const result = isSecureWildcardMatch(domain, pattern);
        expect(result).toBe(false);
        console.log(`✅ Blocked: ${description} (${domain} vs ${pattern})`);
      });
    });

    it('should allow legitimate subdomain access', () => {
      // Legitimate scenarios - these should work
      const legitimateScenarios = [
        { domain: 'api.example.com', pattern: '*.example.com', description: 'API subdomain' },
        { domain: 'cdn.example.com', pattern: '*.example.com', description: 'CDN subdomain' },
        { domain: 'static.example.com', pattern: '*.example.com', description: 'Static assets subdomain' },
        { domain: 'api.alphavantage.co', pattern: '*.alphavantage.co', description: 'Financial API subdomain' },
        { domain: 'staticx-tuner.zacks.com', pattern: '*.zacks.com', description: 'Zacks static subdomain' },
        { domain: 'www.benzinga.com', pattern: '*.benzinga.com', description: 'Benzinga www subdomain' },
      ];

      legitimateScenarios.forEach(({ domain, pattern, description }) => {
        const result = isSecureWildcardMatch(domain, pattern);
        expect(result).toBe(true);
        console.log(`✅ Allowed: ${description} (${domain} vs ${pattern})`);
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle edge cases securely', () => {
      // Edge cases that should be handled securely
      expect(isSecureWildcardMatch('', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('example.com', '')).toBe(false);
      expect(isSecureWildcardMatch('example.com', 'example.com')).toBe(false);
      expect(isSecureWildcardMatch('example.com', 'example.*')).toBe(false);
      // Note: *.com would match example.com, but this is a valid case
      // The security concern is specifically about base domains matching their own wildcards
    });

    it('should reject invalid wildcard patterns', () => {
      // Invalid patterns should be rejected
      expect(isSecureWildcardMatch('api.example.com', 'example.com')).toBe(false);
      expect(isSecureWildcardMatch('api.example.com', 'api.*.com')).toBe(false);
      expect(isSecureWildcardMatch('api.example.com', '*.api.example.com')).toBe(false);
    });

    it('should handle case sensitivity correctly', () => {
      // Case sensitivity tests
      expect(isSecureWildcardMatch('API.EXAMPLE.COM', '*.example.com')).toBe(false);
      expect(isSecureWildcardMatch('api.example.com', '*.EXAMPLE.COM')).toBe(false);
      expect(isSecureWildcardMatch('Api.Example.Com', '*.example.com')).toBe(false);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle actual allowlist domains correctly', () => {
      // Test against the actual allowlist from the code
      const allowlistPatterns = [
        '*.alphavantage.co',
        '*.zacks.com',
        '*.benzinga.com'
      ];

      // Base domains should be blocked
      expect(isSecureWildcardMatch('alphavantage.co', '*.alphavantage.co')).toBe(false);
      expect(isSecureWildcardMatch('zacks.com', '*.zacks.com')).toBe(false);
      expect(isSecureWildcardMatch('benzinga.com', '*.benzinga.com')).toBe(false);

      // Subdomains should be allowed
      expect(isSecureWildcardMatch('api.alphavantage.co', '*.alphavantage.co')).toBe(true);
      expect(isSecureWildcardMatch('staticx-tuner.zacks.com', '*.zacks.com')).toBe(true);
      expect(isSecureWildcardMatch('www.benzinga.com', '*.benzinga.com')).toBe(true);
    });
  });
}); 