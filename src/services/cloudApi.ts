import type {
  CloudDrawing,
  CreateDrawingDto,
  UpdateDrawingDto,
} from '../types';

// Production API URL - can be overridden with VITE_API_URL env var
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.jamal.rplupiproject.com';

// API key from environment variable (VITE_ prefix required for Vite to expose it)
let apiKey: string | null = import.meta.env.VITE_COLLAB_API_KEY || null;

export function setApiKey(key: string | null) {
  apiKey = key;
}

export function getApiKey(): string | null {
  return apiKey;
}

// Initialize API key from env on module load
console.log('[CloudAPI] API Key configured:', apiKey ? 'Yes' : 'No');

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (apiKey) {
    // Use X-API-Key header as expected by the backend
    (headers as Record<string, string>)['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  return response;
}

// =====================================================
// Drawings API
// =====================================================

export async function getAllDrawings(): Promise<CloudDrawing[]> {
  const response = await fetchWithAuth('/drawings');
  if (!response.ok) {
    throw new Error(`Failed to fetch drawings: ${response.statusText}`);
  }
  return response.json();
}

export async function getDrawingById(id: string): Promise<CloudDrawing> {
  const response = await fetchWithAuth(`/drawings/${id}`);
  if (response.status === 404) {
    throw new Error('Drawing not found');
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch drawing: ${response.statusText}`);
  }
  return response.json();
}

export async function createDrawing(data: CreateDrawingDto): Promise<CloudDrawing> {
  const response = await fetchWithAuth('/drawings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (response.status === 400) {
    throw new Error('Invalid drawing data');
  }
  if (!response.ok) {
    throw new Error(`Failed to create drawing: ${response.statusText}`);
  }
  return response.json();
}

export async function updateDrawing(id: string, data: UpdateDrawingDto): Promise<CloudDrawing> {
  const response = await fetchWithAuth(`/drawings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (response.status === 404) {
    throw new Error('Drawing not found');
  }
  if (!response.ok) {
    throw new Error(`Failed to update drawing: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteDrawing(id: string): Promise<CloudDrawing> {
  const response = await fetchWithAuth(`/drawings/${id}`, {
    method: 'DELETE',
  });
  if (response.status === 404) {
    throw new Error('Drawing not found');
  }
  if (!response.ok) {
    throw new Error(`Failed to delete drawing: ${response.statusText}`);
  }
  return response.json();
}

