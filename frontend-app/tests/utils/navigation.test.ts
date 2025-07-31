import { getIntendedRedirect, clearIntendedRedirectCookie } from '../../utils/navigation';

// Mock document.cookie for testing
const mockDocumentCookie = (cookies: string) => {
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: cookies,
  });
};

describe('Navigation Security - URL Encoding Bypass Protection', () => {
  beforeEach(() => {
    // Clear any existing cookies
    mockDocumentCookie('');
  });

  describe('URL Encoding Bypass Attempts', () => {
    it('should block case-sensitive URL encoding bypass attempts', () => {
      // Test various case combinations of malicious encoded patterns
      const maliciousUrls = [
        // Directory traversal attempts with different case
        '/dashboard/%2E%2E/api/admin',  // Uppercase
        '/portfolio/%2e%2E/api/admin',  // Lowercase
        '/invest/%2E%2e/api/admin',     // Mixed case
        '/news/%2e%2E/api/admin',       // Mixed case
        
        // Double slash attempts with different case
        '/chat/%2F%2Fevil.com',         // Uppercase
        '/settings/%2f%2fevil.com',     // Lowercase
        '/account/%2F%2fevil.com',      // Mixed case
        '/info/%2f%2Fevil.com',         // Mixed case
        
        // Backslash attempts with different case
        '/dashboard/%5Capi/admin',      // Uppercase
        '/portfolio/%5capi/admin',      // Lowercase
        
        // Combined attacks
        '/invest/%2E%2E%2F%2Fevil.com',
        '/news/%2e%2e%5capi/admin',
        '/chat/%2E%2e%2f%2fmalicious.com',
      ];

      maliciousUrls.forEach(url => {
        // Set the malicious URL in a cookie
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        
        // Should return safe default instead of malicious URL
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should block URL encoding with mixed case and special characters', () => {
      const complexBypassAttempts = [
        '/dashboard/%2E%2E%2F%2F%2E%2E%2Fapi%2Fadmin',
        '/portfolio/%2e%2E%2f%2f%2e%2E%2fadmin%2F',
        '/invest/%2E%2e%2F%2f%2E%2e%2Finternal%2F',
        '/news/%2e%2E%2f%2F%2e%2E%2fdebug%2F',
        '/chat/%2E%2e%2F%2f%2E%2E%2ftest%2F',
        '/settings/%2e%2E%2f%2F%2e%2E%2fprotected%2F',
        '/account/%2E%2e%2F%2f%2E%2E%2fauth%2F',
      ];

      complexBypassAttempts.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should block nested directory traversal attempts', () => {
      const nestedTraversalAttempts = [
        '/dashboard/%2E%2E%2F%2E%2E%2F%2E%2E%2Fapi',
        '/portfolio/%2e%2E%2f%2e%2E%2f%2e%2E%2fadmin',
        '/invest/%2E%2e%2F%2E%2e%2F%2E%2e%2Finternal',
        '/news/%2e%2E%2f%2e%2E%2f%2e%2E%2fdebug',
        '/chat/%2E%2e%2F%2E%2e%2F%2E%2E%2ftest',
      ];

      nestedTraversalAttempts.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should block URL encoding with additional path segments', () => {
      const pathSegmentBypassAttempts = [
        '/dashboard/legitimate/%2E%2E/api/admin',
        '/portfolio/valid/%2e%2E/admin/',
        '/invest/real/%2E%2e/internal/',
        '/news/actual/%2e%2E/debug/',
        '/chat/true/%2E%2e/test/',
        '/settings/real/%2e%2E/protected/',
        '/account/valid/%2E%2e/auth/',
      ];

      pathSegmentBypassAttempts.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });
  });

  describe('Legitimate URL Handling', () => {
    it('should allow legitimate URLs with proper encoding', () => {
      const legitimateUrls = [
        '/dashboard',
        '/portfolio',
        '/invest',
        '/news',
        '/chat',
        '/settings',
        '/account',
        '/info',
        '/dashboard/profile',
        '/portfolio/positions',
        '/invest/opportunities',
        '/news/trending',
        '/chat/support',
        '/settings/preferences',
        '/account/details',
        '/info/about',
      ];

      legitimateUrls.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe(url);
      });
    });

    it('should allow URLs with legitimate URL encoding', () => {
      const legitimateEncodedUrls = [
        '/dashboard/user%20profile',
        '/portfolio/stock%20positions',
        '/invest/real%20estate',
        '/news/tech%20trends',
        '/chat/customer%20support',
        '/settings/email%20preferences',
        '/account/bank%20details',
        '/info/company%20about',
      ];

      legitimateEncodedUrls.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe(url);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed cookies gracefully', () => {
      const malformedCookies = [
        'intended_redirect=',
        'intended_redirect=invalid',
        'intended_redirect=null',
        'intended_redirect=undefined',
        'some_other_cookie=value',
        '',
      ];

      malformedCookies.forEach(cookie => {
        mockDocumentCookie(cookie);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should handle non-string URLs', () => {
      // Test with various non-string values
      const nonStringValues = [null, undefined, 123, {}, [], true, false];

      nonStringValues.forEach(value => {
        // This would be handled by the validation function
        // We can't easily test this without exposing the internal function
        // But we can verify the public API handles edge cases
        mockDocumentCookie(`intended_redirect=${value}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should handle URLs with query parameters', () => {
      const urlsWithParams = [
        '/dashboard?tab=profile',
        '/portfolio?view=positions',
        '/invest?filter=stocks',
        '/news?category=tech',
        '/chat?room=support',
        '/settings?section=email',
        '/account?page=details',
        '/info?section=about',
      ];

      urlsWithParams.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe(url);
      });
    });
  });

  describe('Security Boundary Testing', () => {
    it('should block attempts to access sensitive routes', () => {
      const sensitiveRoutes = [
        '/api/users',
        '/_next/static',
        '/admin/dashboard',
        '/internal/system',
        '/debug/logs',
        '/test/endpoints',
        '/protected/data',
        '/auth/tokens',
      ];

      sensitiveRoutes.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });

    it('should block absolute URLs and external domains', () => {
      const externalUrls = [
        'https://evil.com',
        'http://malicious.com',
        '//external.com',
        'ftp://evil.com',
        'data:text/html,<script>alert("xss")</script>',
        'javascript:alert("xss")',
      ];

      externalUrls.forEach(url => {
        mockDocumentCookie(`intended_redirect=${encodeURIComponent(url)}`);
        const result = getIntendedRedirect();
        expect(result).toBe('/portfolio');
      });
    });
  });
}); 