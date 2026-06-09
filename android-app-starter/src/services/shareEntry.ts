import type { Router } from 'vue-router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { bootReadyPromise } from '@/services/boot';
import { shareIntakeService } from '@/services/share-intake.service';
import { useUserStore } from '@/stores/userStore';
import { logger } from '@/utils/logger';

const TARGET = '/tabs/media';

export type DispatchReason =
  | 'cold-start'
  | 'hot-path'
  | 'app-resume'
  | 'post-login'
  | 'post-oauth';

class ShareEntry {
  private router: Router | null = null;
  private installed = false;
  private initPromise: Promise<void> | null = null;
  private unsubscribeShareReceived: (() => void) | null = null;
  private resumeListenerHandle: { remove?: () => void | Promise<void> } | null = null;

  install(router: Router): void {
    if (this.installed) return;
    this.installed = true;
    this.router = router;

    this.unsubscribeShareReceived = shareIntakeService.onShareReceived(() => {
      void this.dispatchIfPending('hot-path');
    });

    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void this.dispatchIfPending('app-resume');
      }).then((handle) => {
        this.resumeListenerHandle = handle;
      }).catch((error) => logger.error('shareEntry: app state listener failed', error));
    }

    this.initPromise = shareIntakeService.initialize();
  }

  async dispatchIfPending(reason: DispatchReason): Promise<boolean> {
    if (!this.router) return false;

    await this.initPromise?.catch((error) => logger.error('shareEntry: initialization failed', error));
    if (!shareIntakeService.hasPending()) return false;

    await bootReadyPromise;
    await this.router.isReady();

    const target = useUserStore().isAuthenticated ? TARGET : '/login';
    if (this.router.currentRoute.value.path === target) return true;

    logger.log(`shareEntry: dispatching to ${target} (${reason})`);
    await this.router.replace(target);
    return true;
  }

  _resetForTests(): void {
    this.unsubscribeShareReceived?.();
    this.unsubscribeShareReceived = null;
    void this.resumeListenerHandle?.remove?.();
    this.resumeListenerHandle = null;
    this.router = null;
    this.installed = false;
    this.initPromise = null;
  }
}

export const shareEntry = new ShareEntry();
