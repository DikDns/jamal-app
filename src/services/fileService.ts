import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { RecentFile, DrawingFile } from '../types';
import type { TLEditorSnapshot } from 'tldraw';

const FILE_EXTENSION = 'jamal';
const FILE_FILTER = {
  name: 'Jamal Drawing',
  extensions: [FILE_EXTENSION],
};

// Generate a unique ID for new tabs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new drawing file structure
export function createDrawingFile(name: string, store: TLEditorSnapshot, cloudId?: string | null): DrawingFile {
  const now = Date.now();
  return {
    version: 1,
    name,
    store,
    createdAt: now,
    updatedAt: now,
    cloudId: cloudId || null,
  };
}

// Save content to a file via Tauri
export async function saveFile(path: string, content: string): Promise<void> {
  await invoke('save_file', { path, content });
}

// Read content from a file via Tauri
export async function readFile(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
}

// Check if file exists
export async function fileExists(path: string): Promise<boolean> {
  return await invoke<boolean>('file_exists', { path });
}

// Get recent files list
export async function getRecentFiles(): Promise<RecentFile[]> {
  const files = await invoke<Array<{ path: string; name: string; last_opened: number }>>('get_recent_files');
  return files.map((f) => ({
    path: f.path,
    name: f.name,
    lastOpened: f.last_opened,
  }));
}

// Add file to recent files
export async function addRecentFile(path: string, name: string): Promise<void> {
  await invoke('add_recent_file', { path, name });
}

// Remove file from recent files
export async function removeRecentFile(path: string): Promise<void> {
  await invoke('remove_recent_file', { path });
}

// Clear all recent files
export async function clearRecentFiles(): Promise<void> {
  await invoke('clear_recent_files');
}

// Open file dialog and return selected path
export async function openFileDialog(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [FILE_FILTER],
  });
  
  if (result && typeof result === 'string') {
    return result;
  }
  
  return null;
}

// Save file dialog and return selected path
export async function saveFileDialog(defaultName?: string): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName ? `${defaultName}.${FILE_EXTENSION}` : undefined,
    filters: [FILE_FILTER],
  });
  
  return result;
}

// Save a drawing to file
export async function saveDrawing(
  path: string,
  name: string,
  store: TLEditorSnapshot,
  cloudId?: string | null
): Promise<void> {
  const file = createDrawingFile(name, store, cloudId);
  file.updatedAt = Date.now();
  
  const content = JSON.stringify(file, null, 2);
  await saveFile(path, content);
  await addRecentFile(path, name);
}

// Open and parse a drawing file
export async function openDrawing(path: string): Promise<DrawingFile> {
  const content = await readFile(path);
  const file = JSON.parse(content) as DrawingFile;
  
  // Add to recent files
  await addRecentFile(path, file.name);
  
  return file;
}

// Extract filename from path
export function getFileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1] || 'Untitled';
  // Remove extension
  return fileName.replace(`.${FILE_EXTENSION}`, '');
}

// Export functions
export async function savePng(
  path: string,
  svgData: string,
  width: number,
  height: number
): Promise<void> {
  await invoke('save_png', { path, svgData, width, height });
}

export async function saveSvg(path: string, svgData: string): Promise<void> {
  await invoke('save_svg', { path, svgData });
}

// Export dialog
export async function exportDialog(
  type: 'png' | 'svg' | 'pdf'
): Promise<string | null> {
  const filters = {
    png: { name: 'PNG Image', extensions: ['png'] },
    svg: { name: 'SVG Image', extensions: ['svg'] },
    pdf: { name: 'PDF Document', extensions: ['pdf'] },
  };
  
  const result = await save({
    filters: [filters[type]],
  });
  
  return result;
}

