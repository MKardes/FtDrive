import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { useTheme, type ThemeChoice } from '../app/theme';
import { Icon } from './Icon';

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; icon: 'sun' | 'moon' | 'globe' }> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'globe' },
];

/**
 * Top-bar user menu (007, research.md D4): avatar initial → popover with the
 * signed-in identity, Account settings, the appearance control (FR-009), and
 * Sign out. Closes on outside click, Escape, or any action.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = user?.username?.charAt(0) ?? '?';

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className="avatar"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Account">
          <div className="menu__header" title={user?.username}>
            Signed in as <strong>{user?.username}</strong>
          </div>
          <div className="menu__separator" />
          <button
            type="button"
            className="menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/account');
            }}
          >
            <Icon name="person" /> Account
          </button>
          <div className="menu__separator" />
          <div className="menu__header">Appearance</div>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="menu__item"
              role="menuitemradio"
              aria-checked={theme === opt.value}
              onClick={() => setTheme(opt.value)}
            >
              <Icon name={opt.icon} /> {opt.label}
              {theme === opt.value && <Icon name="check" className="menu__check" />}
            </button>
          ))}
          <div className="menu__separator" />
          <button
            type="button"
            className="menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
