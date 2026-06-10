import { describe, expect, it } from 'vitest';
import { bootReadyPromise, resolveBootReadyPromise } from '@/services/boot';

describe('boot', () => {
  it('resolves bootReadyPromise when the app finishes auth/bootstrap', async () => {
    resolveBootReadyPromise();
    await expect(bootReadyPromise).resolves.toBeUndefined();
  });
});
