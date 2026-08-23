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
  // source; no Date.now / new Date / Math.random in game logic.
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
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Date.now() is banned in engine code — determinism (spec §4.1).',
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
