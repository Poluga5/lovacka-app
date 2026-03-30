/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50:  '#f0faf4',
          100: '#dcf2e4',
          200: '#bce5cc',
          300: '#8dd1a8',
          400: '#58b47e',
          500: '#349960',
          600: '#247a4b',
          700: '#1d623d',
          800: '#1a4e32',
          900: '#17402a',
          950: '#0b2418',
        }
      }
    }
  },
  plugins: [],
}
