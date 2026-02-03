module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/lib', '<rootDir>/config'],
  testMatch: ['**/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],

  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  collectCoverageFrom: [
    'lib/**/*.ts',
    'config/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  // Coverage thresholds are disabled because ts-jest 29 + Jest 30 do not
  // produce reliable istanbul instrumentation. Re-enable after upgrading
  // ts-jest to a version compatible with Jest 30.
  // coverageThreshold: {
  //   global: {
  //     branches: 50,
  //     functions: 60,
  //     lines: 60,
  //     statements: 60,
  //   },
  // },

  // Performance
  maxWorkers: '50%',

  // Timeouts for CDK tests (can be slow)
  testTimeout: 30000,

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/cdk.out/',
  ],

  // Module path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/lib/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },

  // Verbose output for debugging
  verbose: false,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Snapshot configuration
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};
