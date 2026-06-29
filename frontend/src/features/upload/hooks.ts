import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import type { Node } from '../../api/types';

export interface UploadItem {
  id: string;
  file: File;
  progress: number; // 0..1
  status: 'uploading' | 'done' | 'error';
  error?: string;
  result?: Node;
}

let seq = 0;

/**
 * Drives multi-file uploads into a folder with per-file progress, error/retry,
 * and "kept both" feedback (FR-004/013). On each success the destination
 * folder's listing is invalidated so new files appear (T047).
 */
export function useUploader(parentId: string) {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const runOne = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      try {
        const result = await api.files.upload(
          parentId,
          item.file,
          (fraction) => patch(item.id, { progress: fraction }),
          controller.signal,
        );
        patch(item.id, { status: 'done', progress: 1, result });
        await qc.invalidateQueries({ queryKey: ['children', parentId] });
      } catch (err) {
        const message =
          err instanceof ApiError && err.status === 413
            ? 'File is too large.'
            : 'Upload failed.';
        patch(item.id, { status: 'error', error: message });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [parentId, patch, qc],
  );

  const add = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const next: UploadItem[] = list.map((file) => {
        seq += 1;
        return { id: `up-${seq}`, file, progress: 0, status: 'uploading' as const };
      });
      setItems((prev) => [...prev, ...next]);
      for (const item of next) void runOne(item);
    },
    [runOne],
  );

  const retry = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((it) => it.id === id);
        if (item) void runOne({ ...item, progress: 0, status: 'uploading' });
        return prev.map((it) =>
          it.id === id ? { ...it, status: 'uploading', progress: 0, error: undefined } : it,
        );
      });
    },
    [runOne],
  );

  const dismiss = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status === 'uploading'));
  }, []);

  return { items, add, retry, dismiss, clearCompleted };
}

/** Files whose stored name differs from the chosen name were kept-both (FR-013). */
export function keptBothNotice(items: UploadItem[]): string | null {
  const renamed = items.filter(
    (it) => it.status === 'done' && it.result && it.result.name !== it.file.name,
  );
  if (renamed.length === 0) return null;
  return renamed
    .map((it) => `“${it.file.name}” was kept as “${it.result?.name}”`)
    .join('; ');
}
