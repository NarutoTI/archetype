<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('tasks.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openAddModal">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <ion-list v-if="showSkeleton" inset>
        <ion-item v-for="index in 3" :key="index">
          <ion-skeleton-text slot="start" :animated="true" class="skeleton-checkbox" />
          <ion-label>
            <h2><ion-skeleton-text :animated="true" style="width: 60%" /></h2>
            <p><ion-skeleton-text :animated="true" style="width: 30%" /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <EmptyState
        v-else-if="taskStore.tasks.length === 0"
        :icon="checkmarkDoneCircleOutline"
        :title="$t('tasks.empty')"
        :subtitle="$t('tasks.emptyHint')"
      />

      <ion-list v-else inset>
        <template v-if="taskStore.pendingTasks.length">
          <ion-item-divider>
            <ion-label>
              {{ $t('tasks.pending') }}
              <span class="count">({{ $t('tasks.upcoming', { count: taskStore.upcomingCount }) }})</span>
            </ion-label>
          </ion-item-divider>
          <ion-item-sliding v-for="task in taskStore.pendingTasks" :key="task.id">
            <ion-item>
              <ion-checkbox
                slot="start"
                :checked="task.completed"
                @ionChange="toggleTask(task.id)"
              />
              <ion-label @click="openEditModal(task)">
                <h2>{{ task.title }}</h2>
                <p>{{ formatISODateToLocalString(task.dueDate) }}</p>
              </ion-label>
              <ion-button
                slot="end"
                fill="clear"
                color="danger"
                :aria-label="$t('tasks.remove')"
                @click="confirmRemoveTask(task.id)"
              >
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
            <ion-item-options side="end">
              <ion-item-option color="primary" @click="openEditModal(task, $event)">
                <ion-icon slot="start" :icon="createOutline" />
                {{ $t('common.edit') }}
              </ion-item-option>
              <ion-item-option color="danger" @click="confirmRemoveTask(task.id, $event)">
                <ion-icon slot="start" :icon="trashOutline" />
                {{ $t('common.delete') }}
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        </template>

        <template v-if="taskStore.completedTasks.length">
          <ion-item-divider>
            <ion-label>{{ $t('tasks.completed') }}</ion-label>
          </ion-item-divider>
          <ion-item-sliding v-for="task in taskStore.completedTasks" :key="task.id">
            <ion-item class="task-done">
              <ion-checkbox
                slot="start"
                :checked="task.completed"
                @ionChange="toggleTask(task.id)"
              />
              <ion-label @click="openEditModal(task)">
                <h2>{{ task.title }}</h2>
                <p>{{ formatISODateToLocalString(task.dueDate) }}</p>
              </ion-label>
              <ion-button
                slot="end"
                fill="clear"
                color="danger"
                :aria-label="$t('tasks.remove')"
                @click="confirmRemoveTask(task.id)"
              >
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
            <ion-item-options side="end">
              <ion-item-option color="primary" @click="openEditModal(task, $event)">
                <ion-icon slot="start" :icon="createOutline" />
                {{ $t('common.edit') }}
              </ion-item-option>
              <ion-item-option color="danger" @click="confirmRemoveTask(task.id, $event)">
                <ion-icon slot="start" :icon="trashOutline" />
                {{ $t('common.delete') }}
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        </template>
      </ion-list>
    </ion-content>

    <ion-modal :is-open="isTaskModalOpen" @didDismiss="closeTaskModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ editingTaskId ? $t('tasks.edit') : $t('tasks.new') }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-list>
          <ion-item>
            <ion-input
              v-model="draftTitle"
              :label="$t('tasks.taskTitle')"
              label-placement="stacked"
              :placeholder="$t('tasks.taskPlaceholder')"
            />
          </ion-item>
          <ion-item>
            <ion-label>{{ $t('tasks.dueDate') }}</ion-label>
            <DateTime presentation="date" id-prefix="task-due" v-model:date="draftDueDate" />
          </ion-item>
        </ion-list>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="secondary">
            <ion-button @click="closeTaskModal">{{ $t('common.cancel') }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="primary">
            <ion-button
              class="modal-primary-action"
              :disabled="!draftTitle.trim() || isSaving"
              @click="confirmSave"
            >
              {{ $t('common.save') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  type RefresherCustomEvent,
} from '@ionic/vue';
import { addOutline, checkmarkDoneCircleOutline, createOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DateTime from '@/views/components/DateTime.vue';
import EmptyState from '@/views/components/EmptyState.vue';
import { alertService } from '@/services/alert.service';
import { ErrorTranslationService } from '@/services/errorTranslation.service';
import { toastService } from '@/services/toast.service';
import { useTaskStore } from '@/stores/taskStore';
import type { Task } from '@/types/Task';
import { dateToISOString, formatISODateToLocalString } from '@/utils/date.utils';
import { logger } from '@/utils/logger';

const taskStore = useTaskStore();
const { t } = useI18n();
const isTaskModalOpen = ref(false);
const isSaving = ref(false);
const editingTaskId = ref<string | null>(null);
const draftTitle = ref('');
const draftDueDate = ref(dateToISOString(new Date()));

const showSkeleton = computed(() => taskStore.isLoading && taskStore.tasks.length === 0);

onMounted(() => {
  void taskStore.initialize().catch((error) => showApiError(error));
});

const showApiError = (error: unknown) => {
  logger.error('TasksPage action failed', error);
  void toastService.presentToastError(ErrorTranslationService.translateError(error));
};

// Closes the surrounding ion-item-sliding after an option is tapped.
const closeSliding = (event?: Event) => {
  (event?.target as HTMLElement | null)?.closest('ion-item-sliding')?.close();
};

const refresh = async (event: RefresherCustomEvent) => {
  try {
    await taskStore.loadAllFromServer();
  } catch (error) {
    showApiError(error);
  } finally {
    await event.target.complete();
  }
};

const openAddModal = () => {
  editingTaskId.value = null;
  draftTitle.value = '';
  draftDueDate.value = dateToISOString(new Date());
  isTaskModalOpen.value = true;
};

const openEditModal = (task: Task, event?: Event) => {
  closeSliding(event);
  editingTaskId.value = task.id;
  draftTitle.value = task.title;
  draftDueDate.value = task.dueDate;
  isTaskModalOpen.value = true;
};

const closeTaskModal = () => {
  isTaskModalOpen.value = false;
};

const confirmSave = async () => {
  isSaving.value = true;
  try {
    if (editingTaskId.value) {
      await taskStore.updateTask(editingTaskId.value, {
        title: draftTitle.value,
        dueDate: draftDueDate.value,
      });
    } else {
      await taskStore.addTask(draftTitle.value, draftDueDate.value);
    }
    closeTaskModal();
  } catch (error) {
    // Keep the modal open so the user can retry without losing the draft.
    showApiError(error);
  } finally {
    isSaving.value = false;
  }
};

const toggleTask = async (id: string) => {
  try {
    await taskStore.toggleTaskCompleted(id);
  } catch (error) {
    showApiError(error);
  }
};

const confirmRemoveTask = async (id: string, event?: Event) => {
  closeSliding(event);
  await alertService.presentAlertConfirmDanger(
    t('tasks.deleteTitle'),
    t('tasks.deleteMessage'),
    t('common.delete'),
    t('common.cancel'),
    async () => {
      try {
        await taskStore.removeTask(id);
      } catch (error) {
        showApiError(error);
      }
    },
  );
};
</script>

<style scoped>
.count {
  color: var(--ion-color-medium);
  font-weight: 400;
}

.task-done ion-label h2 {
  text-decoration: line-through;
  color: var(--ion-color-medium);
}

.skeleton-checkbox {
  width: 22px;
  height: 22px;
  border-radius: 4px;
}
</style>
