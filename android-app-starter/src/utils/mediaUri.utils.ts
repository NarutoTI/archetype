import { Capacitor } from '@capacitor/core';

function needsConvert(uri: string): boolean {
  return !(
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('blob:') ||
    uri.startsWith('data:') ||
    uri.startsWith('capacitor://')
  );
}

export function resolveMediaUri(webPath?: string | null, path?: string | null): string | null {
  if (webPath) return webPath;
  if (!path) return null;
  return needsConvert(path) ? Capacitor.convertFileSrc(path) : path;
}

export function resolveSharedUri(uri?: string | null): string | null {
  if (!uri) return null;
  return needsConvert(uri) ? Capacitor.convertFileSrc(uri) : uri;
}

export async function fetchUriAsBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok && response.status !== 0) {
    throw new Error(`Failed to fetch media URI: ${response.status}`);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('Fetched media is empty');
  }

  return blob;
}
