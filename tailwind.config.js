/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shafx: {
          bg: '#070A0F',
          surface: '#0D121A',
          surfaceHover: '#141B26',
          border: '#202A38',
          text: '#F3F6FA',
          textMuted: '#8A96A8',
          primary: '#7C5CFC',
          primaryHover: '#6845F2',
          accent: '#7C5CFC',
          accentSoft: '#A78BFA',
          success: '#22D3A5',
          danger: '#FF5C75',
          warning: '#F5B84B',
          info: '#5CA8FF',
        },
      },
    },
  },
  plugins: [],
}
