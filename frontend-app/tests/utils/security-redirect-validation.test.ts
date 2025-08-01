import { isValidRedirectUrl, validateAndSanitizeRedirectUrl } from '@/utils/security';

describe('Security - Redirect URL Validation', () => {
  describe('Critical Security Fix - Open Redirect Bypass Prevention', () => {
    it('should prevent startsWith() bypass attacks', () => {
      // SECURITY TEST: These should all be BLOCKED
      const maliciousUrls = [
        '/dashboardevil',                    // Bypass attempt
        '/portfoliomalicious',               // Bypass attempt  
        '/investbad',                        // Bypass attempt
        '/newsattack',                       // Bypass attempt
        '/chatphishing',                     // Bypass attempt
        '/settingshack',                     // Bypass attempt
        '/accountsteal',                     // Bypass attempt
        '/infomalware',                      // Bypass attempt
        '/dashboard../../etc/passwd',        // Directory traversal via bypass
        '/portfolio../../../sensitive',     // Path traversal via bypass
      ];

      maliciousUrls.forEach(url => {
        expect(isValidRedirectUrl(url)).toBe(false);
        console.log(`✅ BLOCKED: ${url}`);
      });
    });

    it('should allow legitimate paths and sub-paths', () => {
      // SECURITY TEST: These should all be ALLOWED
      const legitimateUrls = [
        '/dashboard',                        // Exact match
        '/portfolio',                        // Exact match
        '/invest',                           // Exact match
        '/news',                            // Exact match
        '/chat',                            // Exact match
        '/settings',                        // Exact match
        '/account',                         // Exact match
        '/info',                            // Exact match
        '/dashboard/overview',              // Valid sub-path
        '/portfolio/positions',             // Valid sub-path
        '/invest/research',                 // Valid sub-path
        '/news/trending',                   // Valid sub-path
        '/chat/history',                    // Valid sub-path
        '/settings/profile',                // Valid sub-path
        '/account/billing',                 // Valid sub-path
        '/info/help',                       // Valid sub-path
        '/dashboard/analytics?tab=overview', // With query params
        '/portfolio/positions#top',         // With hash
      ];

      legitimateUrls.forEach(url => {
        expect(isValidRedirectUrl(url)).toBe(true);
        console.log(`✅ ALLOWED: ${url}`);
      });
    });

    it('should demonstrate the security vulnerability that was fixed', () => {
      // This test shows what WOULD have been vulnerable with startsWith()
      const bypassAttempts = [
        '/dashboardevil',
        '/portfoliomalicious', 
        '/investbad',
        '/newsattack'
      ];

      // With the OLD vulnerable code (startsWith), these would have passed:
      // const wouldHavePassed = bypassAttempts.every(url => 
      //   url.startsWith('/dashboard') || url.startsWith('/portfolio') || 
      //   url.startsWith('/invest') || url.startsWith('/news')
      // );
      
      // With the NEW secure code, these are properly blocked:
      bypassAttempts.forEach(url => {
        expect(isValidRedirectUrl(url)).toBe(false);
      });
    });
  });

  describe('Path Validation Logic', () => {
    it('should require paths to start with /', () => {
      expect(isValidRedirectUrl('dashboard')).toBe(false);
      expect(isValidRedirectUrl('portfolio')).toBe(false);
      expect(isValidRedirectUrl('http://evil.com')).toBe(false);
      expect(isValidRedirectUrl('//evil.com')).toBe(false);
    });

    it('should block directory traversal attempts', () => {
      expect(isValidRedirectUrl('/dashboard/../api')).toBe(false);
      expect(isValidRedirectUrl('/portfolio/../../admin')).toBe(false);
      expect(isValidRedirectUrl('/dashboard//evil')).toBe(false);
    });

    it('should block backslash attacks', () => {
      expect(isValidRedirectUrl('/dashboard\\..\\api')).toBe(false);
      expect(isValidRedirectUrl('/portfolio\\evil')).toBe(false);
    });

    it('should block URL encoding attacks', () => {
      expect(isValidRedirectUrl('/dashboard%2e%2e/api')).toBe(false);
      expect(isValidRedirectUrl('/portfolio%2f%2fevil')).toBe(false);
      expect(isValidRedirectUrl('/dashboard%5c..%5capi')).toBe(false);
    });

    it('should block sensitive routes', () => {
      expect(isValidRedirectUrl('/api/users')).toBe(false);
      expect(isValidRedirectUrl('/_next/static')).toBe(false);
      expect(isValidRedirectUrl('/admin/panel')).toBe(false);
      expect(isValidRedirectUrl('/internal/debug')).toBe(false);
      expect(isValidRedirectUrl('/protected/secret')).toBe(false);
      expect(isValidRedirectUrl('/auth/callback')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidRedirectUrl('')).toBe(false);
      expect(isValidRedirectUrl(null as any)).toBe(false);
      expect(isValidRedirectUrl(undefined as any)).toBe(false);
      expect(isValidRedirectUrl(123 as any)).toBe(false);
    });
  });

  describe('Sanitization Function', () => {
    it('should sanitize malicious URLs to safe defaults', () => {
      expect(validateAndSanitizeRedirectUrl('/dashboardevil')).toBe('/portfolio');
      expect(validateAndSanitizeRedirectUrl('/portfoliomalicious')).toBe('/portfolio');
      expect(validateAndSanitizeRedirectUrl('/api/evil')).toBe('/portfolio');
      expect(validateAndSanitizeRedirectUrl('http://evil.com')).toBe('/portfolio');
    });

    it('should preserve legitimate URLs', () => {
      expect(validateAndSanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(validateAndSanitizeRedirectUrl('/portfolio/positions')).toBe('/portfolio/positions');
      expect(validateAndSanitizeRedirectUrl('/invest/research?tab=stocks')).toBe('/invest/research?tab=stocks');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle mixed case bypass attempts', () => {
      expect(isValidRedirectUrl('/DashboardEvil')).toBe(false);
      expect(isValidRedirectUrl('/PORTFOLIOMALICIOUS')).toBe(false);
    });

    it('should handle unicode and special character bypasses', () => {
      expect(isValidRedirectUrl('/dashboard\u0000evil')).toBe(false);
      expect(isValidRedirectUrl('/portfolio\tevil')).toBe(false);
      expect(isValidRedirectUrl('/dashboard\nevil')).toBe(false);
    });

    it('should handle complex query parameter attacks', () => {
      expect(isValidRedirectUrl('/dashboardevil?redirect=http://evil.com')).toBe(false);
      expect(isValidRedirectUrl('/portfoliomalicious#http://evil.com')).toBe(false);
    });
  });

  describe('Performance and Maintainability', () => {
    it('should efficiently validate large numbers of URLs', () => {
      const testUrls = [];
      
      // Generate test URLs
      for (let i = 0; i < 1000; i++) {
        testUrls.push(`/dashboard/test${i}`);
        testUrls.push(`/dashboardevil${i}`);
      }
      
      const start = performance.now();
      testUrls.forEach(url => isValidRedirectUrl(url));
      const end = performance.now();
      
      // Should complete in reasonable time (< 100ms for 2000 URLs)
      expect(end - start).toBeLessThan(100);
    });
  });
});