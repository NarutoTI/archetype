import { Preferences } from '@capacitor/preferences';
import { useUserStore } from '@/stores/userStore';
import { logger } from '@/utils/logger';

/**
 * Índice local mínimo das notificações agendadas, para reconstruir os dados de
 * uma notificação a partir do `notification.id` quando o app é aberto pelo
 * ícone do launcher (sem o payload do toque na notificação).
 *
 * Genérico de propósito: guarda metadados de exibição (`title`/`body`), um
 * `routePath` opcional para onde a ação "Abrir" deve navegar e o `key` de
 * domínio que originou a notificação. É escopado por usuário, como os demais
 * caches do starter.
 */
const STORAGE_PREFIX = 'starter-notification-launch-index';

export interface NotificationLaunchEntryInput {
  id: number;
  key: string;
  title: string;
  body?: string;
  /** Rota destino da ação "Abrir". Quando ausente, o consumidor decide o fallback. */
  routePath?: string;
  scheduledAtMs?: number;
}

export interface NotificationLaunchEntry extends NotificationLaunchEntryInput {
  recordedAtMs: number;
}

class NotificationLaunchIndexService {
  private readonly MAX_ENTRIES = 500;

  private getScope(): string | null {
    try {
      const user = useUserStore().currentUser;
      const scope = user?.id || user?.email;
      return scope ? String(scope) : null;
    } catch {
      return null;
    }
  }

  private getStorageKey(): string | null {
    const scope = this.getScope();
    return scope ? `${STORAGE_PREFIX}:${scope}` : null;
  }

  private isLaunchEntry(value: unknown): value is NotificationLaunchEntry {
    if (!value || typeof value !== 'object') return false;

    const entry = value as Partial<NotificationLaunchEntry>;
    return (
      typeof entry.id === 'number' &&
      typeof entry.key === 'string' &&
      entry.key.length > 0 &&
      typeof entry.title === 'string' &&
      typeof entry.recordedAtMs === 'number'
    );
  }

  private normalizeEntries(raw: unknown): Record<string, NotificationLaunchEntry> {
    if (!raw || typeof raw !== 'object') return {};

    const source = Array.isArray(raw)
      ? raw
      : Object.values(raw as Record<string, unknown>);

    const normalized: Record<string, NotificationLaunchEntry> = {};
    for (const value of source) {
      if (!this.isLaunchEntry(value)) continue;
      normalized[String(value.id)] = value;
    }
    return normalized;
  }

  private async readIndex(): Promise<Record<string, NotificationLaunchEntry>> {
    const key = this.getStorageKey();
    if (!key) return {};

    try {
      const { value } = await Preferences.get({ key });
      if (!value) return {};
      return this.normalizeEntries(JSON.parse(value));
    } catch (error) {
      logger.warn('Failed to read notification launch index:', error);
      return {};
    }
  }

  private async writeIndex(index: Record<string, NotificationLaunchEntry>): Promise<void> {
    const key = this.getStorageKey();
    if (!key) return;

    // Mantém as notificações agendadas mais próximas quando o teto é atingido.
    const entries = Object.values(index)
      .sort((a, b) =>
        (a.scheduledAtMs ?? a.recordedAtMs) - (b.scheduledAtMs ?? b.recordedAtMs)
      )
      .slice(0, this.MAX_ENTRIES);

    try {
      if (!entries.length) {
        await Preferences.remove({ key });
        return;
      }

      await Preferences.set({
        key,
        value: JSON.stringify(Object.fromEntries(entries.map(entry => [String(entry.id), entry]))),
      });
    } catch (error) {
      logger.warn('Failed to write notification launch index:', error);
    }
  }

  async upsertEntries(entries: NotificationLaunchEntryInput[]): Promise<void> {
    if (!entries.length) return;

    const index = await this.readIndex();
    const recordedAtMs = Date.now();

    for (const entry of entries) {
      if (!entry.id || !entry.key) continue;
      index[String(entry.id)] = {
        ...entry,
        recordedAtMs,
      };
    }

    await this.writeIndex(index);
  }

  async getEntriesByIds(ids: number[]): Promise<NotificationLaunchEntry[]> {
    if (!ids.length) return [];

    const index = await this.readIndex();
    const seen = new Set<number>();
    const result: NotificationLaunchEntry[] = [];

    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = index[String(id)];
      if (entry) result.push(entry);
    }

    return result;
  }

  async removeEntriesByIds(ids: number[]): Promise<void> {
    if (!ids.length) return;

    const index = await this.readIndex();
    let changed = false;

    for (const id of ids) {
      const key = String(id);
      if (!index[key]) continue;
      delete index[key];
      changed = true;
    }

    if (changed) {
      await this.writeIndex(index);
    }
  }

  async clear(): Promise<void> {
    await this.writeIndex({});
  }
}

export const notificationLaunchIndexService = new NotificationLaunchIndexService();
