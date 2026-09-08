import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  getGlobalScanProgress,
  subscribeToGlobalScanProgress,
} from '../utils/scanProgressStore';
import type { GlobalScanProgressState } from '../utils/scanProgressStore';

function getScanLabel(scanType: GlobalScanProgressState['scanType']) {
  if (scanType === 'discovery') return 'Host Discovery';
  if (scanType === 'full') return 'Full Scan';
  if (scanType === 'basic') return 'Basic Scan';
  return 'Scan';
}

export function FloatingScanProgress() {
  const [state, setState] = useState(getGlobalScanProgress);

  useEffect(() => subscribeToGlobalScanProgress(setState), []);

  if (!state.isScanning) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-lg border bg-card p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Scanning in progress</div>
            <div className="truncate text-xs text-muted-foreground">
              {state.message || getScanLabel(state.scanType)}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {getScanLabel(state.scanType)}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={state.progress} className="h-2" />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(state.progress)}%
        </span>
      </div>
    </div>
  );
}
