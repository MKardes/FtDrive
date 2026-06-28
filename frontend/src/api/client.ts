import type { Node, NodePage, TrashPage, User } from './types';

const BASE = '/api';

/** Error thrown for any non-2xx API response, carrying the stable machine code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers,
    body,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? res.statusText);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<User>('/auth/login', { method: 'POST', body: { username, password } }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
  },

  account: {
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/account/password', { method: 'POST', body: { currentPassword, newPassword } }),
  },

  nodes: {
    listChildren: (folderId: string, cursor?: string, limit?: number) =>
      request<NodePage>(`/folders/${encodeURIComponent(folderId)}/children`, {
        query: { cursor, limit },
      }),
    search: (q: string, cursor?: string, limit?: number) =>
      request<NodePage>('/search', { query: { q, cursor, limit } }),
    createFolder: (parentId: string | null, name: string) =>
      request<Node>('/folders', { method: 'POST', body: { parentId, name } }),
    update: (id: string, changes: { name?: string; parentId?: string | null }) =>
      request<Node>(`/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
    trash: (id: string) => request<void>(`/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  files: {
    contentUrl: (id: string) => `${BASE}/files/${encodeURIComponent(id)}/content`,
    thumbnailUrl: (id: string) => `${BASE}/files/${encodeURIComponent(id)}/thumbnail`,
    /** Upload one file with progress via XHR; resolves to the created Node. */
    upload: (
      parentId: string,
      file: File,
      onProgress?: (fraction: number) => void,
      signal?: AbortSignal,
    ): Promise<Node> =>
      new Promise<Node>((resolve, reject) => {
        const form = new FormData();
        form.append('parentId', parentId);
        form.append('file', file, file.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', buildUrl('/files'));
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
          const data = safeJson(xhr.responseText) as
            | (Node & { error?: { code?: string; message?: string } })
            | undefined;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data as Node);
          } else {
            const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
            reject(new ApiError(xhr.status, err?.code ?? 'INTERNAL', err?.message ?? xhr.statusText));
          }
        };
        xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Network error'));
        xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload aborted'));
        if (signal) {
          signal.addEventListener('abort', () => xhr.abort());
        }
        xhr.send(form);
      }),
  },

  trash: {
    list: (cursor?: string, limit?: number) =>
      request<TrashPage>('/trash', { query: { cursor, limit } }),
    restore: (id: string) =>
      request<Node>(`/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
    purge: (id: string) =>
      request<void>(`/trash/${encodeURIComponent(id)}`, { method: 'DELETE', query: { confirm: true } }),
    empty: () => request<void>('/trash', { method: 'DELETE', query: { confirm: true } }),
  },

  admin: {
    listUsers: () => request<User[]>('/admin/users'),
    createUser: (username: string, password: string, role: 'owner' | 'user' = 'user') =>
      request<User>('/admin/users', { method: 'POST', body: { username, password, role } }),
    deleteUser: (id: string) =>
      request<void>(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    resetPassword: (id: string, newPassword: string) =>
      request<void>(`/admin/users/${encodeURIComponent(id)}/password-reset`, {
        method: 'POST',
        body: { newPassword },
      }),
  },
};
