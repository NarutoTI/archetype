<template>
  <div class="image-gallery">
    <div v-if="images.length < maxImages" class="upload-area">
      <div v-if="isNativePlatform" class="button-group">
        <ion-button expand="block" fill="outline" :disabled="isProcessing || disabled" @click="takePicture">
          <ion-icon :icon="cameraOutline" slot="start" />
          {{ $t('media.takePhoto') }}
        </ion-button>
        <ion-button expand="block" fill="outline" :disabled="isProcessing || disabled" @click="chooseFromGallery">
          <ion-icon :icon="imagesOutline" slot="start" />
          {{ $t('media.choosePhotos') }}
        </ion-button>
      </div>

      <ion-button v-else expand="block" fill="outline" :disabled="isProcessing || disabled" @click="openFilePicker">
        <ion-icon :icon="addOutline" slot="start" />
        {{ $t('media.addImage') }}
      </ion-button>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="file-input"
        @change="onFileSelect"
      />
    </div>

    <div v-if="images.length > 0" class="image-grid">
      <!-- Images are positional (stored as <index>.jpg), so the index is their identity. -->
      <div v-for="(image, index) in images" :key="index" class="image-item">
        <img :src="image" :alt="`Image ${index + 1}`" class="image-preview" @click="emit('click-image', index)" />
        <ion-button
          class="delete-button"
          size="small"
          color="danger"
          fill="solid"
          :disabled="isProcessing || disabled"
          @click="emit('delete-image', index)"
        >
          <ion-icon :icon="trashOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div v-if="isProcessing" class="processing-indicator">
      <ion-spinner name="crescent" />
      <p>{{ $t('media.processingImage') }}</p>
    </div>

    <ion-note v-if="images.length > 0" class="image-info">
      {{ $t('media.imageInfo', { count: images.length, max: maxImages }) }}
    </ion-note>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, type GalleryPhoto, type GalleryPhotos } from '@capacitor/camera';
import { IonButton, IonIcon, IonNote, IonSpinner } from '@ionic/vue';
import { addOutline, cameraOutline, imagesOutline, trashOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { capacitorService } from '@/services/capacitor.service';
import { toastService } from '@/services/toast.service';
import { fetchUriAsBlob, resolveMediaUri } from '@/utils/mediaUri.utils';
import { logger } from '@/utils/logger';

const MAX_WEB_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const props = withDefaults(defineProps<{
  images: string[];
  maxImages?: number;
  disabled?: boolean;
}>(), {
  maxImages: 12,
  disabled: false,
});

const emit = defineEmits<{
  'add-images': [blobs: Blob[]];
  'delete-image': [index: number];
  'click-image': [index: number];
  'processing-images': [isProcessing: boolean];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const isProcessing = ref(false);
const isNativePlatform = computed(() => Capacitor.isNativePlatform());
const remainingImageSlots = computed(() => Math.max(props.maxImages - props.images.length, 0));

// Capacitor Camera rejects when the user dismisses the native picker; that is
// not an error worth surfacing.
const isUserCancellation = (error: unknown): boolean =>
  String((error as Error)?.message || '').toLowerCase().includes('cancel');

const handleCameraError = async (error: unknown) => {
  if (isUserCancellation(error)) return;
  logger.error('ImageGallery: camera/gallery picker failed', error);
  await toastService.presentToastError(t('media.imageAddError'));
};

const openFilePicker = () => {
  if (!props.disabled) fileInput.value?.click();
};

const setProcessing = (value: boolean) => {
  isProcessing.value = value;
  emit('processing-images', value);
};

const readPhotoBlob = async (webPath?: string, path?: string): Promise<Blob | null> => {
  const uri = resolveMediaUri(webPath, path);
  return uri ? fetchUriAsBlob(uri) : null;
};

const takePicture = async () => {
  if (props.disabled) return;
  setProcessing(true);
  try {
    const hasPermission = await capacitorService.verifyAndRequestCameraPermissions();
    if (!hasPermission) return;

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      width: 1024,
      height: 1024,
    });
    const blob = await readPhotoBlob(photo.webPath, photo.path);
    if (blob) emit('add-images', [blob]);
  } catch (error) {
    await handleCameraError(error);
  } finally {
    setProcessing(false);
  }
};

const chooseFromGallery = async () => {
  if (props.disabled) return;
  setProcessing(true);
  try {
    const photos: GalleryPhotos = await Camera.pickImages({
      quality: 90,
      limit: remainingImageSlots.value,
      width: 1024,
      height: 1024,
    });
    const blobs = await Promise.all(
      photos.photos.map((photo: GalleryPhoto) => readPhotoBlob(photo.webPath, photo.path)),
    );
    const validBlobs = blobs.filter((blob): blob is Blob => !!blob);
    if (validBlobs.length) emit('add-images', validBlobs);
  } catch (error) {
    await handleCameraError(error);
  } finally {
    setProcessing(false);
  }
};

const onFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';

  const imageFiles = files.filter(
    (file) => file.type.startsWith('image/') && file.size <= MAX_WEB_IMAGE_SIZE_BYTES,
  );
  const images = imageFiles.slice(0, remainingImageSlots.value);

  // Tell the user when something was silently dropped by the filters above.
  if (imageFiles.length < files.length) {
    await toastService.presentToastWarning(t('media.someFilesSkipped'));
  } else if (images.length < imageFiles.length) {
    await toastService.presentToastWarning(t('media.imageLimitReached', { max: props.maxImages }));
  }

  if (images.length) emit('add-images', images);
};
</script>

<style scoped>
.image-gallery {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.file-input {
  display: none;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
}

.image-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.delete-button {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 32px;
  height: 32px;
  --padding-start: 8px;
  --padding-end: 8px;
}

.processing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ion-color-medium);
}

.processing-indicator p {
  margin: 0;
}

.image-info {
  color: var(--ion-color-medium);
}
</style>
