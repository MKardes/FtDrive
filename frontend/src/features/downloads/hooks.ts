import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { DownloadPage } from '../../api/types';

/** Bounded, side-effect-free URL examination (US1) — powers the review step of the paste-URL dialog. */
export function useExamineUrl() {
  return useMutation({
    mutationFn: (url: string) => api.downloads.examine(url),
  });
}

/** Enqueue a download (US1/US3); invalidates the list so the new job shows up immediately. */
export function useCreateDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; destinationFolderId?: string | null; formatId?: string | null }) =>
      api.downloads.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}

const ACTIVE_STATUSES = new Set(['queued', 'examining', 'downloading']);

/** The caller's downloads (US2); polls while anything is still active, stops once everything is terminal. */
export function useDownloads() {
  return useQuery({
    queryKey: ['downloads'],
    queryFn: (): Promise<DownloadPage> => api.downloads.list({ limit: 100 }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((d) => ACTIVE_STATUSES.has(d.status)) ? 1500 : false;
    },
  });
}

export function useCancelDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.downloads.cancel(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}

export function useRetryDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.downloads.retry(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}

export function useDeleteDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.downloads.deleteOne(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}

export function useClearDownloadHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.downloads.clearHistory(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['downloads'] }),
  });
}
