import type { Config } from "tailwindcss";

/**
 * Coram design system — foundations.
 *
 * "Four strands, one turn." The palette, type, and geometry are all
 * consequences of the mark: hard edges (zero radius everywhere), one accent
 * (signal), and mono for anything a machine produced.
 *
 * Light-first with dark parity — dark tokens live under the `d-` prefix so a
 * future `dark:` theme has an exact counterpart for every surface.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Zero radius throughout — the mark has no curves and neither does the UI.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      sm: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "0",
    },
    extend: {
      colors: {
        // Light — the default surface.
        paper: "#F8F7F3", // page background
        panel: "#EFEDE7", // raised fill / zebra
        line: "#DCD9D1", // 1px borders
        faint: "#B9B5AB", // disabled text, ellipsis
        muted: "#8A877F", // labels, tertiary text
        body: "#55534D", // secondary body text
        ink: "#191918", // primary text + actions
        "ink-hover": "#000000",
        signal: "#D9482A", // the one accent
        "signal-hover": "#B93A1F",

        // Dark — parity surface (same roles, `d-` prefixed).
        "d-base": "#141413",
        "d-panel": "#1F1F1D",
        "d-line": "#33322E",
        "d-muted": "#9A968D",
        "d-text": "#F1EFE9",
        "d-signal": "#E85736",
      },
      fontFamily: {
        // Everything a human wrote.
        sans: ["'Space Grotesk'", "Helvetica", "Arial", "sans-serif"],
        // If a machine produced it, it is mono.
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        label: "0.08em", // mono uppercase labels
      },
    },
  },
  plugins: [],
} satisfies Config;
