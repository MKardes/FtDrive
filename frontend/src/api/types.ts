// Shared API request/response types — mirror the backend DTOs + OpenAPI contract.

export type Role = 'owner' | 'user';
export type UserStatus = 'active' | 'disabled';
export type NodeType = 'folder' | 'file';
export type ThumbStatus = 'none' | 'pending' | 'ready' | 'unsupported';

export interface User {
  id: string;
  username: string;
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
