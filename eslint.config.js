// ESLint "flat config".
// Docs: https://typescript-eslint.io/getting-started
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Cyclomatic complexity: how many independent paths run through a function.
      // Anything above 10 is hard to read and hard to test.
      complexity: ['error', 10],
      // Long functions are a smell too, but we only warn about them.
      'max-lines-per-function': ['warn', 60],
    },
  },
  {
    // Test files group many cases under one describe(); length is not a smell there.
    files: ['tests/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    ignores: ['dist/', 'coverage/', 'node_modules/'],
  },
);
