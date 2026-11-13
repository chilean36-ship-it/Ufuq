import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately lenient: real bugs (undefined names, broken hooks) are errors, style/cleanliness are warnings,
// so `npm run lint` is useful from day one on a code base that never had a linter.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'supabase/**', 'workers/**', 'asr-space/**', 'archive/**', 'android/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-control-regex': 'warn',
      'no-misleading-character-class': 'warn',
      'no-cond-assign': ['error', 'except-parens'],
    },
  },
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js', 'vite.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { args: 'none' }] },
  },
  {
    // translation tables repeat common words (e.g. "Delete") across sections; the last one wins, which is harmless
    files: ['src/i18n/**/*.js'],
    rules: { 'no-dupe-keys': 'warn' },
  },
];
