import rootConfig from '../../eslint.config.mjs';

const palaceConfig = [
  ...rootConfig,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'Pass runtime-independent values through typed game or bot configuration.',
        },
        {
          name: 'global',
          message: 'Production game logic must not read mutable host globals.',
        },
        {
          name: 'globalThis',
          message: 'Production game logic must not read mutable host globals.',
        },
      ],
    },
  },
];

export default palaceConfig;
