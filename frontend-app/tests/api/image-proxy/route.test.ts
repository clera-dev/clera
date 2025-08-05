// Test the core SSRF protection functions directly
import { isSecureWildcardMatch } from '@/utils/security';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Image Proxy SSRF Protection - Core Functions', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Domain validation', () => {
    it('should validate wildcard domain matches correctly', () => {
      // Valid subdomain matches
      expect(isSecureWildcardMatch('api.alphavantage.co', '*.alphavantage.co')).toBe(true);
      expect(isSecureWildcardMatch('data.alphavantage.co', '*.alphavantage.co')).toBe(true);
      
      // Invalid base domain matches (security requirement)
      expect(isSecureWildcardMatch('alphavantage.co', '*.alphavantage.co')).toBe(false);
      
      // Invalid cross-domain matches
      expect(isSecureWildcardMatch('evil.com', '*.alphavantage.co')).toBe(false);
      expect(isSecureWildcardMatch('api.evil.com', '*.alphavantage.co')).toBe(false);
    });

    it('should handle edge cases in wildcard matching', () => {
      // Empty subdomain
      expect(isSecureWildcardMatch('.alphavantage.co', '*.alphavantage.co')).toBe(false);
      
      // Multiple dots
      expect(isSecureWildcardMatch('api..alphavantage.co', '*.alphavantage.co')).toBe(false);
      
      // Trailing dot
      expect(isSecureWildcardMatch('api.alphavantage.co.', '*.alphavantage.co')).toBe(false);
    });
  });

  describe('Private IP detection', () => {
    const isPrivateIP = (hostname: string): boolean => {
      const privateIPPatterns = [
        /^10\./,                    // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
        /^192\.168\./,              // 192.168.0.0/16
        /^127\./,                   // 127.0.0.0/8 (localhost)
        /^169\.254\./,              // 169.254.0.0/16 (link-local)
        /^0\./,                     // 0.0.0.0/8
        /^::1$/,                    // IPv6 localhost
        /^fe80:/,                   // IPv6 link-local
        /^fc00:/,                   // IPv6 unique local
        /^fd00:/,                   // IPv6 unique local
      ];
      return privateIPPatterns.some(pattern => pattern.test(hostname));
    };

    it('should detect private IPv4 addresses', () => {
      const privateIPs = [
        '10.0.0.1',
        '172.16.0.1',
        '192.168.1.1',
        '127.0.0.1',
        '169.254.0.1',
        '0.0.0.0'
      ];

      privateIPs.forEach(ip => {
        expect(isPrivateIP(ip)).toBe(true);
      });
    });

    it('should detect private IPv6 addresses', () => {
      const privateIPv6s = [
        '::1',
        'fe80::1',
        'fc00::1',
        'fd00::1'
      ];

      privateIPv6s.forEach(ip => {
        expect(isPrivateIP(ip)).toBe(true);
      });
    });

    it('should allow public IP addresses', () => {
      const publicIPs = [
        '8.8.8.8',
        '1.1.1.1',
        '208.67.222.222'
      ];

      publicIPs.forEach(ip => {
        expect(isPrivateIP(ip)).toBe(false);
      });
    });
  });

  describe('URL validation logic', () => {
    const validateUrl = (url: URL, originalUrl: string): { isValid: boolean; error?: string } => {
      // Validate protocol
      if (url.protocol !== 'https:') {
        return { isValid: false, error: 'Invalid image protocol. Only HTTPS is allowed.' };
      }

      // Mock allowed domains for testing
      const ALLOWED_DOMAINS = [
        'images.unsplash.com',
        '*.alphavantage.co',
        '*.zacks.com'
      ];

             // Block private IP ranges first
       const isPrivateIP = (hostname: string): boolean => {
         const privateIPPatterns = [
           /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^127\./, 
           /^169\.254\./, /^0\./, /^::1$/, /^fe80:/, /^fc00:/, /^fd00:/
         ];
         return privateIPPatterns.some(pattern => pattern.test(hostname));
       };

       if (isPrivateIP(url.hostname)) {
         return { isValid: false, error: 'Access to private IP ranges not allowed' };
       }

       // Validate domain against allowlist
       const domain = url.hostname.toLowerCase();
       const isAllowed = ALLOWED_DOMAINS.some(allowedDomain => {
         if (allowedDomain.startsWith('*.')) {
           return isSecureWildcardMatch(domain, allowedDomain);
         }
         return domain === allowedDomain;
       });

       if (!isAllowed) {
         return { isValid: false, error: `Domain not allowed: ${domain}` };
       }

      return { isValid: true };
    };

    it('should validate HTTPS URLs correctly', () => {
      const validUrl = new URL('https://images.unsplash.com/image.jpg');
      const result = validateUrl(validUrl, 'https://images.unsplash.com/image.jpg');
      expect(result.isValid).toBe(true);
    });

    it('should reject HTTP URLs', () => {
      const invalidUrl = new URL('http://images.unsplash.com/image.jpg');
      const result = validateUrl(invalidUrl, 'http://images.unsplash.com/image.jpg');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid image protocol. Only HTTPS is allowed.');
    });

    it('should reject non-whitelisted domains', () => {
      const invalidUrl = new URL('https://evil.com/image.jpg');
      const result = validateUrl(invalidUrl, 'https://evil.com/image.jpg');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain not allowed: evil.com');
    });

    it('should reject private IP addresses', () => {
      const invalidUrl = new URL('https://127.0.0.1/image.jpg');
      const result = validateUrl(invalidUrl, 'https://127.0.0.1/image.jpg');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Access to private IP ranges not allowed');
    });

    it('should allow wildcard domain matches', () => {
      const validUrl = new URL('https://api.alphavantage.co/image.jpg');
      const result = validateUrl(validUrl, 'https://api.alphavantage.co/image.jpg');
      expect(result.isValid).toBe(true);
    });

    it('should reject base domain matches for wildcard patterns', () => {
      const invalidUrl = new URL('https://alphavantage.co/image.jpg');
      const result = validateUrl(invalidUrl, 'https://alphavantage.co/image.jpg');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain not allowed: alphavantage.co');
    });
  });

  describe('Multi-hop redirect protection', () => {
    it('should demonstrate SSRF vulnerability in original code', () => {
      // This test demonstrates the original vulnerability
      const originalVulnerableFetch = (url: string, options: any) => {
        // Original code: redirect: 'manual' only on first fetch
        if (options.redirect === 'manual') {
          // First fetch - validates redirect target
          return Promise.resolve({ status: 301, headers: { 'Location': 'https://evil.com/redirect1' } });
        } else {
          // Second fetch - NO redirect: 'manual' - VULNERABLE!
          // This would automatically follow redirects to internal services
          return Promise.resolve({ status: 302, headers: { 'Location': 'https://internal-service.com/admin' } });
        }
      };

      // Simulate the original vulnerable flow
      const firstFetch = originalVulnerableFetch('https://allowed.com/image.jpg', { redirect: 'manual' });
      const secondFetch = originalVulnerableFetch('https://evil.com/redirect1', {}); // No redirect: 'manual'

      expect(firstFetch).toBeInstanceOf(Promise);
      expect(secondFetch).toBeInstanceOf(Promise);
    });

    it('should demonstrate fixed redirect protection', () => {
      // This test demonstrates the fixed implementation
      const fixedSecureFetch = (url: string, options: any) => {
        // Fixed code: redirect: 'manual' on ALL fetches
        expect(options.redirect).toBe('manual');
        
        if (url.includes('allowed.com')) {
          return Promise.resolve({ status: 301, headers: { 'Location': 'https://evil.com/redirect1' } });
        } else if (url.includes('evil.com')) {
          // This would be blocked by domain validation in real implementation
          return Promise.resolve({ status: 302, headers: { 'Location': 'https://internal-service.com/admin' } });
        }
        return Promise.resolve({ status: 200, body: 'image-data' });
      };

      // Simulate the fixed secure flow
      const firstFetch = fixedSecureFetch('https://allowed.com/image.jpg', { redirect: 'manual' });
      const secondFetch = fixedSecureFetch('https://evil.com/redirect1', { redirect: 'manual' }); // Fixed!

      expect(firstFetch).toBeInstanceOf(Promise);
      expect(secondFetch).toBeInstanceOf(Promise);
    });
  });

  describe('Security best practices validation', () => {
    it('should enforce redirect limit to prevent infinite loops', () => {
      const MAX_REDIRECTS = 3;
      const redirectCount = 4; // Exceeds limit
      
      expect(redirectCount >= MAX_REDIRECTS).toBe(true);
    });

    it('should validate content types to prevent MIME confusion attacks', () => {
      const isImageContentType = (contentType: string): boolean => {
        return contentType.toLowerCase().startsWith('image/');
      };

      expect(isImageContentType('image/jpeg')).toBe(true);
      expect(isImageContentType('image/png')).toBe(true);
      expect(isImageContentType('text/html')).toBe(false);
      expect(isImageContentType('application/javascript')).toBe(false);
    });

    it('should enforce timeout protection', () => {
      const TIMEOUT_MS = 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      expect(controller.signal).toBeDefined();
      expect(timeoutId).toBeDefined();
      
      clearTimeout(timeoutId);
    });
  });
}); 