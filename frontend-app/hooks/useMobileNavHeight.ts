"use client";

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to track mobile navigation bar height and viewport changes
 * Handles dynamic mobile browser UI (address bar, search bar) changes
 */
export function useMobileNavHeight() {
  const [navHeight, setNavHeight] = useState(80); // Default 80px (h-20)
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const updateMeasurements = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    setIsMobile(width < 768);
    setViewportHeight(height);

    if (width < 768) { // Mobile
      // Find the actual navigation element
      const navElement = document.querySelector('[data-mobile-nav="true"]');
      if (navElement) {
        const rect = navElement.getBoundingClientRect();
        const measuredHeight = rect.height;
        // Only update if we got a reasonable height (nav should be at least 60px)
        if (measuredHeight >= 60) {
          setNavHeight(measuredHeight);
        } else {
          // Keep previous height or default if height seems invalid
          setNavHeight(prev => prev > 0 ? prev : 80);
        }
      } else {
        // Fallback to default if nav not found, but don't override existing valid height
        setNavHeight(prev => prev > 0 ? prev : 80);
      }
    } else {
      setNavHeight(0); // No mobile nav on desktop
    }
  }, []);

  useEffect(() => {
    // Initial measurement
    updateMeasurements();

    // Listen for resize events (handles mobile browser UI changes)
    const handleResize = () => {
      updateMeasurements();
    };

    // Listen for orientation changes
    const handleOrientationChange = () => {
      // Use setTimeout to ensure the viewport has settled
      setTimeout(updateMeasurements, 100);
    };

    // Listen for visual viewport changes (mobile browser UI)
    const handleVisualViewportChange = () => {
      updateMeasurements();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // Visual Viewport API for better mobile browser support
    if ('visualViewport' in window) {
      window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
    }

    // Use a longer timeout for initial load to ensure everything is rendered
    const timeoutId = setTimeout(updateMeasurements, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      
      if ('visualViewport' in window) {
        window.visualViewport?.removeEventListener('resize', handleVisualViewportChange);
      }
      
      clearTimeout(timeoutId);
    };
  }, [updateMeasurements]);

  // Set CSS custom property for global use
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.style.setProperty('--mobile-nav-height', `${navHeight}px`);
      document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
    }
  }, [navHeight, viewportHeight]);

  return {
    navHeight,
    viewportHeight,
    isMobile,
    aboveNavHeight: navHeight > 0 ? navHeight + 8 : 0, // 8px gap above nav
  };
}
