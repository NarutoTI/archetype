<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('media.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ImageGallery
        :images="images"
        :max-images="userStore.maxGalleryImages"
        :disabled="isProcessing"
        @add-images="addImages"
        @delete-image="deleteImage"
        @processing-images="isProcessing = $event"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ImageGallery from '@/views/components/ImageGallery.vue';
import { imageService } from '@/services/image.service';
import { shareIntakeService } from '@/services/share-intake.service';
import { toastService } from '@/services/toast.service';
import { useUserStore } from '@/stores/userStore';

const MEDIA_COLLECTION = 'starter-demo';
const MEDIA_ENTITY_ID = 'gallery';

const { t } = useI18n();
const userStore = useUserStore();
const images = ref<string[]>([]);
const isProcessing = ref(false);

const loadImages = async () => {
  images.value = await imageService.getImages(MEDIA_ENTITY_ID, MEDIA_COLLECTION);
};

const addImages = async (blobs: Blob[]) => {
  isProcessing.value = true;
  try {
    const resized = await Promise.all(blobs.map((blob) => imageService.resizeImage(blob)));
    await imageService.saveImagesBlobs(MEDIA_ENTITY_ID, resized, {
      collection: MEDIA_COLLECTION,
      maxImages: userStore.maxGalleryImages,
    });
    await loadImages();
  } finally {
    isProcessing.value = false;
  }
};

const deleteImage = async (index: number) => {
  await imageService.deleteImage(MEDIA_ENTITY_ID, index, MEDIA_COLLECTION);
  await loadImages();
};

const claimShareIfPending = async () => {
  const pending = await shareIntakeService.claimPending();
  if (!pending?.images?.length) return;

  await addImages(pending.images);
  await shareIntakeService.ackConsumed();
  await toastService.presentToastSuccess(t('media.sharedImagesImported', { count: pending.images.length }));
};

onMounted(async () => {
  await loadImages();
  await claimShareIfPending();
});
</script>
