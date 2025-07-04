// Test setup file for Jest
// This file runs before all tests

// Import jest-dom matchers for React testing
require('@testing-library/jest-dom');

// Mock environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.NEXT_PUBLIC_BETA_TESTING = 'false';

// Global test utilities
global.console = {
  ...console,
  // Suppress console.log in tests unless we explicitly want to see them
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}; 