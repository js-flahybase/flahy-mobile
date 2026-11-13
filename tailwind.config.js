/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
        colors: {
            primary: "#70A263",
            secondary: "#BB8785",
            background: "#FFFBE6", // Cream Updated
            card: "#FFFFFF",
            input: "#FFFFFF",
            teal: "#2CAEA6",
            "teal-light": "#75BAD8",
            "green-light": "#D8E8D4",
            mint: "#E6F4F1",
            "text-primary": "#1B2C3F",
            "text-secondary": "#6C7074",
            border: "#E2E8F0",
            surface: "#F4F4F4",
            "surface-strong": "#D9D9D9"
        },
        fontFamily: {
            system: ['System', 'sans-serif'],
            modern: ['Avenir', 'Helvetica Neue', 'Roboto', 'sans-serif'],
        }
    },
  },
  plugins: [],
}
