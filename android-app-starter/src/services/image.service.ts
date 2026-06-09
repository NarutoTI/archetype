import { Directory, Filesystem } from '@capacitor/filesystem';
import { logger } from '@/utils/logger';

const DEFAULT_COLLECTION = 'default';
const DEFAULT_MAX_IMAGES = 12;
const MAX_IMAGE_SIZE = 1024;
const IMAGE_QUALITY = 0.8;
const IMAGE_FORMAT = 'jpeg';

// Erro tipado para a tela exibir mensagem específica (espelha FileValidationError).
export class ImageLimitError extends Error {
  constructor(public maxImages: number) {
    super(`Maximum of ${maxImages} images reached`);
    this.name = 'ImageLimitError';
  }
}

class ImageService {
  async resizeImage(input: Blob, opts: { skipIfSmaller?: boolean } = {}): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      try {
        const sourceWidth = bitmap.width;
        const sourceHeight = bitmap.height;
        const needsResize = sourceWidth > MAX_IMAGE_SIZE || sourceHeight > MAX_IMAGE_SIZE;

        if (!needsResize && opts.skipIfSmaller && input.type === 'image/jpeg') {
          return input;
        }

        const ratio = Math.min(MAX_IMAGE_SIZE / sourceWidth, MAX_IMAGE_SIZE / sourceHeight, 1);
        const width = Math.round(sourceWidth * ratio);
        const height = Math.round(sourceHeight * ratio);
        return await this.bitmapToBlob(bitmap, width, height);
      } finally {
        bitmap.close?.();
      }
    } catch (error) {
      logger.error('Image resize failed, using legacy path:', error);
      return this.resizeImageLegacy(input);
    }
  }

  private async bitmapToBlob(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Failed to get OffscreenCanvas context');
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: `image/${IMAGE_FORMAT}`, quality: IMAGE_QUALITY });
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Failed to encode image')),
        `image/${IMAGE_FORMAT}`,
        IMAGE_QUALITY,
      );
    });
  }

  private resizeImageLegacy(input: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const image = new Image();
        image.onload = () => {
          const ratio = Math.min(MAX_IMAGE_SIZE / image.width, MAX_IMAGE_SIZE / image.height, 1);
          const width = Math.round(image.width * ratio);
          const height = Math.round(image.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error('Failed to encode image')),
            `image/${IMAGE_FORMAT}`,
            IMAGE_QUALITY,
          );
        };
        image.onerror = () => reject(new Error('Failed to load image'));
        image.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(input);
    });
  }

  private async blobToBase64Payload(blob: Blob): Promise<string> {
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

  private normalizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }

  private getImageDir(entityId: string, collection = DEFAULT_COLLECTION): string {
    return `media/images/${this.normalizeSegment(collection)}/${this.normalizeSegment(entityId)}`;
  }

  private getImagePath(entityId: string, index: number, collection = DEFAULT_COLLECTION): string {
    return `${this.getImageDir(entityId, collection)}/${index}.jpg`;
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true });
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      if (!/\b(already exists?|does already exist)\b/.test(message)) throw error;
    }
  }

  async saveImageBlob(
    entityId: string,
    blob: Blob,
    options: { collection?: string; maxImages?: number } = {},
  ): Promise<number> {
    const collection = options.collection || DEFAULT_COLLECTION;
    const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
    const existingImages = await this.getImageCount(entityId, collection);
    if (existingImages >= maxImages) {
      throw new ImageLimitError(maxImages);
    }

    const index = existingImages;
    await this.saveImageAtIndex(entityId, blob, index, collection);
    return index;
  }

  async saveImagesBlobs(
    entityId: string,
    blobs: Blob[],
    options: { collection?: string; maxImages?: number } = {},
  ): Promise<void> {
    if (!blobs.length) return;
    const collection = options.collection || DEFAULT_COLLECTION;
    const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
    const existingImages = await this.getImageCount(entityId, collection);
    if (existingImages + blobs.length > maxImages) {
      throw new ImageLimitError(maxImages);
    }

    const dir = this.getImageDir(entityId, collection);
    await this.ensureDirectory(dir);
    await Promise.all(
      blobs.map((blob, index) => this.saveImageAtIndex(entityId, blob, existingImages + index, collection)),
    );
  }

  async saveImageAtIndex(entityId: string, blob: Blob, index: number, collection = DEFAULT_COLLECTION): Promise<void> {
    const dir = this.getImageDir(entityId, collection);
    await this.ensureDirectory(dir);
    await Filesystem.writeFile({
      path: this.getImagePath(entityId, index, collection),
      data: await this.blobToBase64Payload(blob),
      directory: Directory.Data,
      recursive: true,
    });
  }

  async getImages(entityId: string, collection = DEFAULT_COLLECTION): Promise<string[]> {
    const count = await this.getImageCount(entityId, collection);
    const images: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const image = await this.getImage(entityId, index, collection);
      if (image) images.push(image);
    }

    return images;
  }

  async getImage(entityId: string, index: number, collection = DEFAULT_COLLECTION): Promise<string | null> {
    try {
      const result = await Filesystem.readFile({
        path: this.getImagePath(entityId, index, collection),
        directory: Directory.Data,
      });
      return `data:image/jpeg;base64,${result.data}`;
    } catch {
      return null;
    }
  }

  async getImageCount(entityId: string, collection = DEFAULT_COLLECTION): Promise<number> {
    try {
      const result = await Filesystem.readdir({
        path: this.getImageDir(entityId, collection),
        directory: Directory.Data,
      });
      return result.files.filter((file) => file.name.endsWith('.jpg')).length;
    } catch {
      return 0;
    }
  }

  async deleteImage(entityId: string, index: number, collection = DEFAULT_COLLECTION): Promise<void> {
    await Filesystem.deleteFile({
      path: this.getImagePath(entityId, index, collection),
      directory: Directory.Data,
    });
    await this.compactImageIndices(entityId, collection);
  }

  async deleteAllImages(entityId: string, collection = DEFAULT_COLLECTION): Promise<void> {
    try {
      await Filesystem.rmdir({
        path: this.getImageDir(entityId, collection),
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // O diretório pode não existir.
    }
  }

  private async compactImageIndices(entityId: string, collection: string): Promise<void> {
    const dir = this.getImageDir(entityId, collection);
    let entries: { name: string }[] = [];
    try {
      const result = await Filesystem.readdir({ path: dir, directory: Directory.Data });
      entries = result.files as any[];
    } catch {
      return;
    }

    const indices = entries
      .filter((file) => file.name.endsWith('.jpg'))
      .map((file) => Number(file.name.replace('.jpg', '')))
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b);

    for (let target = 0; target < indices.length; target += 1) {
      const source = indices[target];
      if (source === target) continue;
      const sourcePath = this.getImagePath(entityId, source, collection);
      const targetPath = this.getImagePath(entityId, target, collection);
      const data = await Filesystem.readFile({ path: sourcePath, directory: Directory.Data });
      await Filesystem.writeFile({ path: targetPath, data: data.data as string, directory: Directory.Data });
      await Filesystem.deleteFile({ path: sourcePath, directory: Directory.Data });
    }
  }
}

export const imageService = new ImageService();
