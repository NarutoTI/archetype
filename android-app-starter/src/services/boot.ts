let resolveBootReady: (() => void) | null = null;

export const bootReadyPromise = new Promise<void>((resolve) => {
  resolveBootReady = resolve;
});

export const resolveBootReadyPromise = () => {
  resolveBootReady?.();
  resolveBootReady = null;
};
