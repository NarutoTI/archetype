import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { readonly, ref } from 'vue';

export type ReminderDeliveryMode = 'push' | 'local';

const DESIRED_MODE_KEY = 'reminder-delivery-desired';
const EFFECTIVE_MODE_KEY = 'reminder-delivery-effective';
const DEVICE_ID_KEY = 'push-device-id';
const platform = Capacitor.getPlatform();

/** Android is the starter target. Web push can be added later (see My Memories P4). */
const supportsServerPush = platform === 'android';

const desiredMode = ref<ReminderDeliveryMode>(
  platform === 'android' ? 'push' : 'local',
);
const effectiveMode = ref<ReminderDeliveryMode>('local');
let initialization: Promise<void> | null = null;

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function initialize(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    const [desired, effective] = await Promise.all([
      Preferences.get({ key: DESIRED_MODE_KEY }),
      Preferences.get({ key: EFFECTIVE_MODE_KEY }),
    ]);
    if (desired.value === 'push' || desired.value === 'local') desiredMode.value = desired.value;
    if (effective.value === 'push' || effective.value === 'local') effectiveMode.value = effective.value;
    if (!supportsServerPush) {
      desiredMode.value = 'local';
      effectiveMode.value = 'local';
    }
  })();
  return initialization;
}

async function setDesiredMode(mode: ReminderDeliveryMode): Promise<void> {
  await initialize();
  desiredMode.value = mode;
  await Preferences.set({ key: DESIRED_MODE_KEY, value: mode });
}

async function setEffectiveMode(mode: ReminderDeliveryMode): Promise<void> {
  await initialize();
  effectiveMode.value = mode;
  await Preferences.set({ key: EFFECTIVE_MODE_KEY, value: mode });
}

async function shouldScheduleLocally(): Promise<boolean> {
  await initialize();
  return effectiveMode.value === 'local';
}

async function getDeviceId(): Promise<string> {
  const stored = await Preferences.get({ key: DEVICE_ID_KEY });
  if (stored.value) return stored.value;
  const deviceId = createUuid();
  await Preferences.set({ key: DEVICE_ID_KEY, value: deviceId });
  return deviceId;
}

export const reminderDeliveryService = {
  desiredMode: readonly(desiredMode),
  effectiveMode: readonly(effectiveMode),
  initialize,
  setDesiredMode,
  setEffectiveMode,
  shouldScheduleLocally,
  getDeviceId,
  supportsServerPush,
};
