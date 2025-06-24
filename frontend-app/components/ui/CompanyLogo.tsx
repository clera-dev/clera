import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  symbol: string;
  companyName?: string;
  size?: 'sm' | 'md' | 'lg';
  imageUrl?: string;
  className?: string;
}

export function CompanyLogo({ 
  symbol, 
  companyName, 
  size = 'md', 
  imageUrl, 
  className 
}: CompanyLogoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const fallbackLetter = symbol?.charAt(0)?.toUpperCase() || companyName?.charAt(0)?.toUpperCase() || '?';

  // If no image URL is provided or image failed to load, show fallback
  if (!imageUrl || hasImageError) {
    return (
      <div className={cn(
        'rounded-full bg-gradient-to-br from-gray-600 to-gray-800 dark:from-gray-700 dark:to-gray-900 text-white font-semibold flex items-center justify-center flex-shrink-0',
        sizeClasses[size],
        className
      )}>
        {fallbackLetter}
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-white',
      sizeClasses[size],
      className
    )}>
      <Image
        src={imageUrl}
        alt={`${symbol || companyName} logo`}
        width={size === 'sm' ? 24 : size === 'md' ? 32 : 48}
        height={size === 'sm' ? 24 : size === 'md' ? 32 : 48}
        className="object-contain w-full h-full"
        onError={() => setHasImageError(true)}
        unoptimized // For external images
      />
    </div>
  );
} 