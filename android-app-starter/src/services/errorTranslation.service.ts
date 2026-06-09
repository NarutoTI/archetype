import i18n from '@/i18n';
import { logger } from '@/utils/logger';

interface ErrorResponse {
  code?: string;
  message?: string;
  error?: string;
  response?: {
    status?: number;
    data?: {
      code?: string;
      message?: string;
      errors?: Array<{ msg: string }>;
    };
  };
}

interface SuccessResponse {
  code?: string;
  message?: string;
}

export class ErrorTranslationService {
  static translateError(error: ErrorResponse | unknown): string {
    try {
      const err = error as ErrorResponse;
      const data = err.response?.data;
      const code = data?.code || err.code;

      if (code) {
        const authKey = `auth.${code}`;
        const backendKey = `errors.backend.${code}`;
        if (i18n.global.te(authKey)) return i18n.global.t(authKey);
        if (i18n.global.te(backendKey)) return i18n.global.t(backendKey);
      }

      if (data?.errors?.length) {
        return data.errors.map((item) => item.msg).join(', ');
      }

      const message = data?.message || err.message || err.error || 'Unknown error';
      if (!err.response) {
        return `${i18n.global.t('errors.networkError')} ${message}`;
      }

      return message;
    } catch (translationError) {
      logger.warn('Error translating error message:', translationError);
      return 'Unknown error';
    }
  }

  static translateSuccess(response: SuccessResponse | unknown): string {
    const payload = response as SuccessResponse;
    if (payload?.code) {
      const key = `auth.${payload.code}`;
      if (i18n.global.te(key)) return i18n.global.t(key);
    }
    return payload?.message || 'Success';
  }
}
