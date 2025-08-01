import { isValidRedirectUrl, validateAndSanitizeRedirectUrl, getSafeDefaultRedirect, validateAndSanitizeSymbol, validateAndSanitizeSymbols, isValidSymbol } from '../../utils/security';

describe('Security Utilities', () => {
  describe('isValidRedirectUrl', () => {
    describe('Valid URLs', () => {
      it('should allow valid dashboard path', () => {
        expect(isValidRedirectUrl('/dashboard')).toBe(true);
      });

      it('should allow valid portfolio path', () => {
        expect(isValidRedirectUrl('/portfolio')).toBe(true);
      });

      it('should allow valid invest path', () => {
        expect(isValidRedirectUrl('/invest')).toBe(true);
      });

      it('should allow valid news path', () => {
        expect(isValidRedirectUrl('/news')).toBe(true);
      });

      it('should allow valid chat path', () => {
        expect(isValidRedirectUrl('/chat')).toBe(true);
      });

      it('should allow valid settings path', () => {
        expect(isValidRedirectUrl('/settings')).toBe(true);
      });

      it('should allow valid account path', () => {
        expect(isValidRedirectUrl('/account')).toBe(true);
      });

      it('should allow valid info path', () => {
        expect(isValidRedirectUrl('/info')).toBe(true);
      });

      it('should allow paths with query parameters', () => {
        expect(isValidRedirectUrl('/dashboard?tab=portfolio')).toBe(true);
      });

      it('should allow paths with hash fragments', () => {
        expect(isValidRedirectUrl('/portfolio#summary')).toBe(true);
      });
    });

    describe('Invalid URLs', () => {
      it('should reject absolute URLs', () => {
        expect(isValidRedirectUrl('https://example.com')).toBe(false);
      });

      it('should reject relative URLs without leading slash', () => {
        expect(isValidRedirectUrl('dashboard')).toBe(false);
      });

      it('should reject directory traversal attempts', () => {
        expect(isValidRedirectUrl('/dashboard/../admin')).toBe(false);
        expect(isValidRedirectUrl('/dashboard//admin')).toBe(false);
      });

      it('should reject backslash attacks', () => {
        expect(isValidRedirectUrl('/dashboard\\admin')).toBe(false);
      });

      it('should reject URL encoding attacks', () => {
        expect(isValidRedirectUrl('/dashboard/%2e%2e/admin')).toBe(false);
        expect(isValidRedirectUrl('/dashboard/%2f%2fadmin')).toBe(false);
        expect(isValidRedirectUrl('/dashboard/%5cadmin')).toBe(false);
      });

      it('should reject API paths', () => {
        expect(isValidRedirectUrl('/api/users')).toBe(false);
      });

      it('should reject Next.js internal paths', () => {
        expect(isValidRedirectUrl('/_next/static')).toBe(false);
      });

      it('should reject admin paths', () => {
        expect(isValidRedirectUrl('/admin/dashboard')).toBe(false);
      });

      it('should reject internal paths', () => {
        expect(isValidRedirectUrl('/internal/api')).toBe(false);
      });

      it('should reject debug paths', () => {
        expect(isValidRedirectUrl('/debug/logs')).toBe(false);
      });

      it('should reject test paths', () => {
        expect(isValidRedirectUrl('/test/unit')).toBe(false);
      });

      it('should reject protected paths', () => {
        expect(isValidRedirectUrl('/protected/data')).toBe(false);
      });

      it('should reject auth paths', () => {
        expect(isValidRedirectUrl('/auth/login')).toBe(false);
      });

      // SECURITY: Test path injection vulnerability fixes
      it('should reject blocked patterns anywhere in the path (not just at start)', () => {
        // These would have passed the old vulnerable implementation
        expect(isValidRedirectUrl('/dashboard/api/internal')).toBe(false);
        expect(isValidRedirectUrl('/portfolio/_next/admin')).toBe(false);
        expect(isValidRedirectUrl('/invest/admin/dashboard')).toBe(false);
        expect(isValidRedirectUrl('/news/internal/api')).toBe(false);
        expect(isValidRedirectUrl('/chat/debug/logs')).toBe(false);
        expect(isValidRedirectUrl('/settings/test/unit')).toBe(false);
        expect(isValidRedirectUrl('/account/protected/data')).toBe(false);
        expect(isValidRedirectUrl('/info/auth/login')).toBe(false);
      });

      it('should reject blocked patterns in subdirectories', () => {
        expect(isValidRedirectUrl('/dashboard/settings/api/users')).toBe(false);
        expect(isValidRedirectUrl('/portfolio/analytics/_next/static')).toBe(false);
        expect(isValidRedirectUrl('/invest/research/admin/panel')).toBe(false);
        expect(isValidRedirectUrl('/news/trending/internal/system')).toBe(false);
      });

      it('should allow query parameters on valid paths', () => {
        expect(isValidRedirectUrl('/dashboard?redirect=/api/users')).toBe(true);
        expect(isValidRedirectUrl('/portfolio?tab=admin')).toBe(true);
        expect(isValidRedirectUrl('/invest?debug=true')).toBe(true);
      });

      it('should allow hash fragments on valid paths', () => {
        expect(isValidRedirectUrl('/dashboard#section')).toBe(true);
        expect(isValidRedirectUrl('/portfolio#summary')).toBe(true);
        expect(isValidRedirectUrl('/invest#details')).toBe(true);
      });

      it('should still allow legitimate nested paths', () => {
        expect(isValidRedirectUrl('/dashboard/settings')).toBe(true);
        expect(isValidRedirectUrl('/portfolio/analytics')).toBe(true);
        expect(isValidRedirectUrl('/invest/research')).toBe(true);
        expect(isValidRedirectUrl('/news/trending')).toBe(true);
        expect(isValidRedirectUrl('/chat/history')).toBe(true);
        expect(isValidRedirectUrl('/account/profile')).toBe(true);
        expect(isValidRedirectUrl('/info/about')).toBe(true);
      });

      it('should reject null and undefined', () => {
        expect(isValidRedirectUrl(null as any)).toBe(false);
        expect(isValidRedirectUrl(undefined as any)).toBe(false);
      });

      it('should reject non-string values', () => {
        expect(isValidRedirectUrl(123 as any)).toBe(false);
        expect(isValidRedirectUrl({} as any)).toBe(false);
      });
    });
  });

  describe('getSafeDefaultRedirect', () => {
    it('should return /portfolio as safe default', () => {
      expect(getSafeDefaultRedirect()).toBe('/portfolio');
    });
  });

  describe('validateAndSanitizeRedirectUrl', () => {
    it('should return valid URLs unchanged', () => {
      expect(validateAndSanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(validateAndSanitizeRedirectUrl('/portfolio')).toBe('/portfolio');
    });

    it('should return safe default for invalid URLs', () => {
      expect(validateAndSanitizeRedirectUrl('/api/users')).toBe('/portfolio');
      expect(validateAndSanitizeRedirectUrl('https://evil.com')).toBe('/portfolio');
      expect(validateAndSanitizeRedirectUrl('/dashboard/../admin')).toBe('/portfolio');
    });

    it('should log security warnings for invalid URLs', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      validateAndSanitizeRedirectUrl('/api/users');
      
      expect(consoleSpy).toHaveBeenCalledWith('[Security] Invalid redirect URL detected:', '/api/users');
      
      consoleSpy.mockRestore();
    });
  });

  describe('validateAndSanitizeSymbol', () => {
    describe('Valid Symbols', () => {
      it('should accept valid stock symbols', () => {
        expect(validateAndSanitizeSymbol('AAPL')).toBe('AAPL');
        expect(validateAndSanitizeSymbol('GOOGL')).toBe('GOOGL');
        expect(validateAndSanitizeSymbol('MSFT')).toBe('MSFT');
      });

      it('should sanitize and uppercase symbols', () => {
        expect(validateAndSanitizeSymbol('aapl')).toBe('AAPL');
        expect(validateAndSanitizeSymbol('  googl  ')).toBe('GOOGL');
        expect(validateAndSanitizeSymbol('msft')).toBe('MSFT');
      });

      it('should accept symbols with dots and hyphens', () => {
        expect(validateAndSanitizeSymbol('BRK.A')).toBe('BRK.A');
        expect(validateAndSanitizeSymbol('BRK-B')).toBe('BRK-B');
      });

      it('should accept numeric symbols', () => {
        expect(validateAndSanitizeSymbol('123')).toBe('123');
        expect(validateAndSanitizeSymbol('456')).toBe('456');
      });
    });

    describe('Invalid Symbols', () => {
      it('should reject directory traversal attacks', () => {
        expect(validateAndSanitizeSymbol('../../../admin/users')).toBeNull();
        expect(validateAndSanitizeSymbol('..\\..\\..\\windows\\system32')).toBeNull();
        expect(validateAndSanitizeSymbol('....//etc/passwd')).toBeNull();
      });

      it('should reject protocol attacks', () => {
        expect(validateAndSanitizeSymbol('file:///etc/passwd')).toBeNull();
        expect(validateAndSanitizeSymbol('http://internal-service.com')).toBeNull();
        expect(validateAndSanitizeSymbol('ftp://evil.com')).toBeNull();
        expect(validateAndSanitizeSymbol('javascript:alert("xss")')).toBeNull();
      });

      it('should reject path injection attacks', () => {
        expect(validateAndSanitizeSymbol('api/admin/users')).toBeNull();
        expect(validateAndSanitizeSymbol('internal/system')).toBeNull();
        expect(validateAndSanitizeSymbol('debug/logs')).toBeNull();
        expect(validateAndSanitizeSymbol('config/database')).toBeNull();
      });

      it('should reject symbols with special characters', () => {
        expect(validateAndSanitizeSymbol('INVALID!')).toBeNull();
        expect(validateAndSanitizeSymbol('SYMBOL@')).toBeNull();
        expect(validateAndSanitizeSymbol('TEST#')).toBeNull();
        expect(validateAndSanitizeSymbol('STOCK$')).toBeNull();
      });

      it('should reject overly long symbols', () => {
        const longSymbol = 'A'.repeat(25); // Longer than 20 characters
        expect(validateAndSanitizeSymbol(longSymbol)).toBeNull();
      });

      it('should reject empty symbols', () => {
        expect(validateAndSanitizeSymbol('')).toBeNull();
        expect(validateAndSanitizeSymbol('   ')).toBeNull();
        expect(validateAndSanitizeSymbol('\t\n')).toBeNull();
      });

      it('should reject null and undefined', () => {
        expect(validateAndSanitizeSymbol(null as any)).toBeNull();
        expect(validateAndSanitizeSymbol(undefined as any)).toBeNull();
      });

      it('should reject non-string values', () => {
        expect(validateAndSanitizeSymbol(123 as any)).toBeNull();
        expect(validateAndSanitizeSymbol({} as any)).toBeNull();
        expect(validateAndSanitizeSymbol([] as any)).toBeNull();
      });
    });

    describe('Security Logging', () => {
      it('should log security warnings for invalid symbols', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        validateAndSanitizeSymbol('../../../admin');
        
        expect(consoleSpy).toHaveBeenCalledWith('[Security] Invalid symbol format detected: ../../../admin');
        
        consoleSpy.mockRestore();
      });
    });
  });

  describe('validateAndSanitizeSymbols', () => {
    it('should validate and return valid symbols', () => {
      const result = validateAndSanitizeSymbols(['AAPL', 'GOOGL', 'MSFT']);
      expect(result).toEqual(['AAPL', 'GOOGL', 'MSFT']);
    });

    it('should filter out invalid symbols', () => {
      const result = validateAndSanitizeSymbols(['AAPL', '../../../admin', 'GOOGL', 'file:///etc/passwd']);
      expect(result).toEqual(['AAPL', 'GOOGL']);
    });

    it('should sanitize and uppercase symbols', () => {
      const result = validateAndSanitizeSymbols(['aapl', '  googl  ', 'msft']);
      expect(result).toEqual(['AAPL', 'GOOGL', 'MSFT']);
    });

    it('should return empty array for all invalid symbols', () => {
      const result = validateAndSanitizeSymbols(['../../../admin', 'file:///etc/passwd', 'INVALID!']);
      expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = validateAndSanitizeSymbols([]);
      expect(result).toEqual([]);
    });

    it('should handle non-array input', () => {
      const result = validateAndSanitizeSymbols(null as any);
      expect(result).toEqual([]);
    });

    it('should log security events when symbols are filtered', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      validateAndSanitizeSymbols(['AAPL', '../../../admin', 'GOOGL']);
      
      expect(consoleSpy).toHaveBeenCalledWith('[Security] 1 invalid symbols filtered out');
      
      consoleSpy.mockRestore();
    });
  });

  describe('isValidSymbol', () => {
    it('should return true for valid symbols', () => {
      expect(isValidSymbol('AAPL')).toBe(true);
      expect(isValidSymbol('GOOGL')).toBe(true);
      expect(isValidSymbol('BRK.A')).toBe(true);
      expect(isValidSymbol('BRK-B')).toBe(true);
    });

    it('should return false for invalid symbols', () => {
      expect(isValidSymbol('../../../admin')).toBe(false);
      expect(isValidSymbol('file:///etc/passwd')).toBe(false);
      expect(isValidSymbol('INVALID!')).toBe(false);
      expect(isValidSymbol('')).toBe(false);
    });

    it('should handle sanitization correctly', () => {
      expect(isValidSymbol('aapl')).toBe(true);
      expect(isValidSymbol('  googl  ')).toBe(true);
    });
  });
}); 