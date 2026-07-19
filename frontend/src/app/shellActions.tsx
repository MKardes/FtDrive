import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Shell actions (007, research.md D6): the sidebar's "New" menu triggers
 * create/upload/web-download, but those flows (and the upload queue bound to
 * the current folder) are owned by the Browse page. Browse registers its
 * handlers here while mounted; anywhere else `useShellActions()` is null and
 * the New button renders disabled (FR-002 — creation lives where content can
 * be added).
 */
export interface ShellActions {
  newFolder: () => void;
  uploadFiles: () => void;
  downloadFromWeb: () => void;
}

interface ShellActionsContextValue {
  actions: ShellActions | null;
  register: (actions: ShellActions | null) => void;
}

const ShellActionsContext = createContext<ShellActionsContextValue>({
  actions: null,
  register: () => {},
});

export function ShellActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ShellActions | null>(null);
  return (
    <ShellActionsContext.Provider value={{ actions, register: setActions }}>
      {children}
    </ShellActionsContext.Provider>
  );
}

export function useShellActions(): ShellActions | null {
  return useContext(ShellActionsContext).actions;
}

/**
 * Mount-scoped registration. Registers a stable wrapper that always calls the
 * latest handlers via a ref — callers may pass inline objects without causing
 * re-registration loops. Passing `null` (e.g. while a search is active and the
 * view isn't a folder that can receive content) disables the New button.
 */
export function useRegisterShellActions(actions: ShellActions | null) {
  const { register } = useContext(ShellActionsContext);
  const latest = useRef(actions);
  latest.current = actions;
  const enabled = actions !== null;
  useEffect(() => {
    if (!enabled) {
      register(null);
      return undefined;
    }
    register({
      newFolder: () => latest.current?.newFolder(),
      uploadFiles: () => latest.current?.uploadFiles(),
      downloadFromWeb: () => latest.current?.downloadFromWeb(),
    });
    return () => register(null);
  }, [register, enabled]);
}
