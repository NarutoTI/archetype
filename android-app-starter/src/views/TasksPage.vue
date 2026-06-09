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
      <p v-if="taskStore.tasks.length === 0" class="empty-copy">
        {{ $t('tasks.empty') }}
      </p>

      <ion-list v-else inset>
        <template v-if="taskStore.pendingTasks.length">
          <ion-item-divider>
            <ion-label>
              {{ $t('tasks.pending') }}
              <span class="count">({{ $t('tasks.upcoming', { count: taskStore.upcomingCount }) }})</span>
            </ion-label>
          </ion-item-divider>
          <ion-item v-for="task in taskStore.pendingTasks" :key="task.id">
            <ion-checkbox
              slot="start"
              :checked="task.completed"
              @ionChange="taskStore.toggleTaskCompleted(task.id)"
            />
            <ion-label>
              <h2>{{ task.title }}</h2>
              <p>{{ formatISODateToLocalString(task.dueDate) }}</p>
            </ion-label>
          </ion-item>
        </template>

        <template v-if="taskStore.completedTasks.length">
          <ion-item-divider>
            <ion-label>{{ $t('tasks.completed') }}</ion-label>
          </ion-item-divider>
          <ion-item v-for="task in taskStore.completedTasks" :key="task.id" class="task-done">
            <ion-checkbox
              slot="start"
              :checked="task.completed"
              @ionChange="taskStore.toggleTaskCompleted(task.id)"
            />
            <ion-label>
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
        </template>
      </ion-list>
    </ion-content>

    <ion-modal :is-open="isAddModalOpen" @didDismiss="closeAddModal">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ $t('tasks.new') }}</ion-title>
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
            <ion-input
              v-model="draftDueDate"
              type="date"
              :label="$t('tasks.dueDate')"
              label-placement="stacked"
            />
          </ion-item>
        </ion-list>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="secondary">
            <ion-button @click="closeAddModal">{{ $t('common.cancel') }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="primary">
            <ion-button class="modal-primary-action" :disabled="!draftTitle.trim()" @click="confirmAdd">
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
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { addOutline, trashOutline } from 'ionicons/icons';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { alertService } from '@/services/alert.service';
import { useTaskStore } from '@/stores/taskStore';
import { dateToISOString, formatISODateToLocalString } from '@/utils/date.utils';

const taskStore = useTaskStore();
const { t } = useI18n();
const isAddModalOpen = ref(false);
const draftTitle = ref('');
const draftDueDate = ref(dateToISOString(new Date()));

onMounted(() => {
  void taskStore.initialize();
});

const openAddModal = () => {
  draftTitle.value = '';
  draftDueDate.value = dateToISOString(new Date());
  isAddModalOpen.value = true;
};

const closeAddModal = () => {
  isAddModalOpen.value = false;
};

const confirmAdd = async () => {
  await taskStore.addTask(draftTitle.value, draftDueDate.value);
  closeAddModal();
};

const confirmRemoveTask = async (id: string) => {
  await alertService.presentAlertConfirmDanger(
    t('tasks.deleteTitle'),
    t('tasks.deleteMessage'),
    t('common.delete'),
    t('common.cancel'),
    () => taskStore.removeTask(id),
  );
};
</script>

<style scoped>
.empty-copy {
  text-align: center;
  color: var(--ion-color-medium);
  margin-top: 2rem;
}

.count {
  color: var(--ion-color-medium);
  font-weight: 400;
}

.task-done ion-label h2 {
  text-decoration: line-through;
  color: var(--ion-color-medium);
}
</style>
