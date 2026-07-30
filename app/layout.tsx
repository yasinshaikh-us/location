import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Location Timeline",
  description: "Ask questions about your own location history",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Location Timeline",
  },
};

export const viewport: Viewport = {
  // A single static tag, corrected by the blocking script below and by
  // ThemeToggle on every toggle — a pair of media-keyed tags would let
  // the browser pick one by system preference regardless of an explicit
  // in-app override, which defeats the toggle.
  themeColor: "#14181D",
};

// Blocking (strategy="beforeInteractive", so it runs before hydration and
// before first paint) — avoids a flash of the wrong theme, and corrects
// the theme-color meta tag to match. Same script, same data-theme/
// localStorage mechanism, as the scorecard app's index.html.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#14181D" : "#F7F4EC");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-bg font-sans text-text antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
