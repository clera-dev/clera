// Debug script to check mobile positioning
console.log('=== Mobile Positioning Debug ===');

// Check if we're on mobile
const isMobile = window.innerWidth < 768;
console.log('isMobile:', isMobile);
console.log('window.innerWidth:', window.innerWidth);

// Check navigation element
const navElement = document.querySelector('[data-mobile-nav="true"]');
console.log('navElement found:', !!navElement);

if (navElement) {
  const rect = navElement.getBoundingClientRect();
  console.log('nav height:', rect.height);
  console.log('nav bottom:', rect.bottom);
  console.log('nav top:', rect.top);
}

// Check CSS custom properties
const navHeightCSS = getComputedStyle(document.documentElement).getPropertyValue('--mobile-nav-height');
const viewportHeightCSS = getComputedStyle(document.documentElement).getPropertyValue('--viewport-height');
console.log('CSS --mobile-nav-height:', navHeightCSS);
console.log('CSS --viewport-height:', viewportHeightCSS);

// Check if MobileInvestmentFooter exists
const investmentFooter = document.querySelector('.fixed[style*="bottom"]');
console.log('investment footer found:', !!investmentFooter);

if (investmentFooter) {
  const footerStyles = getComputedStyle(investmentFooter);
  console.log('footer bottom style:', investmentFooter.style.bottom);
  console.log('footer computed bottom:', footerStyles.bottom);
  const footerRect = investmentFooter.getBoundingClientRect();
  console.log('footer position from bottom:', window.innerHeight - footerRect.bottom);
}

console.log('=== End Debug ===');
