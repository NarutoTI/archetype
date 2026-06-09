import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { User } from '@/types/User';
import { useSettingsStore } from '@/stores/settingsStore';

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null);
  const isAuthenticated = computed(() => !!currentUser.value);

  const maxGalleryImages = computed(() => {
    return useSettingsStore().preferences.maxGalleryImages;
  });

  const setCurrentUser = (user: User | null) => {
    currentUser.value = user;
  };

  const reset = () => {
    currentUser.value = null;
  };

  return {
    currentUser,
    isAuthenticated,
    maxGalleryImages,
    setCurrentUser,
    reset,
  };
});
