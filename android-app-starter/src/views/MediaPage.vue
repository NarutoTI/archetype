<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('media.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <section class="media-section">
        <h2>{{ $t('media.images') }}</h2>
        <ImageGallery
          :images="images"
          :max-images="userStore.maxGalleryImages"
          :disabled="isProcessing"
          @add-images="addImages"
          @delete-image="deleteImage"
          @click-image="openLightbox"
          @processing-images="isProcessing = $event"
        />
      </section>

      <section class="media-section">
        <div class="section-heading">
          <h2>{{ $t('media.files') }}</h2>
          <ion-note>{{ $t('media.fileInfo', { count: attachments.length, max: userStore.maxAttachmentFiles }) }}</ion-note>
        </div>

        <ion-button expand="block" fill="outline" :disabled="isFileProcessing" @click="openFilePicker">
          <ion-icon :icon="attachOutline" slot="start" />
          {{ $t('media.addFile') }}
        </ion-button>

        <input ref="fileInput" class="file-input" type="file" multiple @change="onFileSelect" />

        <p v-if="attachments.length === 0" class="empty-copy">
          {{ $t('media.noFiles') }}
        </p>

        <ion-list v-else inset>
          <ion-item v-for="attachment in attachments" :key="attachment.storedName">
            <ion-icon slot="start" :icon="documentAttachOutline" />
            <ion-label>
              <h2>{{ attachment.name }}</h2>
              <p>{{ formatFileSize(attachment.size) }}</p>
            </ion-label>
            <ion-button
              slot="end"
              fill="clear"
              :aria-label="$t('media.openFile')"
              @click="openAttachment(attachment)"
            >
              <ion-icon :icon="openOutline" slot="icon-only" />
            </ion-button>
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              :aria-label="$t('media.removeFile')"
              @click="removeAttachment(attachment)"
            >
              <ion-icon :icon="trashOutline" slot="icon-only" />
            </ion-button>
          </ion-item>
        </ion-list>
      </section>

      <ImageLightbox
        :is-open="isLightboxOpen"
        :images="images"
        :initial-index="selectedImageIndex"
        file-prefix="starter_gallery"
        @close="isLightboxOpen = false"
        @index-change="selectedImageIndex = $event"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { Preferences } from '@capacitor/preferences';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { attachOutline, documentAttachOutline, openOutline, trashOutline } from 'ionicons/icons';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ImageGallery from '@/views/components/ImageGallery.vue';
import ImageLightbox from '@/views/components/ImageLightbox.vue';
import { FileValidationError, fileService } from '@/services/file.service';
import { imageService } from '@/services/image.service';
import { shareIntakeService } from '@/services/share-intake.service';
import { toastService } from '@/services/toast.service';
import { useUserStore } from '@/stores/userStore';
import type { Attachment, AttachmentDraft } from '@/types/Attachment';

const MEDIA_COLLECTION = 'starter-demo';
const MEDIA_ENTITY_ID = 'gallery';
const FILE_ENTITY_ID = 'attachments';
const FILE_METADATA_KEY = 'starter-demo-attachments';

const { t } = useI18n();
const userStore = useUserStore();
const images = ref<string[]>([]);
const attachments = ref<AttachmentDraft[]>([]);
const isProcessing = ref(false);
const isFileProcessing = ref(false);
const isLightboxOpen = ref(false);
const selectedImageIndex = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);

const loadImages = async () => {
  images.value = await imageService.getImages(MEDIA_ENTITY_ID, MEDIA_COLLECTION);
};

const loadAttachments = async () => {
  const { value } = await Preferences.get({ key: FILE_METADATA_KEY });
  if (!value) {
    attachments.value = [];
    return;
  }

  try {
    const parsed = JSON.parse(value);
    attachments.value = Array.isArray(parsed)
      ? parsed.map((attachment: Attachment) => ({ ...attachment }))
      : [];
  } catch {
    attachments.value = [];
    await Preferences.remove({ key: FILE_METADATA_KEY });
  }
};

const persistAttachmentMetadata = async () => {
  await Preferences.set({
    key: FILE_METADATA_KEY,
    value: JSON.stringify(fileService.toMetadata(attachments.value)),
  });
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

const openLightbox = (index: number) => {
  selectedImageIndex.value = index;
  isLightboxOpen.value = true;
};

const deleteImage = async (index: number) => {
  await imageService.deleteImage(MEDIA_ENTITY_ID, index, MEDIA_COLLECTION);
  await loadImages();
};

const openFilePicker = () => {
  fileInput.value?.click();
};

const getFileErrorMessage = (error: unknown) => {
  if (!(error instanceof FileValidationError)) {
    return t('media.fileAddError');
  }

  const keyByCode: Record<string, string> = {
    FILE_LIMIT_REACHED: 'media.fileLimitReached',
    FILE_SIZE_LIMIT_EXCEEDED: 'media.fileTooLarge',
    FILE_TYPE_BLOCKED: 'media.fileTypeBlocked',
  };

  return t(keyByCode[error.code] || 'media.fileAddError');
};

const addFiles = async (files: File[]) => {
  if (!files.length) return;

  isFileProcessing.value = true;
  try {
    fileService.validateFiles(files, attachments.value.length, userStore.maxAttachmentFiles);
    const drafts = await fileService.createDrafts(files);
    await fileService.saveFiles(FILE_ENTITY_ID, drafts, MEDIA_COLLECTION);
    attachments.value = [...attachments.value, ...fileService.normalizeDrafts(drafts)];
    await persistAttachmentMetadata();
    await toastService.presentToastSuccess(t('media.fileAdded', { count: drafts.length }));
  } catch (error) {
    await toastService.presentToastError(getFileErrorMessage(error));
  } finally {
    isFileProcessing.value = false;
  }
};

const onFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  await addFiles(files);
};

const openAttachment = async (attachment: AttachmentDraft) => {
  try {
    const dataUrl = attachment.dataUrl || await fileService.getFileDataUrl(FILE_ENTITY_ID, attachment, MEDIA_COLLECTION);
    if (!dataUrl) {
      await toastService.presentToastError(t('media.fileOpenError'));
      return;
    }

    await fileService.openFile({ ...attachment, dataUrl });
  } catch {
    await toastService.presentToastError(t('media.fileOpenError'));
  }
};

const removeAttachment = async (attachment: AttachmentDraft) => {
  await fileService.deleteFile(FILE_ENTITY_ID, attachment, MEDIA_COLLECTION).catch(() => {});
  attachments.value = attachments.value.filter((item) => item.storedName !== attachment.storedName);
  await persistAttachmentMetadata();
  await toastService.presentToastSuccess(t('media.fileRemoved'));
};

const formatFileSize = (bytes: number) => {
  const safeBytes = Number.isFinite(bytes) ? bytes : 0;
  const formatter = new Intl.NumberFormat(t('common.locale'), { maximumFractionDigits: 1 });
  if (safeBytes < 1024) return `${safeBytes} B`;
  if (safeBytes < 1024 * 1024) return `${formatter.format(safeBytes / 1024)} KB`;
  return `${formatter.format(safeBytes / (1024 * 1024))} MB`;
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
  await loadAttachments();
  await claimShareIfPending();
});
</script>

<style scoped>
.media-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.media-section h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.file-input {
  display: none;
}

.empty-copy {
  color: var(--ion-color-medium);
  text-align: center;
  margin: 12px 0;
}
</style>
