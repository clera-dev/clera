import React from 'react';
import { COMPANY_NAMES, TICKER_STOP } from './newsTextProcessing';

// Text emphasis rendering with JSX (React-specific utility)
export const renderWithEmphasis = (text: string): React.ReactNode => {
  // Step 1: Emphasize known company names (including multi-word)
  let parts: (string | React.ReactNode)[] = [text];
  COMPANY_NAMES.forEach((name) => {
    const regex = new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`, 'gi');
    const next: (string | React.ReactNode)[] = [];
    parts.forEach((piece, idx) => {
      if (typeof piece !== 'string') { next.push(piece); return; }
      const segments = piece.split(regex);
      const matches = piece.match(regex) || [];
      segments.forEach((seg, i) => {
        if (seg) next.push(seg);
        if (i < matches.length) {
          next.push(<strong key={`n-${name}-${idx}-${i}`}>{matches[i]}</strong>);
        }
      });
    });
    parts = next;
  });

  // Step 2: Emphasize ticker-like tokens (2–5 uppercase letters), excluding stopwords
  const tickerRegex = /\b[A-Z]{2,5}\b/g;
  const next: (string | React.ReactNode)[] = [];
  parts.forEach((piece, pIdx) => {
    if (typeof piece !== 'string') { next.push(piece); return; }
    const segments = piece.split(tickerRegex);
    const matches = piece.match(tickerRegex) || [];
    segments.forEach((seg, i) => {
      if (seg) next.push(seg);
      if (i < matches.length) {
        const tk = matches[i];
        if (!TICKER_STOP.has(tk)) {
          next.push(<strong key={`t-${tk}-${pIdx}-${i}`}>{tk}</strong>);
        } else {
          next.push(tk);
        }
      }
    });
  });
  return <>{next}</>;
};
