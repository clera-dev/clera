// Debug script to check if MobileInvestmentFooter is rendering and positioned correctly
console.log('=== Mobile Investment Footer Debug ===');

// Check if we're on mobile
const isMobile = window.innerWidth < 768;
console.log('isMobile detected:', isMobile);
console.log('window.innerWidth:', window.innerWidth);

// Check if MobileInvestmentFooter component exists in DOM
const footerElement = document.querySelector('[class*="MobileInvestmentFooter"], .fixed[style*="bottom"]');
console.log('Investment footer element found:', !!footerElement);

if (footerElement) {
  console.log('Footer element:', footerElement);
  console.log('Footer classes:', footerElement.className);
  console.log('Footer inline styles:', footerElement.style.cssText);
  
  const rect = footerElement.getBoundingClientRect();
  console.log('Footer position:');
  console.log('  top:', rect.top);
  console.log('  bottom:', rect.bottom);
  console.log('  height:', rect.height);
  console.log('  distance from screen bottom:', window.innerHeight - rect.bottom);
}

// Check navigation element
const navElement = document.querySelector('[data-mobile-nav="true"]');
console.log('Nav element found:', !!navElement);

if (navElement) {
  const navRect = navElement.getBoundingClientRect();
  console.log('Nav position:');
  console.log('  top:', navRect.top);
  console.log('  bottom:', navRect.bottom);
  console.log('  height:', navRect.height);
}

// Check CSS custom properties
const navHeightCSS = getComputedStyle(document.documentElement).getPropertyValue('--mobile-nav-height');
const viewportHeightCSS = getComputedStyle(document.documentElement).getPropertyValue('--viewport-height');
console.log('CSS custom properties:');
console.log('  --mobile-nav-height:', navHeightCSS);
console.log('  --viewport-height:', viewportHeightCSS);

// Check if the dialog content might be affecting positioning
const dialogContent = document.querySelector('[role="dialog"]');
console.log('Dialog found:', !!dialogContent);

if (dialogContent) {
  const dialogRect = dialogContent.getBoundingClientRect();
  console.log('Dialog positioning:');
  console.log('  top:', dialogRect.top);
  console.log('  bottom:', dialogRect.bottom);
  console.log('  height:', dialogRect.height);
}

console.log('=== End Debug ===');
