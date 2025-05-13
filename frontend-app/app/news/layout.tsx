import React from 'react';

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full min-h-full">
      {children}
    </div>
  );
} 