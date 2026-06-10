import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '@/stores/userStore';

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    preferences: {
      maxGalleryImages: 8,
      maxAttachmentFiles: 5,
    },
  })),
}));

describe('userStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('tracks authentication from currentUser', () => {
    const store = useUserStore();

    expect(store.isAuthenticated).toBe(false);

    store.setCurrentUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });

    expect(store.isAuthenticated).toBe(true);
    expect(store.currentUser?.id).toBe('user-1');
  });

  it('exposes media limits from settings preferences', () => {
    const store = useUserStore();

    expect(store.maxGalleryImages).toBe(8);
    expect(store.maxAttachmentFiles).toBe(5);
  });

  it('reset() clears the current user', () => {
    const store = useUserStore();
    store.setCurrentUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });

    store.reset();

    expect(store.currentUser).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });
});
