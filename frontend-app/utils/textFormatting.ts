/**
 * Text formatting utilities for improving readability of investment content
 * Similar to how daily news summary handles text processing
 */

// Clean inline citations and extra whitespace
export const cleanInlineCitations = (text: string): string => {
  // Preserve newlines; collapse only spaces/tabs and trim per-line whitespace
  return text
    .replace(/\r\n/g, '\n')            // Normalize Windows line endings
    .replace(/\[\d+\]/g, '')           // Remove inline numeric citations like [1]
    .replace(/[ \t]{2,}/g, ' ')          // Collapse multiple spaces/tabs but NOT newlines
    .replace(/[ \t]+\n/g, '\n')        // Trim trailing spaces at end of lines
    .replace(/\n[ \t]+/g, '\n')        // Trim leading spaces at start of lines
    .trim();
};

// Format stock rationale - preserve Perplexity's native formatting
export const formatStockRationale = (rationale: string): string => {
  // Just clean citations and preserve all native formatting (bullet points, line breaks)
  return cleanInlineCitations(rationale).trim();
};

// Format investment theme report - preserve Perplexity's native formatting  
export const formatInvestmentThemeReport = (report: string): string => {
  // The data already has proper \n\n characters - just clean citations
  return cleanInlineCitations(report).trim();
};

// Enhanced text display with proper line breaks (similar to daily news summary)
export const formatTextWithLineBreaks = (text: string): string => {
  return cleanInlineCitations(text).replace(/\\n/g, '\n');
};

// Split text into digestible bullet points (mobile-friendly)
export const splitIntoReadableBullets = (text: string, maxBullets: number = 4): string[] => {
  const cleaned = cleanInlineCitations(text);
  
  // If already has bullets, clean and return them
  if (cleaned.includes('•') || cleaned.includes('*') || cleaned.includes('-')) {
    return cleaned
      .split(/[\n•\*-]+/)
      .map(bullet => bullet.trim())
      .filter(bullet => bullet.length > 10)
      .slice(0, maxBullets);
  }
  
  // Split into sentences and group into bullets
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const bullets: string[] = [];
  
  // Try to fill maxBullets by adjusting grouping
  if (sentences.length <= maxBullets) {
    // One sentence per bullet
    return sentences.slice(0, maxBullets).map(s => s.trim() + (s.trim().endsWith('.') ? '' : '.'));
  } else {
    // Group sentences to fit maxBullets
    const sentencesPerBullet = Math.ceil(sentences.length / maxBullets);
    for (let i = 0; i < sentences.length && bullets.length < maxBullets; i += sentencesPerBullet) {
      const bullet = sentences.slice(i, i + sentencesPerBullet).join('.').trim();
      if (bullet) {
        bullets.push(bullet + (bullet.endsWith('.') ? '' : '.'));
      }
    }
  }
  
  return bullets;
};
