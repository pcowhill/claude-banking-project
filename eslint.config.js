// Flat ESLint config (ESLint 9 + typescript-eslint 8) for the SimBank monorepo.
// Kept intentionally lean for the v0.1.0 foundation: it should catch real
// problems without fighting the placeholder/shell code that early milestones
// contain. Rules tighten in later milestones as real logic lands.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // Generated / build / vendored output is never linted.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/src/generated/**',
      'apps/backend/prisma/migrations/**',
    ],
  },

  // Base JS + TypeScript recommended rules for all source files.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },

  // Browser globals + React rules for the two frontend apps.
  {
    files: ['apps/customer/**/*.{ts,tsx}', 'apps/operations/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Config files, Node scripts, and .mjs/.cjs helpers may use Node globals freely.
  {
    files: [
      '**/*.config.{js,ts}',
      '**/*.mjs',
      '**/*.cjs',
      'scripts/**/*.{js,mjs,ts}',
      '**/vite.config.ts',
      '**/tailwind.config.js',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
);
