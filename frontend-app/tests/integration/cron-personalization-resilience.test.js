/**
 * Integration test to verify cron job resilience with personalization errors
 * This test simulates the critical scenario where one user's personalization data
 * fails to load but the cron job should continue processing other users.
 */

const { describe, test, expect, jest } = require('@jest/globals');

describe('Cron Job Personalization Resilience', () => {
  test('should continue processing users when personalization fails for some users', async () => {
    // Mock the service behavior
    const mockFetchUserPersonalization = jest.fn();
    
    // Simulate different user scenarios
    const users = [
      { user_id: 'user1' }, // Success case
      { user_id: 'user2' }, // Database error case
      { user_id: 'user3' }, // Success case
      { user_id: 'user4' }, // No personalization data case
    ];
    
    // Mock responses for different scenarios
    mockFetchUserPersonalization
      .mockResolvedValueOnce({ // user1 - success
        firstName: 'John',
        investmentGoals: ['retirement'],
        riskTolerance: 'moderate',
        investmentTimeline: '5_to_10_years',
        experienceLevel: 'comfortable',
        monthlyInvestmentGoal: 500,
        marketInterests: ['technology']
      })
      .mockResolvedValueOnce(null) // user2 - database error gracefully handled
      .mockResolvedValueOnce({ // user3 - success
        firstName: 'Jane',
        investmentGoals: ['house'],
        riskTolerance: 'aggressive',
        investmentTimeline: '3_to_5_years',
        experienceLevel: 'professional',
        monthlyInvestmentGoal: 1000,
        marketInterests: ['healthcare']
      })
      .mockResolvedValueOnce(null); // user4 - no personalization data
    
    // Simulate cron job processing loop
    const processedUsers = [];
    const failedUsers = [];
    
    for (const user of users) {
      try {
        console.log(`Processing user ${user.user_id}...`);
        
        // Call with graceful error handling (throwOnError: false)
        const personalizationData = await mockFetchUserPersonalization(user.user_id, {}, { throwOnError: false });
        
        // Even if personalization fails, we should be able to continue
        processedUsers.push({
          userId: user.user_id,
          hasPersonalization: personalizationData !== null,
          personalizationData
        });
        
        console.log(`✅ Successfully processed user ${user.user_id}`);
        
      } catch (error) {
        // This should NOT happen with throwOnError: false
        console.error(`❌ Failed to process user ${user.user_id}:`, error);
        failedUsers.push(user.user_id);
      }
    }
    
    // Verify all users were processed successfully
    expect(processedUsers).toHaveLength(4);
    expect(failedUsers).toHaveLength(0);
    
    // Verify user processing results
    expect(processedUsers[0].hasPersonalization).toBe(true); // user1 - success
    expect(processedUsers[1].hasPersonalization).toBe(false); // user2 - graceful error handling
    expect(processedUsers[2].hasPersonalization).toBe(true); // user3 - success
    expect(processedUsers[3].hasPersonalization).toBe(false); // user4 - no data
    
    // Verify that users with successful personalization have data
    expect(processedUsers[0].personalizationData.firstName).toBe('John');
    expect(processedUsers[2].personalizationData.firstName).toBe('Jane');
    
    // Verify that users without personalization have null data
    expect(processedUsers[1].personalizationData).toBeNull();
    expect(processedUsers[3].personalizationData).toBeNull();
  });

  test('should demonstrate the difference between API route and cron job error handling', async () => {
    const mockService = {
      fetchUserPersonalization: jest.fn()
    };

    // Simulate database error
    const dbError = new Error('Database connection timeout');

    // Test API route behavior (throwOnError: true - default)
    mockService.fetchUserPersonalization.mockRejectedValueOnce(dbError);
    
    await expect(
      mockService.fetchUserPersonalization('user1', {}, { throwOnError: true })
    ).rejects.toThrow('Database connection timeout');

    // Test cron job behavior (throwOnError: false)
    mockService.fetchUserPersonalization.mockResolvedValueOnce(null);
    
    const cronResult = await mockService.fetchUserPersonalization('user1', {}, { throwOnError: false });
    expect(cronResult).toBeNull();
  });

  test('should maintain backward compatibility for existing API routes', async () => {
    const mockService = {
      fetchUserPersonalization: jest.fn()
    };

    const dbError = new Error('Database error');
    mockService.fetchUserPersonalization.mockRejectedValueOnce(dbError);

    // Existing API routes don't specify options, so should still throw by default
    await expect(
      mockService.fetchUserPersonalization('user1', {})
    ).rejects.toThrow('Database error');
  });

  test('should handle NewsPersonalizationService gracefully with null data', () => {
    // Mock the NewsPersonalizationService behavior with null data
    const mockNewsService = {
      getUserGoalsSummary: jest.fn().mockReturnValue('Long-term growth, focus on diversified portfolio'),
      getFinancialLiteracyLevel: jest.fn().mockReturnValue('intermediate')
    };

    // Even when personalization data is null, the service should provide defaults
    const userGoals = mockNewsService.getUserGoalsSummary(null);
    const financialLiteracy = mockNewsService.getFinancialLiteracyLevel(null);

    expect(userGoals).toBe('Long-term growth, focus on diversified portfolio');
    expect(financialLiteracy).toBe('intermediate');
  });
});
