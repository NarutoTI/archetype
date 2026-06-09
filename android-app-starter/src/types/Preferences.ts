export interface Preferences {
  maxGalleryImages: number;
  maxAttachmentFiles: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  maxGalleryImages: 12,
  maxAttachmentFiles: 10,
};

export const normalizePreferences = (preferences: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...preferences,
});
