let readyResolve: (() => void) | null = null;
const readyPromise = new Promise<void>((resolve) => {
  readyResolve = resolve;
});

export const waitForStartupReady = async (): Promise<void> => {
  await readyPromise;
};

export const signalStartupReady = () => {
  if (readyResolve) {
    readyResolve();
    readyResolve = null;
  }
};
