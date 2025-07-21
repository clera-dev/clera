module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests', '<rootDir>/utils'],
  testMatch: [
    '**/__tests__/**/*.{js,ts,tsx}',
    '**/*.(test|spec).{js,ts,tsx}'
  ],
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  verbose: true,
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Configure test environment per test file
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
}; 