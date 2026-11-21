import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['game/vendor/', 'game/assets/', 'game/tools/', 'dist/', 'out/', 'firmware/'] },
  js.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['game/src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['**/*.mjs', 'eslint.config.js', 'tools/**'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
];
