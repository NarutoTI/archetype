<template>
  <ion-modal
    :is-open="isOpen"
    class="lightbox-modal"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    :can-dismiss="canDismiss"
    @didDismiss="handleClose"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title>
          <div class="image-counter">{{ currentIndex + 1 }} / {{ images.length }}</div>
        </ion-title>
        <ion-buttons slot="primary">
          <ion-button fill="clear" :disabled="!currentImage" @click="downloadImage">
            <ion-icon :icon="downloadOutline" slot="icon-only" />
          </ion-button>
          <ion-button fill="clear" @click="handleClose">
            <ion-icon :icon="closeOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="lightbox-content" @click="handleClose">
      <div
        ref="containerRef"
        class="image-container"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerUp"
      >
        <img
          :src="currentImage"
          :alt="`Image ${currentIndex + 1}`"
          class="lightbox-image"
          :style="imageStyle"
          @click.stop
        />
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar v-if="images.length > 1">
        <ion-buttons slot="start">
          <ion-button fill="clear" :disabled="currentIndex === 0" @click="previousImage">
            <ion-icon :icon="chevronBack" slot="icon-only" />
          </ion-button>
        </ion-buttons>

        <div class="thumbnail-container">
          <!-- Images are positional in the gallery, so the index is their identity. -->
          <button
            v-for="(image, index) in images"
            :key="index"
            type="button"
            class="thumbnail"
            :class="{ active: index === currentIndex }"
            @click="goToImage(index)"
          >
            <img :src="image" :alt="`Thumbnail ${index + 1}`" />
          </button>
        </div>

        <ion-buttons slot="end">
          <ion-button fill="clear" :disabled="currentIndex === images.length - 1" @click="nextImage">
            <ion-icon :icon="chevronForward" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar>
        <ion-buttons slot="primary">
          <ion-button fill="clear" size="small" :disabled="scale <= 1" @click="zoomOut">
            <ion-icon :icon="removeOutline" slot="icon-only" />
          </ion-button>
          <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
          <ion-button fill="clear" size="small" :disabled="scale >= 3" @click="zoomIn">
            <ion-icon :icon="addOutline" slot="icon-only" />
          </ion-button>
          <ion-button fill="clear" size="small" @click="resetZoom">
            <ion-icon :icon="contractOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import {
  addOutline,
  chevronBack,
  chevronForward,
  closeOutline,
  contractOutline,
  downloadOutline,
  removeOutline,
} from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toastService } from '@/services/toast.service';
import { logger } from '@/utils/logger';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  filePrefix?: string;
}>(), {
  initialIndex: 0,
  filePrefix: 'starter_image',
});

const emit = defineEmits<{
  close: [];
  'index-change': [index: number];
}>();

const { t } = useI18n();
const currentIndex = ref(props.initialIndex);
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const containerRef = ref<HTMLDivElement | null>(null);
const isGesturing = ref(false);
const pointers = new Map<number, { x: number; y: number }>();

let touchStartX = 0;
let touchStartY = 0;
let startPanX = 0;
let startPanY = 0;
let startTranslateX = 0;
let startTranslateY = 0;
let startPinchDist = 0;
let startScale = 1;
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const currentImage = computed(() => {
  if (!props.images.length) return '';
  return props.images[currentIndex.value] || props.images[0];
});

const imageStyle = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`,
  transition: isGesturing.value ? 'none' : 'transform 0.25s ease',
}));

const canDismiss = computed(() => scale.value <= 1);

watch(() => props.initialIndex, (nextIndex) => {
  currentIndex.value = nextIndex;
  resetZoom();
});

watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) return;
  currentIndex.value = props.initialIndex;
  resetZoom();
});

const handleClose = () => {
  resetZoom();
  emit('close');
};

const buildDownloadFileName = (extension: string): string => {
  const prefix = props.filePrefix.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'starter_image';
  return `${prefix}_${currentIndex.value + 1}_${Date.now().toString(36)}.${extension}`;
};

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const commaIndex = result.indexOf(',');
    resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
  };
  reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
  reader.readAsDataURL(blob);
});

const downloadImageMobile = async () => {
  let base64Data: string;
  let extension = 'jpg';

  if (currentImage.value.startsWith('data:image/')) {
    const [header, payload] = currentImage.value.split(',');
    base64Data = payload || '';
    extension = header.split(';')[0]?.split('/')[1] || extension;
  } else {
    const response = await fetch(currentImage.value);
    const blob = await response.blob();
    base64Data = await blobToBase64(blob);
    extension = blob.type.split('/')[1] || extension;
  }

  const fileName = buildDownloadFileName(extension);
  await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Documents,
  });
  await toastService.presentToastSuccess(t('media.imageSaved', { fileName }));
};

const downloadImageWeb = async () => {
  const response = await fetch(currentImage.value);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const extension = blob.type.split('/')[1] || 'jpg';
  link.href = url;
  link.download = buildDownloadFileName(extension);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const downloadImage = async () => {
  if (!currentImage.value) return;

  try {
    // window.Capacitor also exists on web builds; only the native platforms
    // should write through the Filesystem plugin.
    if (Capacitor.isNativePlatform()) {
      await downloadImageMobile();
    } else {
      await downloadImageWeb();
      await toastService.presentToastSuccess(t('media.imageDownloaded'));
    }
  } catch (error) {
    logger.error('Image download failed:', error);
    await toastService.presentToastError(t('media.imageDownloadError'));
  }
};

const resetZoom = () => {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
  pointers.clear();
  isGesturing.value = false;
};

const previousImage = () => {
  if (currentIndex.value <= 0) return;
  currentIndex.value -= 1;
  resetZoom();
  emit('index-change', currentIndex.value);
};

const nextImage = () => {
  if (currentIndex.value >= props.images.length - 1) return;
  currentIndex.value += 1;
  resetZoom();
  emit('index-change', currentIndex.value);
};

const goToImage = (index: number) => {
  currentIndex.value = index;
  resetZoom();
  emit('index-change', index);
};

const zoomIn = () => {
  scale.value = Math.min(3, scale.value + 0.25);
};

const zoomOut = () => {
  scale.value = Math.max(1, scale.value - 0.25);
  if (scale.value === 1) {
    translateX.value = 0;
    translateY.value = 0;
  }
};

const getTwoPointers = () => {
  const values = Array.from(pointers.values());
  return [values[0], values[1]] as const;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const center = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const toImageCoords = (viewportX: number, viewportY: number) => {
  const container = containerRef.value;
  if (!container) return { x: viewportX, y: viewportY };

  const rect = container.getBoundingClientRect();
  const image = container.querySelector('img');
  if (!image) return { x: viewportX, y: viewportY };

  const naturalLeft = rect.left + (rect.width - image.offsetWidth) / 2;
  const naturalTop = rect.top + (rect.height - image.offsetHeight) / 2;

  return {
    x: viewportX - naturalLeft,
    y: viewportY - naturalTop,
  };
};

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse') return;

  const element = event.currentTarget as HTMLElement;
  try {
    element.setPointerCapture(event.pointerId);
  } catch (error) {
    logger.error('Error setting pointer capture:', error);
  }

  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  const now = Date.now();
  const deltaTime = now - lastTapAt;
  const deltaX = event.clientX - lastTapX;
  const deltaY = event.clientY - lastTapY;
  const isDoubleTap = deltaTime > 0 && deltaTime < 300 && (deltaX * deltaX + deltaY * deltaY) < 576;

  lastTapAt = now;
  lastTapX = event.clientX;
  lastTapY = event.clientY;

  if (isDoubleTap) {
    if (scale.value === 1) {
      const tap = toImageCoords(event.clientX, event.clientY);
      scale.value = 2;
      translateX.value = tap.x - (tap.x - translateX.value) * 2;
      translateY.value = tap.y - (tap.y - translateY.value) * 2;
    } else {
      resetZoom();
    }
    return;
  }

  if (pointers.size === 1) {
    touchStartX = event.clientX;
    touchStartY = event.clientY;
    startPanX = event.clientX;
    startPanY = event.clientY;
    startTranslateX = translateX.value;
    startTranslateY = translateY.value;
    isGesturing.value = true;
  }

  if (pointers.size === 2) {
    const [first, second] = getTwoPointers();
    startPinchDist = distance(first, second);
    startScale = scale.value;
    isGesturing.value = true;
  }
};

const onPointerMove = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size === 2) {
    const [first, second] = getTwoPointers();
    if (startPinchDist <= 0) return;

    const pinchCenter = center(first, second);
    const nextScale = clamp(startScale * (distance(first, second) / startPinchDist), 1, 3);
    const currentScale = scale.value;
    if (currentScale !== 0 && nextScale !== currentScale) {
      const centerPoint = toImageCoords(pinchCenter.x, pinchCenter.y);
      translateX.value = centerPoint.x - (centerPoint.x - translateX.value) * (nextScale / currentScale);
      translateY.value = centerPoint.y - (centerPoint.y - translateY.value) * (nextScale / currentScale);
    }
    scale.value = nextScale;
    return;
  }

  if (pointers.size === 1 && scale.value > 1) {
    translateX.value = startTranslateX + event.clientX - startPanX;
    translateY.value = startTranslateY + event.clientY - startPanY;
  }
};

const onPointerUp = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);

  const element = event.currentTarget as HTMLElement;
  try {
    element.releasePointerCapture(event.pointerId);
  } catch (error) {
    logger.error('Error releasing pointer capture:', error);
  }

  if (pointers.size === 0) {
    isGesturing.value = false;
    if (scale.value === 1) {
      const deltaX = event.clientX - touchStartX;
      const deltaY = event.clientY - touchStartY;
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) previousImage();
        else nextImage();
      }
    }
  }

  if (pointers.size === 1) {
    const pointer = Array.from(pointers.values())[0];
    startPanX = pointer.x;
    startPanY = pointer.y;
    startTranslateX = translateX.value;
    startTranslateY = translateY.value;
  }
};
</script>

<style scoped>
.lightbox-content {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  --background: transparent;
}

.image-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.lightbox-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: zoom-in;
  user-select: none;
  -webkit-user-select: none;
  will-change: transform;
  transform-origin: 0 0;
}

.thumbnail-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  justify-content: center;
  padding: 4px;
  scrollbar-width: thin;
}

.thumbnail {
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  opacity: 0.6;
  padding: 0;
  background: transparent;
}

.thumbnail.active {
  border-color: var(--ion-color-primary);
  opacity: 1;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  color: var(--ion-color-medium);
}

@media (max-width: 576px) {
  .thumbnail-container {
    max-width: 50%;
  }

  .thumbnail {
    width: 40px;
    height: 40px;
  }
}
</style>
