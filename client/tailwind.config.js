export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#fffcf7', 100: '#fff7ec', 200: '#fdebd3', 300: '#f6dcb8' },
        ember: { 400: '#fb923c', 500: '#f47b20', 600: '#e0650f', 700: '#b84f0b' },
        ink: { 500: '#6b5a4a', 700: '#47382b', 900: '#2b2119' },
      },
      fontFamily: { sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 0 #f3e2c9, 0 6px 18px -10px rgba(120, 72, 20, 0.25)' },
    },
  },
}
