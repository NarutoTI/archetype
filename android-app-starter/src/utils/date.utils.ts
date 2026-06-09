import i18n from '@/i18n';

export const createLocalDate = (date: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const createLocalDateTime = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

export const dateToISOString = (date: Date): string => {
  return date.toLocaleDateString('sv-SE');
};

export const getTime = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const dateToISOStringWithTime = (date: Date): string => {
  return `${dateToISOString(date)}T${getTime(date)}`;
};

export const isSameOrFutureDate = (dateToCompare: string): boolean => {
  const compareDate = createLocalDate(dateToCompare);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return compareDate >= today;
};

export const isPastDateTime = (date: string, time?: string): boolean => {
  const targetDate = time ? createLocalDateTime(date, time) : createLocalDate(date);
  return targetDate.getTime() < Date.now();
};

export const isPastDate = (date: Date): boolean => date.getTime() < Date.now();

export const dateToLocaleString = (date: Date): string => {
  return date.toLocaleDateString(i18n.global.t('common.locale'), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const dateTimeToLocaleString = (date?: Date): string => {
  if (!date) return '';
  return date.toLocaleString(i18n.global.t('common.locale'), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatISODateToLocalString = (date: string): string => {
  return dateToLocaleString(createLocalDate(date));
};

export const formatDateTimeToLocalString = (date: string, time: string): string => {
  return dateTimeToLocaleString(createLocalDateTime(date, time));
};

export const formatTime = (time: string): string => {
  const [hour, minute] = time.split(':');
  return `${hour}:${minute}`;
};
