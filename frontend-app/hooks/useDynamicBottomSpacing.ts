"use client";

import { useMobileNavHeight } from '@/hooks/useMobileNavHeight';

/**
 * Returns padding/margin offsets to keep content clear of the mobile bottom nav.
 * Keep this hook in hooks/ to preserve component→hook layering.
 */
export function useDynamicBottomSpacing(additionalGap: number = 8) {
  const { navHeight, isMobile } = useMobileNavHeight();

  return {
    paddingBottom: isMobile ? `${navHeight + additionalGap}px` : '0px',
    marginBottom: isMobile ? `${navHeight + additionalGap}px` : '0px',
    bottomOffset: isMobile ? navHeight + additionalGap : 0,
  };
}


