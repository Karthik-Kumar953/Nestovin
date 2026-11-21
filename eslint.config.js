// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      'docs/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Business dates are India dates (review H-6): `new Date().toISOString().slice(0, 10)` is a UTC date.
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/lib/dates.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.type='NewExpression'][callee.object.callee.object.arguments.length=0]",
          message: 'This is the UTC date. Use businessToday() from src/lib/dates for business dates.',
        },
        {
          selector: "TemplateElement[value.raw=/\\bcurrent_date\\b/]",
          message: "current_date is the UTC date on Supabase. Use (now() at time zone 'Asia/Kolkata')::date.",
        },
      ],
    },
  },
  {
    // Next.js rules for the web app (public site + /admin)
    files: ['apps/web/**/*.{ts,tsx}'],
    ...nextPlugin.configs['core-web-vitals'],
    settings: { next: { rootDir: 'apps/web' } },
  },
);
