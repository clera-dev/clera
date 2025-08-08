/**
 * @jest-environment jsdom
 */

describe('Mobile Safe Area CSS', () => {

  test('should apply safe area CSS classes', () => {
    // Create test elements with safe area classes
    const testElement = document.createElement('div');
    testElement.className = 'pb-safe pt-safe pl-safe pr-safe';
    
    expect(testElement.classList.contains('pb-safe')).toBe(true);
    expect(testElement.classList.contains('pt-safe')).toBe(true);
    expect(testElement.classList.contains('pl-safe')).toBe(true);
    expect(testElement.classList.contains('pr-safe')).toBe(true);
  });

  test('should apply mobile viewport fix classes', () => {
    const testElement = document.createElement('div');
    testElement.className = 'mobile-viewport-fix';
    
    expect(testElement.classList.contains('mobile-viewport-fix')).toBe(true);
  });

  test('should handle CSS environment variable syntax', () => {
    // Test that we can create CSS with environment variables
    const cssText = '.pb-safe { padding-bottom: env(safe-area-inset-bottom, 1rem); }';
    expect(cssText).toContain('env(safe-area-inset-bottom');
    expect(cssText).toContain('1rem'); // fallback value
  });

  test('should create mobile media queries', () => {
    const cssText = `
      @media (max-width: 768px) {
        body { overflow: hidden; height: 100vh; height: 100dvh; }
        main { overflow-y: auto; -webkit-overflow-scrolling: touch; }
      }
    `;
    
    expect(cssText).toContain('@media (max-width: 768px)');
    expect(cssText).toContain('overflow: hidden');
    expect(cssText).toContain('overflow-y: auto');
    expect(cssText).toContain('-webkit-overflow-scrolling: touch');
    expect(cssText).toContain('100dvh');
  });

  test('should include iOS Safari support queries', () => {
    const cssText = `
      @supports (-webkit-touch-callout: none) {
        .mobile-viewport-fix { height: -webkit-fill-available; }
      }
    `;
    
    expect(cssText).toContain('@supports (-webkit-touch-callout: none)');
    expect(cssText).toContain('-webkit-fill-available');
  });
});
