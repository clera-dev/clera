import React from 'react';

// Company names and ticker configuration
export const COMPANY_NAMES = [
  'Apple', 'Microsoft', 'Tesla', 'Nvidia', 'Meta', 'Alphabet', 'Google', 'Amazon',
  'Cisco', 'Applied Materials', 'Broadcom', 'AMD', 'Intel', 'Oracle', 'Salesforce',
  'Netflix', 'Spotify', 'Uber'
];

export const TICKER_STOP = new Set(['US', 'AI', 'CPI', 'GDP', 'CEO', 'EPS', 'FOMC', 'ETF']);

// Parse model output into headline, yesterday bullets, and today bullets
export const parseSummary = (text: string) => {
  const normalize = (s: string) => s.replace(/'/g, "'").trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let headline = '';
  const yesterday: string[] = [];
  const today: string[] = [];
  let mode: 'none' | 'y' | 't' = 'none';

  // Regex for common abbreviations that should not split sentences
  const noSplitAfter = /(U\.S\.|U\.K\.|U\.N\.|E\.U\.|Inc\.|Ltd\.|Co\.|Mr\.|Ms\.|Dr\.)$/;

  // Function to split a paragraph into sentences, handling abbreviations
  const splitIntoSentences = (paragraph: string): string[] => {
    const sentences: string[] = [];
    let currentSentence = '';
    for (let i = 0; i < paragraph.length; i++) {
      currentSentence += paragraph[i];
      if (/[.!?]/.test(paragraph[i])) {
        // Check if it's an abbreviation or part of a number/URL
        const nextChar = paragraph[i + 1];
        const isAbbreviation = noSplitAfter.test(paragraph.substring(i - 3, i + 1));
        const isNumber = /\d/.test(nextChar);
        const isUrl = (paragraph[i] === '.' && (nextChar === '/' || nextChar === '\\' || nextChar === 'c' || nextChar === 'o')); // rudimentary URL check

        if (!isAbbreviation && !isNumber && !isUrl && nextChar && nextChar.trim() !== '') {
          sentences.push(currentSentence.trim());
          currentSentence = '';
        }
      }
    }
    if (currentSentence.trim()) {
      sentences.push(currentSentence.trim());
    }
    return sentences.filter(s => s.length > 5); // Filter out very short fragments
  };

  for (const line of lines) {
    const n = normalize(line);
    if (!headline && !/^yesterday'?s market recap:/i.test(n) && !/^what to watch today:/i.test(n) && !/^what to watch out for:/i.test(n) && !/^•\s*/.test(n) && !/^\-\s*/.test(n)) {
      headline = line;
      continue;
    }
    if (/^yesterday'?s market recap:/i.test(n)) { mode = 'y'; continue; }
    if (/^what to watch today:/i.test(n) || /^what to watch out for:/i.test(n)) { mode = 't'; continue; }

    const cleanedLine = n.replace(/^•\s*/, '').replace(/^\-\s*/, '').trim();
    if (!cleanedLine) continue;

    // If the line is a full paragraph, split it into sentences
    if (!/^•\s*/.test(line) && !/^\-\s*/.test(line) && cleanedLine.includes('.')) {
      const sentences = splitIntoSentences(cleanedLine);
      if (mode === 'y') yesterday.push(...sentences);
      else if (mode === 't') today.push(...sentences);
    } else {
      // Otherwise, treat it as a single bullet
      if (mode === 'y') yesterday.push(cleanedLine);
      else if (mode === 't') today.push(cleanedLine);
    }
  }
  return { headline, yesterday, today };
};

// Browser-compatible sentence splitting
export const splitIntoBullets = (text: string, maxBullets: number = 4): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  // Browser-compatible sentence splitting without look-behind assertions
  const result: string[] = [];
  let currentPiece = '';
  
  for (let i = 0; i < normalized.length; i++) {
    currentPiece += normalized[i];
    
    // Check if we've reached a sentence boundary
    if (/[\.!?]/.test(normalized[i])) {
      const nextChar = normalized[i + 1];
      const nextNextChar = normalized[i + 2];
      
      // If next char is whitespace and following char is capital letter or opening parenthesis
      if (nextChar && /\s/.test(nextChar) && nextNextChar && /[A-Z\(]/.test(nextNextChar)) {
        const trimmed = currentPiece.trim();
        if (trimmed) {
          result.push(trimmed);
          currentPiece = '';
        }
      }
    }
  }
  
  // Add any remaining text
  if (currentPiece.trim()) {
    result.push(currentPiece.trim());
  }
  
  // Post-process to handle abbreviations and short pieces
  const processed: string[] = [];
  for (let i = 0; i < result.length; i++) {
    let current = result[i];
    if (!current) continue;
    
    const endsWithAbbrev = /(U\.S\.|U\.K\.|U\.N\.|E\.U\.|Inc\.|Ltd\.|Co\.|Mr\.|Ms\.|Dr\.)$/.test(current);
    const tooShort = current.length < 40;
    
    if ((endsWithAbbrev || tooShort) && i < result.length - 1) {
      current = current + ' ' + (result[++i] || '').trim();
    }
    
    if (current) processed.push(current);
    if (processed.length >= maxBullets) break;
  }
  
  return processed;
};

// Fallback text processing
export const getFallbackSections = (text: string) => {
  const cleaned = text.replace(/\\n/g, '\n');
  const parts = cleaned.split(/\n\n+/);
  const y = parts[0] ? splitIntoBullets(parts[0].replace(/\n/g, ' ')) : [];
  const t = parts[1] ? splitIntoBullets(parts[1].replace(/\n/g, ' ')) : [];
  return { yesterday: y, today: t };
};

// Text emphasis rendering
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

// Sanitize input to prevent prompt injection
export const sanitizeForPrompt = (input: string): string => {
  return input
    .replace(/"/g, '\\"')           // Escape double quotes
    .replace(/\r?\n/g, ' ')         // Replace newlines with spaces
    .replace(/\r/g, ' ')            // Replace carriage returns with spaces
    .replace(/\t/g, ' ')            // Replace tabs with spaces
    .replace(/\\/g, '\\\\')         // Escape backslashes
    .trim();                        // Remove leading/trailing whitespace
};
