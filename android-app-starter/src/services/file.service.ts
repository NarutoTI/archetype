import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { dateToISOStringWithTime } from '@/utils/date.utils';
import type { Attachment, AttachmentDraft } from '@/types/Attachment';

const ATTACHMENT_PREFIX = 'file_';
const OPEN_CACHE_DIR = 'open-files';
export const MAX_ATTACHMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  'exe',
  'dll',
  'bat',
  'cmd',
  'msi',
  'apk',
  'app',
  'dmg',
  'sh',
  'ps1',
  'com',
  'scr',
  'jar',
]);

export type FileValidationErrorCode =
  | 'FILE_LIMIT_REACHED'
  | 'FILE_SIZE_LIMIT_EXCEEDED'
  | 'FILE_TYPE_BLOCKED';

export class FileValidationError extends Error {
  constructor(
    public code: FileValidationErrorCode,
    public details: { fileName?: string; limit?: number; maxSize?: number } = {},
  ) {
    super(code);
    this.name = 'FileValidationError';
  }
}

class FileService {
  private normalizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  private getItemDir(itemId: string, collection = 'default'): string {
    return `media/files/${this.normalizeSegment(collection)}/${this.normalizeSegment(itemId)}`;
  }

  private getAttachmentPath(itemId: string, storedName: string, collection = 'default'): string {
    return `${this.getItemDir(itemId, collection)}/${storedName}`;
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true });
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      if (!/\b(already exists?|does already exist)\b/.test(message)) throw error;
    }
  }

  private createId(): string {
    return crypto.randomUUID();
  }

  private sanitizeFileName(fileName: string): string {
    const name = fileName.split(/[\\/]/).pop() || 'file';
    const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ascii.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'file';
  }

  private buildStoredName(id: string, originalName: string): string {
    const compactId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    return `${ATTACHMENT_PREFIX}${compactId}_${this.sanitizeFileName(originalName)}`;
  }

  private getExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex >= 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : '';
  }

  private stripDataUrl(dataUrl: string): string {
    return dataUrl.replace(/^data:[^;]+;base64,/, '');
  }

  private dataUrlToBlob(dataUrl: string, fallbackMimeType = 'application/octet-stream'): Blob {
    const [header, base64Data] = dataUrl.split(',');
    const mimeType = header?.match(/^data:([^;]+);base64$/)?.[1] || fallbackMimeType;
    const bytes = Uint8Array.from(atob(base64Data || ''), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }

  async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  validateFiles(files: File[], existingCount: number, maxFiles: number): void {
    if (Number.isFinite(maxFiles) && existingCount + files.length > maxFiles) {
      throw new FileValidationError('FILE_LIMIT_REACHED', { limit: maxFiles });
    }

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
        throw new FileValidationError('FILE_SIZE_LIMIT_EXCEEDED', {
          fileName: file.name,
          maxSize: MAX_ATTACHMENT_FILE_SIZE_BYTES,
        });
      }

      if (BLOCKED_ATTACHMENT_EXTENSIONS.has(this.getExtension(file.name))) {
        throw new FileValidationError('FILE_TYPE_BLOCKED', { fileName: file.name });
      }
    }
  }

  async createDrafts(files: File[]): Promise<AttachmentDraft[]> {
    this.validateFiles(files, 0, Infinity);
    const drafts: AttachmentDraft[] = [];

    for (const file of files) {
      const id = this.createId();
      drafts.push({
        id,
        name: file.name || 'file',
        storedName: this.buildStoredName(id, file.name || 'file'),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        createdAt: dateToISOStringWithTime(new Date()),
        dataUrl: await this.fileToDataUrl(file),
      });
    }

    return drafts;
  }

  normalizeDrafts(files: AttachmentDraft[]): AttachmentDraft[] {
    return files.map((file) => {
      const id = file.id || this.createId();
      return {
        ...file,
        id,
        name: file.name || 'file',
        storedName: file.storedName || this.buildStoredName(id, file.name || 'file'),
        mimeType: file.mimeType || 'application/octet-stream',
        size: Number(file.size || 0),
      };
    });
  }

  toMetadata(files: AttachmentDraft[]): Attachment[] {
    return this.normalizeDrafts(files).map(({ dataUrl, ...metadata }) => metadata);
  }

  async saveFiles(itemId: string, files: AttachmentDraft[], collection = 'default'): Promise<void> {
    const normalizedFiles = this.normalizeDrafts(files);
    await this.ensureDirectory(this.getItemDir(itemId, collection));
    for (const file of normalizedFiles) {
      if (!file.dataUrl) continue;
      await Filesystem.writeFile({
        path: this.getAttachmentPath(itemId, file.storedName, collection),
        data: this.stripDataUrl(file.dataUrl),
        directory: Directory.Data,
        recursive: true,
      });
    }
  }

  async getFileDataUrl(itemId: string, attachment: Attachment, collection = 'default'): Promise<string | null> {
    try {
      const result = await Filesystem.readFile({
        path: this.getAttachmentPath(itemId, attachment.storedName, collection),
        directory: Directory.Data,
      });
      return `data:${attachment.mimeType || 'application/octet-stream'};base64,${result.data}`;
    } catch {
      return null;
    }
  }

  async deleteFile(itemId: string, attachment: Attachment, collection = 'default'): Promise<void> {
    await Filesystem.deleteFile({
      path: this.getAttachmentPath(itemId, attachment.storedName, collection),
      directory: Directory.Data,
    });
  }

  async deleteFiles(itemId: string, attachments: Attachment[], collection = 'default'): Promise<void> {
    await Promise.all(
      attachments.map((attachment) =>
        this.deleteFile(itemId, attachment, collection).catch(() => {
          // Arquivos ausentes não devem bloquear a limpeza de metadados.
        }),
      ),
    );
  }

  async deleteAllFiles(itemId: string, collection = 'default'): Promise<void> {
    try {
      await Filesystem.rmdir({
        path: this.getItemDir(itemId, collection),
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // O diretório pode não existir.
    }
  }

  async openFile(attachment: AttachmentDraft): Promise<void> {
    if (!attachment.dataUrl) {
      throw new Error('File content is not available on this device');
    }

    if (!Capacitor.isNativePlatform()) {
      const blob = this.dataUrlToBlob(attachment.dataUrl, attachment.mimeType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name || this.sanitizeFileName(attachment.storedName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    await Filesystem.mkdir({ path: OPEN_CACHE_DIR, directory: Directory.Cache, recursive: true }).catch(() => {});
    const cachePath = `${OPEN_CACHE_DIR}/${this.sanitizeFileName(attachment.name || attachment.storedName)}`;
    await Filesystem.writeFile({
      path: cachePath,
      data: this.stripDataUrl(attachment.dataUrl),
      directory: Directory.Cache,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path: cachePath, directory: Directory.Cache });
    await Share.share({ title: attachment.name, files: [uri] });
  }
}

export const fileService = new FileService();
