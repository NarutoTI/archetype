import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/filesystem', () => ({
  Directory: {
    Data: 'DATA',
    Cache: 'CACHE',
  },
  Filesystem: {
    deleteFile: vi.fn(async () => {}),
    rmdir: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async () => {}),
    readFile: vi.fn(async () => ({ data: 'ZmFrZQ==' })),
    getUri: vi.fn(async () => ({ uri: 'file://cache/file.txt' })),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(async () => {}),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileValidationError, fileService } from '@/services/file.service';
import type { AttachmentDraft } from '@/types/Attachment';

describe('fileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects files beyond the configured count limit', () => {
    const file = new File(['demo'], 'demo.txt', { type: 'text/plain' });

    expect(() => fileService.validateFiles([file], 1, 1)).toThrow(FileValidationError);
  });

  it('rejects blocked file extensions', () => {
    const file = new File(['demo'], 'demo.exe', { type: 'application/octet-stream' });

    expect(() => fileService.validateFiles([file], 0, 2)).toThrow(FileValidationError);
  });

  it('strips dataUrl when converting drafts to metadata', () => {
    const draft: AttachmentDraft = {
      id: 'abc',
      name: 'demo.txt',
      storedName: 'file_abc_demo.txt',
      mimeType: 'text/plain',
      size: 4,
      createdAt: '2026-06-09T12:00',
      dataUrl: 'data:text/plain;base64,ZGVtbw==',
    };

    expect(fileService.toMetadata([draft])).toEqual([
      {
        id: 'abc',
        name: 'demo.txt',
        storedName: 'file_abc_demo.txt',
        mimeType: 'text/plain',
        size: 4,
        createdAt: '2026-06-09T12:00',
      },
    ]);
  });

  it('deletes a stored attachment by collection and item id', async () => {
    await fileService.deleteFile('item 1', {
      id: 'abc',
      name: 'demo.txt',
      storedName: 'file_abc_demo.txt',
      mimeType: 'text/plain',
      size: 4,
      createdAt: '2026-06-09T12:00',
    }, 'starter demo');

    expect(Filesystem.deleteFile).toHaveBeenCalledWith({
      path: 'media/files/starter-demo/item-1/file_abc_demo.txt',
      directory: Directory.Data,
    });
  });
});
