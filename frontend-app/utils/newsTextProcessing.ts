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
  let headlineCaptured = false;

  // Check for section headers - expanded patterns for more flexibility
  const yesterdayHeaderPatterns = [
    /^yesterday'?s?\s*market\s*recap:?$/i,
    /^market\s*recap:?$/i,
  ];
  
  const todayHeaderPatterns = [
    /^what\s*to\s*watch\s*(?:out\s*)?(?:for)?:?$/i,
    /^looking\s*ahead:?$/i,
  ];
  
  const isYesterdayHeader = (s: string) => yesterdayHeaderPatterns.some(p => p.test(s));
  const isTodayHeader = (s: string) => todayHeaderPatterns.some(p => p.test(s));

  for (const line of lines) {
    const n = normalize(line);
    
    // Check for section headers
    if (isYesterdayHeader(n)) { mode = 'y'; continue; }
    if (isTodayHeader(n)) { mode = 't'; continue; }

    // Clean bullet markers (•, -, *)
    const cleanedLine = n.replace(/^[•\-\*]\s*/, '').trim();
    if (!cleanedLine) continue;

    // Add to appropriate section
    if (mode === 'y') {
      yesterday.push(cleanedLine);
    } else if (mode === 't') {
      today.push(cleanedLine);
    } else {
      // No header found yet - capture first non-header line as headline (if not a bullet)
      // then subsequent lines go to yesterday for backward compatibility
      if (!headlineCaptured && !line.match(/^[•\-\*]/)) {
        headline = cleanedLine;
        headlineCaptured = true;
      } else {
        yesterday.push(cleanedLine);
      }
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

// Sanitize input to prevent prompt injection
export const sanitizeForPrompt = (input: string): string => {
  return input
    .replace(/\\/g, '\\\\')         // Escape backslashes FIRST
    .replace(/"/g, '\\"')           // Escape double quotes
    .replace(/\r?\n/g, ' ')         // Replace newlines with spaces
    .replace(/\r/g, ' ')            // Replace carriage returns with spaces
    .replace(/\t/g, ' ')            // Replace tabs with spaces
    .trim();                        // Remove leading/trailing whitespace
};