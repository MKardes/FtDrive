// Shared API request/response types — mirror the backend DTOs + OpenAPI contract.

export type Role = 'owner' | 'user';
export type UserStatus = 'active' | 'disabled';
export type NodeType = 'folder' | 'file';
export type ThumbStatus = 'none' | 'pending' | 'ready' | 'unsupported';

export interface User {
  id: string;
  username: string;
  /** Optional addressing identity (006): the share dialog resolves recipients by email. */
  email?: string | null;
  role: Role;
  status: UserStatus;
}

export interface Node {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  size: number | null;
  mimeType: string | null;
  thumbStatus: ThumbStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TrashItem extends Node {
  trashedAt: number;
  trashedExpiresAt: number | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type NodePage = Page<Node>;
export type TrashPage = Page<TrashItem>;

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// --- Download-from-web (002-url-video-download) ---

export type DownloadStatus = 'queued' | 'examining' | 'downloading' | 'completed' | 'failed' | 'canceled';

export interface Format {
  formatId: string;
  quality: string | null;
  width: number | null;
  height: number | null;
  ext: string | null;
  estimatedBytes: number | null;
}

export interface DetectedVideoCandidate {
  candidateId: string;
  title: string | null;
  durationSec: number | null;
  formats: Format[];
}

export interface ExamineResult {
  videoFound: boolean;
  directFile?: boolean;
  candidates?: DetectedVideoCandidate[];
}

export interface Download {
  id: string;
  sourceUrl: string;
  destinationFolderId: string | null;
  title: string | null;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number | null;
  nodeId: string | null;
  nodePresent: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type DownloadPage = Page<Download>;

// --- File & folder sharing (006-share-links) ---

export type ShareKind = 'link' | 'user';

export interface Share {
  id: string;
  nodeId: string;
  kind: ShareKind;
  /** Present only on kind='link'. Share URL is `${origin}/s/${token}`. */
  token?: string;
  /** Present only on kind='user'. */
  recipient?: { id: string; username: string; email: string | null };
  createdAt: number;
  expiresAt: number | null;
}

export interface ShareWithNode extends Share {
  node: { id: string; name: string; type: NodeType };
}

export interface SharedWithMeItem {
  shareId: string;
  createdAt: number;
  expiresAt: number | null;
  owner: { username: string };
  node: Node;
}

export interface PublicShareInfo {
  node: Node;
}

export interface DirectoryUser {
  id: string;
  username: string;
  email: string | null;
}
