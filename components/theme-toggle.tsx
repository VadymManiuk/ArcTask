"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

const themeStorageKey = "arctask-theme";

function getCurrentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = getCurrentTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(themeStorageKey, nextTheme);
    setTheme(nextTheme);
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition"
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      aria-pressed={isLight}
      title={isLight ? "Dark theme" : "Light theme"}
    >
      {isLight ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
      <span className="hidden sm:inline">{isLight ? "Dark" : "Light"}</span>
    </button>
  );
}
