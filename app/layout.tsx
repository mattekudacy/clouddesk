import type { Metadata } from "next";
import { Outfit, Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// UI heading font — nav, card titles, buttons, labels. Geometric, warm,
// has presence without feeling mechanical.
const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
});

// Display font — reserved for the largest, rarest moments on a page (hero
// headlines, section titles, the debrief's overall score). A high-contrast
// variable serif is what actually reads as "premium" rather than "SaaS
// template" — used sparingly so it stays an event, not the app's voice.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

// Body font — the primary reading voice throughout the app. Chosen for
// legibility over character; this is a learning tool, not a terminal.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Reserved for tabular/numeric data only (scores, timestamps) — not the
// dominant typeface.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CloudDesk",
  description: "Azure certification prep — simulated client meetings with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} ${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Visually hidden until focused — the first tab stop on every page,
            skipping the nav for keyboard/screen-reader users straight to
            the page's own <main id="main-content">. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-elevated"
        >
          Skip to content
        </a>
        {/* Fixed, pointer-events-none grain — breaks digital flatness without
            ever touching a scrolling container (perf guardrail). */}
        <div aria-hidden className="grain-overlay" />
        {children}
      </body>
    </html>
  );
}
