import nextConfig from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Deterministic engine code: no wall-clock, no Math.random.
const engineFiles = ['packages/engine/src/**/*.ts', 'packages/*/src/**/*.ts'];
const engineExempt = ['**/*.test.ts', '**/cli/**/*.ts', '**/sim/**'];

const cliFiles = ['packages/*/src/cli/**/*.ts'];

const eslintConfig = [
  {
    ignores: [
      '**/node_modules/',
      '**/.next/',
      '**/out/',
      '**/dist/',
      '**/coverage/',
      '**/.vercel/',
      'research/',
    ],
  },

  ...nextConfig,

  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: cliFiles,
    rules: {
      'no-console': 'off',
    },
  },

  // Engine determinism guards (spec §4.1): the seeded RNG is the ONLY randomness
  // source; no wall-clock, no ambient entropy, no DOM, no network, no React.
  //
  // AGENTS.md promises "no React, no DOM APIs, no network imports" are enforced
  // here. Until recently only Math.random / Date.now / new Date actually were,
  // so the guard was narrower than the promise and a violation could land green.
  // These rules close that gap. They restrict *value* references only, so
  // type-only uses (e.g. `type X = Performance`) stay legal.
  {
    files: engineFiles,
    ignores: engineExempt,
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded Rng from @parlour/engine (spec §4.1).',
        },
        {
          object: 'crypto',
          property: 'getRandomValues',
          message: 'Ambient entropy breaks replay. Use the seeded Rng (spec §4.1).',
        },
        {
          object: 'performance',
          property: 'now',
          message:
            'performance.now() is a clock read. Authority time arrives via MoveCtx.event.atMs (spec §4.1).',
        },
      ],
      // Wall-clock, entropy, DOM and network globals. `no-restricted-globals`
      // fires only on unshadowed global *value* references.
      'no-restricted-globals': [
        'error',
        {
          name: 'performance',
          message:
            'Clock reads are banned in engine code. Authority time arrives via MoveCtx.event.atMs (spec §4.1).',
        },
        {
          name: 'crypto',
          message: 'Ambient entropy breaks replay. Use the seeded Rng (spec §4.1).',
        },
        { name: 'fetch', message: 'Engine code is transport-agnostic — no network (spec §4).' },
        { name: 'XMLHttpRequest', message: 'Engine code is transport-agnostic — no network.' },
        { name: 'WebSocket', message: 'Engine code is transport-agnostic — no network.' },
        { name: 'window', message: 'Engine code must not touch the DOM (spec §4).' },
        { name: 'document', message: 'Engine code must not touch the DOM (spec §4).' },
        { name: 'navigator', message: 'Engine code must not touch host APIs (spec §4).' },
        { name: 'localStorage', message: 'Engine code must not touch host storage (spec §4).' },
        { name: 'sessionStorage', message: 'Engine code must not touch host storage (spec §4).' },
      ],
      // Rendering and transport libraries have no business in a rules module.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Engine and game packages are React-free (spec §4).' },
            { name: 'react-dom', message: 'Engine and game packages are React-free (spec §4).' },
            {
              name: 'zustand',
              message: 'Engine state lives in the engine, not a store (spec §4).',
            },
          ],
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'Engine and game packages must not depend on the app framework (spec §4).',
            },
            {
              group: ['node:*', 'fs', 'path', 'http', 'https', 'net'],
              message: 'Engine and game packages are host-agnostic — no Node builtins (spec §4).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Date.now() is banned in engine code — determinism (spec §4.1).',
        },
        {
          // Catches aliasing the old selector missed: `const now = Date.now; now()`.
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Date.now is banned in engine code, including as a value — determinism.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'new Date() is banned in engine code — determinism (spec §4.1).',
        },
      ],
    },
  },

  eslintConfigPrettier,
];

export default eslintConfig;
