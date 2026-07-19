import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Appearance preference (007, research.md D2 / data-model.md): the `data-theme`
 * attribute on <html> is the single CSS source of truth. `'system'` means no
 * attribute — the `prefers-color-scheme` block in global.css decides. The
 * stored value survives reloads via localStorage; a matching pre-paint script
 * in index.html stamps the attribute before first paint so there is no flash.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ftdrive:theme';

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const stored = readStored();
    apply(stored); // re-assert what the pre-paint script did (harmless if identical)
    return stored;
  });

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    apply(choice);
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Storage unavailable (private mode) — the in-session choice still applies.
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
