import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../src/app/theme';

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        go-dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        go-light
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        go-system
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );
}

/** Appearance preference (007, FR-009 / data-model.md). */
describe('ThemeProvider', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system (no stored key, no data-theme attribute)', () => {
    renderProbe();
    expect(screen.getByTestId('current').textContent).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('setTheme stamps the attribute and persists the choice', () => {
    renderProbe();
    act(() => screen.getByText('go-dark').click());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ftdrive:theme')).toBe('dark');
  });

  it('choosing system removes the attribute and the stored key', () => {
    localStorage.setItem('ftdrive:theme', 'light');
    renderProbe();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    act(() => screen.getByText('go-system').click());
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('ftdrive:theme')).toBeNull();
  });

  it('treats an invalid stored value as absent (validated read, data-model.md)', () => {
    localStorage.setItem('ftdrive:theme', 'purple');
    renderProbe();
    expect(screen.getByTestId('current').textContent).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
