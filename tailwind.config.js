/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shafx: {
          bg: '#0B0E11',
          surface: '#151A21',
          surfaceHover: '#1B222B',
          border: '#2A2F38',
          text: '#EAECEF',
          textMuted: '#848E9C',
          primary: '#2962FF',
          primaryHover: '#1E53E5',
          success: '#0ECB81',
          danger: '#F6465D',
        },
      },
    },
  },
  plugins: [],
}
