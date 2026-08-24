import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // cozy diorama palette (spec §8) — warm ambers/teals, saturated pops
        hearth: {
          50: '#fdf6ec',
          100: '#f9e8d2',
          200: '#f2cfa4',
          300: '#eab271',
          400: '#e29349',
          500: '#d97a2b',
          600: '#bd5f20',
          700: '#96471c',
          800: '#78391d',
          900: '#62301b',
        },
        dusk: {
          50: '#eff8fa',
          100: '#d7edf2',
          200: '#afdae4',
          300: '#7fc0d1',
          400: '#4ba1ba',
          500: '#2f86a1',
          600: '#286c88',
          700: '#25586e',
          800: '#244a5c',
          900: '#233f4e',
          950: '#152833',
        },
      },
      borderRadius: {
        chunky: '1.25rem',
        fat: '1.75rem',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        ambient: 'var(--shadow-ambient)',
        lift: 'var(--shadow-lift)',
        hearth: 'var(--shadow-glow)',
      },
      transitionTimingFunction: {
        pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        settle: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      },
      height: {
        dvh: 'var(--app-height)',
      },
      minHeight: {
        dvh: 'var(--app-height)',
      },
    },
  },
  plugins: [],
};

export default config;
