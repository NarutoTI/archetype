import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { fetchUriAsBlob, resolveSharedUri } from '@/utils/mediaUri.utils';
import { logger } from '@/utils/logger';

const STAGING_DIR = 'share-import';
const SESSION_TTL_MS = 5 * 60 * 1000;
const MANIFEST_PREF_KEY = 'share_intake_pending';
const STAGING_HARD_CAP = 30;

export interface ShareIntakeAttachment {
  blob: Blob;
  name: string;
  mimeType: string;
}

export interface ShareIntake {
  images?: Blob[];
  files?: ShareIntakeAttachment[];
  text?: string;
  url?: string;
}

interface PendingShareManifest {
  sessionId: string;
  receivedAt: number;
  claimedAt: number | null;
  copiedPaths: string[];
  fingerprint: string;
  mimeTypes: string[];
  fileNames: string[];
}

interface ShareReceivedFile {
  uri?: string;
  path?: string;
  name?: string;
  mimeType?: string;
}

interface ShareReceivedEvent {
  files?: ShareReceivedFile[];
  text?: string;
  title?: string;
}

class ShareIntakeService {
  private pending: PendingShareManifest | null = null;
  private listeners: Array<() => void> = [];
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.isInitialized = true;
      return;
    }

    try {
      const [mod] = await Promise.all([
        import('@capgo/capacitor-share-target').catch((error) => {
          logger.error('share-intake: plugin import failed', error);
          return null;
        }),
        this.restorePendingFromPreferences(),
      ]);

      const plugin: any = mod
        ? ((mod as any).CapacitorShareTarget ?? (mod as any).default ?? mod)
        : null;
      if (plugin?.addListener) {
        await plugin.addListener('shareReceived', async (event: ShareReceivedEvent) => {
          await this.handleShareReceived(event).catch((error) => {
            logger.error('share-intake: share handling failed', error);
          });
        });
      }
    } finally {
      this.isInitialized = true;
    }
  }

  onShareReceived(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  async claimPending(): Promise<ShareIntake | null> {
    if (!this.pending) return null;

    if (Date.now() - this.pending.receivedAt > SESSION_TTL_MS) {
      const stale = this.pending;
      await this.clearPending();
      await this.cleanupSession(stale.sessionId).catch(() => {});
      return null;
    }

    const claimed = { ...this.pending, claimedAt: Date.now() };
    await this.persistManifest(claimed);
    this.pending = claimed;
    return this.materialize(claimed);
  }

  async ackConsumed(): Promise<void> {
    if (!this.pending) return;
    const sessionId = this.pending.sessionId;
    await this.clearPending();
    await this.cleanupSession(sessionId).catch(() => {});
  }

  private async handleShareReceived(event: ShareReceivedEvent): Promise<void> {
    const files = (event.files || []).filter((file) => this.isImageLike(file)).slice(0, STAGING_HARD_CAP);
    if (!files.length) return;

    const sourceUris = files.map((file) => file.uri || file.path || '').filter(Boolean);
    const fingerprint = `${sourceUris.length}::${sourceUris.join('|')}`;
    if (this.pending?.fingerprint === fingerprint) return;

    const sessionId = crypto.randomUUID();
    const sessionDir = `${STAGING_DIR}/${sessionId}`;
    await Filesystem.mkdir({ path: sessionDir, directory: Directory.Data, recursive: true }).catch(() => {});

    const copiedPaths: string[] = [];
    const mimeTypes: string[] = [];
    const fileNames: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const sourceUri = file.uri || file.path;
      if (!sourceUri) continue;

      const resolved = resolveSharedUri(sourceUri);
      if (!resolved) continue;

      const blob = await fetchUriAsBlob(resolved);
      const base64 = await this.blobToBase64(blob);
      const extension = this.guessExtension(file.mimeType, file.name);
      const storedPath = `${sessionDir}/${index}.${extension}`;
      await Filesystem.writeFile({ path: storedPath, data: base64, directory: Directory.Data });
      copiedPaths.push(storedPath);
      mimeTypes.push(file.mimeType || 'image/jpeg');
      fileNames.push(file.name || `image-${index}.${extension}`);
    }

    if (!copiedPaths.length) {
      await this.cleanupSession(sessionId).catch(() => {});
      return;
    }

    if (this.pending) {
      await this.cleanupSession(this.pending.sessionId).catch(() => {});
    }

    this.pending = {
      sessionId,
      receivedAt: Date.now(),
      claimedAt: null,
      copiedPaths,
      fingerprint,
      mimeTypes,
      fileNames,
    };
    await this.persistManifest(this.pending);
    this.listeners.forEach((listener) => listener());
  }

  private async materialize(manifest: PendingShareManifest): Promise<ShareIntake | null> {
    const blobs: Blob[] = [];
    for (const path of manifest.copiedPaths) {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      const resolved = resolveSharedUri(uri) || uri;
      blobs.push(await fetchUriAsBlob(resolved));
    }
    return blobs.length ? { images: blobs } : null;
  }

  private isImageLike(file: ShareReceivedFile): boolean {
    if (file.mimeType?.startsWith('image/')) return true;
    const value = `${file.name || file.uri || file.path || ''}`.toLowerCase();
    return /\.(jpe?g|png|webp|gif|heic|heif|bmp)(\?|#|$)/.test(value);
  }

  private async restorePendingFromPreferences(): Promise<void> {
    const { value } = await Preferences.get({ key: MANIFEST_PREF_KEY });
    if (!value) return;

    try {
      const manifest = JSON.parse(value) as PendingShareManifest;
      if (Date.now() - manifest.receivedAt > SESSION_TTL_MS) {
        await this.cleanupSession(manifest.sessionId).catch(() => {});
        await Preferences.remove({ key: MANIFEST_PREF_KEY });
        return;
      }
      this.pending = manifest;
    } catch {
      await Preferences.remove({ key: MANIFEST_PREF_KEY });
    }
  }

  private async persistManifest(manifest: PendingShareManifest): Promise<void> {
    await Preferences.set({ key: MANIFEST_PREF_KEY, value: JSON.stringify(manifest) });
  }

  private async clearPending(): Promise<void> {
    this.pending = null;
    await Preferences.remove({ key: MANIFEST_PREF_KEY }).catch(() => {});
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    await Filesystem.rmdir({
      path: `${STAGING_DIR}/${sessionId}`,
      directory: Directory.Data,
      recursive: true,
    });
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }

  private guessExtension(mimeType?: string, name?: string): string {
    const fromName = name?.split('.').pop()?.toLowerCase();
    if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
    return 'jpg';
  }
}

export const shareIntakeService = new ShareIntakeService();
