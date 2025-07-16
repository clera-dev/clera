// Test setup file for Jest
// This file runs before all tests

// Import jest-dom matchers for React testing
require('@testing-library/jest-dom');

// Mock environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_BETA_TESTING = 'false';
process.env.BACKEND_API_KEY = 'test-backend-api-key';

// =================================================================
// ARCHITECTURAL FIX: Removed global console override
// =================================================================
// 
// REASON: Overriding global console is an architectural anti-pattern that:
// - Violates separation of concerns
// - Can interfere with other libraries
// - Makes tests less predictable
// - Creates tight coupling to global state
//
// SOLUTION: Use scoped mocking in individual tests instead:
//
// Example usage in test files:
// ```
// beforeEach(() => {
//   jest.spyOn(console, 'log').mockImplementation(() => {});
//   jest.spyOn(console, 'error').mockImplementation(() => {});
// });
//
// afterEach(() => {
//   jest.restoreAllMocks();
// });
// ```
//
// This approach:
// - Keeps mocking scoped to individual tests
// - Allows fine-grained control over what gets mocked
// - Prevents interference with other test utilities
// - Follows Jest best practices for mocking 