import { useEffect, useState } from 'react';
import { Loader2, Radio } from 'lucide-react';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { getGlobalScanProgress, subscribeToGlobalScanProgress } from '../utils/scanProgressStore';
import type { GlobalScanProgressState } from '../utils/scanProgressStore';

function getScanLabel(scanType: GlobalScanProgressState['scanType']) {
  if (scanType === 'discovery') return 'Host discovery';
  if (scanType === 'full') return 'Full vulnerability scan';
  if (scanType === 'basic') return 'Basic scan';
  return 'Scan';
}

export function FloatingScanProgress() {
  const [state, setState] = useState(getGlobalScanProgress);
  useEffect(() => subscribeToGlobalScanProgress(setState), []);
  if (!state.isScanning) return null;
  return <div className="fixed bottom-5 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] rounded-lg border border-primary/30 bg-card p-4 shadow-2xl shadow-black/30" role="status" aria-live="polite">
    <div className="mb-3 flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Loader2 className="size-4 animate-spin" /></div><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold"><span>Scan in progress</span><Radio className="size-3 text-primary" /></div><div className="truncate text-xs text-muted-foreground">{state.message || getScanLabel(state.scanType)}</div></div></div><Badge variant="outline" className="shrink-0 text-[10px]">{Math.round(state.progress)}%</Badge></div>
    <Progress value={state.progress} className="h-1.5" />
    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span className="font-mono">{getScanLabel(state.scanType)}</span><span>Live telemetry</span></div>
  </div>;
}
