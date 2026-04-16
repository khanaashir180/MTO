module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.js$'],
  clearMocks: true,
  restoreMocks: true,
};
