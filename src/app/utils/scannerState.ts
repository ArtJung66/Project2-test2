import { Device } from '../types/network';

export type ScannerScanType = 'basic' | 'full' | 'discovery';

export interface ScannerDiscoveryCache {
  targetRange: string;
  timestamp: number;
  devices: Device[];
}

export interface LatestScannerState {
  targetIp: string;
  scanType: ScannerScanType;
  timestamp: number;
  devices: Device[];
  discoveryCache: ScannerDiscoveryCache | null;
}

let latestScannerState: LatestScannerState | null = null;

export function getLatestScannerState() {
  return latestScannerState;
}

export function saveLatestScannerState(state: LatestScannerState) {
  latestScannerState = state;
}

export function clearLatestScannerState() {
  latestScannerState = null;
}
