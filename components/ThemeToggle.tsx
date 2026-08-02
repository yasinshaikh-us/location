"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

// Reads the theme the blocking script in layout.tsx already applied, then
// lets the user override it. Same mechanism (data-theme attribute +
// localStorage) as the scorecard app's ThemeToggle.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Intentional: syncs React state with the DOM attribute the blocking
    // theme-init script in layout.tsx already set before hydration —
    // this can only be read client-side, so a one-time effect (rather
    // than deriving in the initial render, which would mismatch SSR
    // output) is the correct tool here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#14181D" : "#F7F4EC");
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-faint transition hover:border-accent hover:text-accent"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
