import type { TLEditorSnapshot } from 'tldraw';

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

export interface DrawingFile {
  version: number;
  name: string;
  store: TLEditorSnapshot;
  createdAt: number;
  updatedAt: number;
  cloudId?: string | null; // Published drawing ID for collaboration
}

export interface Tab {
  id: string;
  name: string;
  filePath: string | null;
  isDirty: boolean;
  store: TLEditorSnapshot | null;
  cloudId: string | null; // UUID for cloud sync
}

export interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  recentFiles: RecentFile[];
  isOnline: boolean;
}

// Cloud API types based on backend docs
export interface CloudDrawing {
  id: string;
  name: string | null;
  store: {
    schemaVersion: number;
    records: Record<string, unknown>;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateDrawingDto {
  name?: string;
  store: {
    schemaVersion: number;
    records: Record<string, unknown>;
  };
}

export interface UpdateDrawingDto {
  name?: string;
  store?: {
    schemaVersion: number;
    records: Record<string, unknown>;
  };
}

// WebSocket types
export interface WSJoinPayload {
  roomId: string;
}

export interface WSStoreGetPayload {
  roomId: string;
}

export interface WSStoreSetPayload {
  roomId: string;
  version: number;
  store: {
    schemaVersion: number;
    records: Record<string, unknown>;
  };
}

export interface WSStorePatchPayload {
  roomId: string;
  baseVersion: number;
  changes: {
    put?: Array<{ id: string; typeName: string;[key: string]: unknown }>;
    update?: Array<{ id: string; after: Record<string, unknown> }>;
    remove?: Array<{ id: string }>;
  };
}

export interface WSStoreStateResponse {
  roomId: string;
  version: number;
  store: {
    schemaVersion: number;
    records: Record<string, unknown>;
  };
}

export interface WSErrorResponse {
  code: string;
  message: string;
}

