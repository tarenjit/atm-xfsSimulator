/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/*.dto.ts'],
  coverageDirectory: 'coverage',
  // Coverage thresholds ramp up by phase:
  //   Phase 1 (scaffold):            no threshold
  //   Phase 2 (devices implemented): 80% enforced
  coverageThreshold: undefined,
};
