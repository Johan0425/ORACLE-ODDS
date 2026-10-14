/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.js',
      setupFiles: ['<rootDir>/test/integration/env.js'],
    },
    {
      ...base,
      displayName: 'e2e-seed',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.js',
      setupFiles: ['<rootDir>/test/integration/env.js'],
    },
  ],
};
