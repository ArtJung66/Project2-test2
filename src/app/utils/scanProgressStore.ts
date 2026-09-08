import type { ScannerScanType } from './scannerState';

export interface GlobalScanProgressState {
  isScanning: boolean;
  progress: number;
  scanType: ScannerScanType | null;
  message: string;
}

const defaultState: GlobalScanProgressState = {
  isScanning: false,
  progress: 0,
  scanType: null,
  message: '',
};

let currentState = defaultState;
const listeners = new Set<(state: GlobalScanProgressState) => void>();

export function getGlobalScanProgress() {
  return currentState;
}

export function setGlobalScanProgress(nextState: Partial<GlobalScanProgressState>) {
  currentState = {
    ...currentState,
    ...nextState,
  };
  listeners.forEach((listener) => listener(currentState));
}

export function resetGlobalScanProgress() {
  setGlobalScanProgress(defaultState);
}

export function subscribeToGlobalScanProgress(listener: (state: GlobalScanProgressState) => void) {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}
