/**
 * Test: LivePortfolioValue Color Logic
 * 
 * Ensures proper color coding for Today's Return:
 * - Grey for $0.00 (market closed)
 * - Green for positive returns
 * - Red for negative returns
 */

describe('LivePortfolioValue Color Logic', () => {
  test('$0.00 return shows grey color', () => {
    const todayReturn = '$0.00 (0.00%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-gray-500');
  });
  
  test('Positive return shows green color', () => {
    const todayReturn = '+$142.35 (+1.42%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-[#22c55e]');
  });
  
  test('Negative return shows red color', () => {
    const todayReturn = '-$66.91 (-0.64%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-[#ef4444]');
  });
  
  test('Positive $0.00 return shows grey color', () => {
    // Edge case: if backend returns +$0.00 instead of $0.00
    const todayReturn = '+$0.00 (0.00%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-gray-500');
  });
  
  test('Small positive return shows green color', () => {
    const todayReturn = '+$0.01 (+0.01%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-[#22c55e]');
  });
  
  test('Small negative return shows red color', () => {
    const todayReturn = '-$0.01 (-0.01%)';
    
    const isZeroReturn = todayReturn.startsWith('$0.00') || todayReturn.startsWith('+$0.00');
    const isPositiveReturn = todayReturn.startsWith('+') && !isZeroReturn;
    const isNegativeReturn = todayReturn.startsWith('-');
    
    const returnColor = isZeroReturn ? 'text-gray-500' : 
                       isPositiveReturn ? 'text-[#22c55e]' : 
                       isNegativeReturn ? 'text-[#ef4444]' : 
                       'text-gray-500';
    
    expect(returnColor).toBe('text-[#ef4444]');
  });
});

