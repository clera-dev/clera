import { 
  cleanInlineCitations, 
  formatStockRationale, 
  formatInvestmentThemeReport, 
  formatTextWithLineBreaks, 
  splitIntoReadableBullets 
} from '@/utils/textFormatting';

describe('Text Formatting Utilities', () => {
  describe('cleanInlineCitations', () => {
    it('should remove inline citations', () => {
      const text = 'This is a test [1] with citations [2] and [3].';
      const result = cleanInlineCitations(text);
      expect(result).toBe('This is a test with citations and .');
    });

    it('should normalize line endings', () => {
      const text = 'Line 1\r\nLine 2\r\nLine 3';
      const result = cleanInlineCitations(text);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should collapse multiple spaces', () => {
      const text = 'This    has    multiple    spaces';
      const result = cleanInlineCitations(text);
      expect(result).toBe('This has multiple spaces');
    });

    it('should trim whitespace around lines', () => {
      const text = '  Line 1  \n  Line 2  \n  Line 3  ';
      const result = cleanInlineCitations(text);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('formatStockRationale', () => {
    it('should clean citations and preserve formatting', () => {
      const rationale = 'Stock is good [1].\n\n• Strong fundamentals\n• Growing market';
      const result = formatStockRationale(rationale);
      expect(result).toBe('Stock is good .\n\n• Strong fundamentals\n• Growing market');
    });
  });

  describe('formatInvestmentThemeReport', () => {
    it('should clean citations and preserve formatting', () => {
      const report = 'Market analysis [1]:\n\n• Tech sector growth\n• AI investments [2]';
      const result = formatInvestmentThemeReport(report);
      expect(result).toBe('Market analysis :\n\n• Tech sector growth\n• AI investments');
    });
  });

  describe('formatTextWithLineBreaks', () => {
    it('should convert escaped newlines to actual newlines', () => {
      const text = 'Line 1\\nLine 2\\nLine 3';
      const result = formatTextWithLineBreaks(text);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('splitIntoReadableBullets', () => {
    it('should detect and preserve existing bullet points with •', () => {
      const text = '• First bullet point\n• Second bullet point\n• Third bullet point';
      const result = splitIntoReadableBullets(text, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('First bullet point');
      expect(result[1]).toBe('Second bullet point');
      expect(result[2]).toBe('Third bullet point');
    });

    it('should detect and preserve existing bullet points with *', () => {
      const text = '* First bullet point\n* Second bullet point';
      const result = splitIntoReadableBullets(text, 2);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('First bullet point');
      expect(result[1]).toBe('Second bullet point');
    });

    it('should detect and preserve existing bullet points with - at line start', () => {
      const text = '- First bullet point\n- Second bullet point';
      const result = splitIntoReadableBullets(text, 2);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('First bullet point');
      expect(result[1]).toBe('Second bullet point');
    });

    it('should NOT treat hyphens in normal text as bullet points', () => {
      const text = 'This is a well-known company with self-driving technology. The AI-powered system works well.';
      const result = splitIntoReadableBullets(text, 2);
      // Should NOT detect bullets, should split into sentences instead
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('well-known');
      expect(result[1]).toContain('AI-powered');
    });

    it('should handle mixed content with hyphens and actual bullets', () => {
      const text = 'This is a well-known company.\n\n• Strong fundamentals\n• Growing market';
      const result = splitIntoReadableBullets(text, 3);
      // Should detect the actual bullets, not the hyphens in "well-known"
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('This is a well-known company.');
      expect(result[1]).toBe('Strong fundamentals');
      expect(result[2]).toBe('Growing market');
    });

    it('should split sentences when no bullets are present', () => {
      const text = 'This is the first sentence. This is the second sentence. This is the third sentence.';
      const result = splitIntoReadableBullets(text, 2);
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('first sentence');
      expect(result[1]).toContain('third sentence');
    });

    it('should respect maxBullets limit', () => {
      const text = '• This is the first bullet point with sufficient length\n• This is the second bullet point with sufficient length\n• This is the third bullet point with sufficient length\n• This is the fourth bullet point with sufficient length\n• This is the fifth bullet point with sufficient length';
      const result = splitIntoReadableBullets(text, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('This is the first bullet point with sufficient length');
      expect(result[1]).toBe('This is the second bullet point with sufficient length');
      expect(result[2]).toBe('This is the third bullet point with sufficient length');
    });

    it('should filter out very short bullet points', () => {
      const text = '• Short\n• This is a longer bullet point\n• Also short\n• Another good bullet point';
      const result = splitIntoReadableBullets(text, 4);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('This is a longer bullet point');
      expect(result[1]).toBe('Another good bullet point');
    });
  });
});
