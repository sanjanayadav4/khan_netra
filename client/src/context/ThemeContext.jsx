/**
 * KhanNetra — Theme Context
 * Provides light/dark mode toggle with localStorage persistence.
 * Applies  data-theme="light" | "dark"  on <html> so CSS variables
 * defined in index.css switch globally — no per-component changes needed.
 */
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

const STORAGE_KEY = 'khannetra_theme';
const DEFAULT     = 'light';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT; }
    catch { return DEFAULT; }
  });

  /* Apply data-theme attribute to <html> immediately on every change */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  /* Also apply on first render (handles SSR / fast-refresh edge-cases) */
  useEffect(() => {
    const saved = (() => { try { return localStorage.getItem(STORAGE_KEY) || DEFAULT; } catch { return DEFAULT; } })();
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
