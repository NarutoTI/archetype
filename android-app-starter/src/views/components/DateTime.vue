<template>
  <ion-datetime-button :datetime="ids.date" :disabled="disabled" />

  <ion-modal :keep-contents-mounted="true" ref="dateTimeModal">
    <ion-datetime
      :id="ids.date"
      :presentation="presentation"
      :max="maxDate"
      :min="minDate"
      hour-cycle="h23"
      v-model="mDateTime"
      ref="dateDateTimeRef"
      :disabled="disabled"
      :show-default-buttons="showTimeButtons"
    >
      <ion-buttons slot="buttons" v-if="showTimeButtons">
        <ion-button color="secondary" @click="onComponentDateCancel">
          {{ $t('common.cancel') }}
        </ion-button>
        <ion-button class="modal-primary-action" @click="onComponentDateConfirm">
          {{ $t('common.save') }}
        </ion-button>
      </ion-buttons>
    </ion-datetime>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonButton, IonButtons, IonDatetime, IonDatetimeButton, IonModal } from '@ionic/vue';
import { dateToISOString, dateToISOStringWithTime } from '@/utils/date.utils';

const props = withDefaults(defineProps<{
  presentation?: 'date' | 'time' | 'date-time';
  // optional: prefix for predictable IDs
  idPrefix?: string;
  showTimeButtons?: boolean;
  max?: string;
  min?: string;
  disabled?: boolean;
}>(), {
  presentation: 'date-time',
  showTimeButtons: false,
  disabled: false,
});

// v-models, default is mDateTime
const mDateTime = defineModel<string>(); // 'YYYY-MM-DDTHH:mm:ss'
const mTime = defineModel<string>('time'); // 'HH:mm:ss'
const mDate = defineModel<string>('date'); // 'YYYY-MM-DD'
const maxDate = computed(() => props.max ?? '2099-12-31');
const minDate = computed(() => props.min ?? '1900-01-01');

// unique IDs per instance (prevents collision if the component is used multiple times)
const rand = Math.random().toString(36).slice(2, 8);
const ids = {
  date: (props.idPrefix ?? 'DateTime') + '-date-' + rand,
};

const dateTimeModal = ref<any>();
const dateDateTimeRef = ref<any>();

const combine = (d?: string, t?: string) =>
  (d && t ? `${d}T${t}` :
    d ? `${d}T00:00` :
      t ? `${dateToISOString(new Date())}T${t}` :
        dateToISOStringWithTime(new Date()));

// --- INITIAL SYNC ---
// priority: if parent passed dateTime, derive date/time; otherwise, compose from date/time
if (mDateTime.value) {
  const [d, t] = mDateTime.value.split('T');
  if (d && d !== mDate.value) mDate.value = d;
  if (t && t !== mTime.value) mTime.value = t;
} else {
  const next = combine(mDate.value, mTime.value);
  if (next !== mDateTime.value) mDateTime.value = next;
}

// --- SYNC: DT -> (date,time)
watch(mDateTime, (nv) => {
  if (!nv) return;
  const [d, t] = nv.split('T');
  if (d && d !== mDate.value) mDate.value = d;
  if (t && t !== mTime.value) mTime.value = t;
});

// --- SYNC: (date,time) -> DT
watch([mDate, mTime], () => {
  const next = combine(mDate.value, mTime.value);
  if (next !== mDateTime.value) mDateTime.value = next;
});

// Handle date time cancel
const onComponentDateCancel = () => {
  dateTimeModal.value?.$el?.dismiss?.();
};

// Handle date time confirm
const onComponentDateConfirm = () => {
  dateDateTimeRef.value?.$el?.confirm?.();
  dateTimeModal.value?.$el?.dismiss?.();
};
</script>
