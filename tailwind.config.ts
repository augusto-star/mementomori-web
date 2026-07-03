import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0f1117',
        panel: '#1a1d27',
        border: '#2a2d3a',
        gold: '#c9a84c',
        'gold-light': '#e8c97a',
        cream: '#f5f0e8',
      },
    },
  },
  plugins: [],
};

export default config;
