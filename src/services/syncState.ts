let facilitiesSyncInProgress = false;
let facilitiesSyncPromise: Promise<boolean> | null = null;

export const isFacilitiesSyncInProgress = () => facilitiesSyncInProgress;
export const getFacilitiesSyncPromise = () => facilitiesSyncPromise;

export const beginFacilitiesSync = (promise: Promise<boolean>) => {
  facilitiesSyncInProgress = true;
  facilitiesSyncPromise = promise;
};

export const concludeFacilitiesSync = () => {
  facilitiesSyncInProgress = false;
  facilitiesSyncPromise = null;
};
