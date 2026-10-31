/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        alert: {
          normal: '#22c55e',
          atencao: '#f59e0b',
          vermelho: '#ef4444',
        },
      },
    },
  },
  plugins: [],
}