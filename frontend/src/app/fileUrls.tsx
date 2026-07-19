import { createContext, useContext } from 'react';
import { api } from '../api/client';

/**
 * Where file bytes come from (006-share-links, research.md §9). The grid,
 * thumbnails, and viewers render nodes from ANY listing — the owner's drive,
 * a "Shared with me" share, or an anonymous open link — and only the URLs
 * differ. The default is the owner API; share views wrap their subtree in a
 * provider pointing at the share-scoped endpoints.
 */
export interface FileUrls {
  contentUrl: (id: string) => string;
  thumbnailUrl: (id: string) => string;
}

const ownerFileUrls: FileUrls = {
  contentUrl: (id) => api.files.contentUrl(id),
  thumbnailUrl: (id) => api.files.thumbnailUrl(id),
};

const FileUrlContext = createContext<FileUrls>(ownerFileUrls);

export function FileUrlProvider({ urls, children }: { urls: FileUrls; children: React.ReactNode }) {
  return <FileUrlContext.Provider value={urls}>{children}</FileUrlContext.Provider>;
}

export function useFileUrls(): FileUrls {
  return useContext(FileUrlContext);
}
