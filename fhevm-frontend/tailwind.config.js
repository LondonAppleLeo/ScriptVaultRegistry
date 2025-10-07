/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0B1630',
          dark: '#070f22',
        },
        accent: {
          DEFAULT: '#FF6B5A',
          light: '#ff8a7d',
          dark: '#e5604f',
        },
        cream: {
          DEFAULT: '#FBFBFD',
          dark: '#f5f5f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}


