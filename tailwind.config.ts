import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  // Thème piloté par la classe `dark` posée sur <html> par next-themes
  // (interrupteur Soleil/Lune avec détection automatique prefers-color-scheme).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#16a34a',
          dark: '#15803d',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};

export default config;