import { useState } from 'react';
import { Device } from '../types/network';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { useLanguage } from '../contexts/LanguageContext';
import { getPortInfo } from '../utils/mockData';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Info, ShieldAlert } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface DeviceDetailsDialogProps {
  device: Device | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const exposureRules: Record<number, { service: string; level: 'High' | 'Medium' | 'Low'; recommendation: string }> = {
  21: { service: 'FTP', level: 'Medium', recommendation: 'Disable plain FTP or replace it with SFTP/FTPS.' },
  22: { service: 'SSH', level: 'Low', recommendation: 'Allow only trusted IPs and require key-based authentication.' },
  23: { service: 'Telnet', level: 'High', recommendation: 'Disable Telnet and use SSH instead.' },
  80: { service: 'HTTP', level: 'Low', recommendation: 'Redirect to HTTPS if this service handles sensitive data.' },
  135: { service: 'MS RPC', level: 'Medium', recommendation: 'Restrict access to trusted internal hosts only.' },
  139: { service: 'NetBIOS', level: 'Medium', recommendation: 'Disable NetBIOS if legacy file sharing is not required.' },
  445: { service: 'SMB', level: 'High', recommendation: 'Restrict SMB to trusted hosts and keep Windows patched.' },
  3389: { service: 'RDP', level: 'High', recommendation: 'Do not expose RDP broadly; require VPN/MFA and trusted IP rules.' },
  5900: { service: 'VNC', level: 'High', recommendation: 'Restrict VNC access and require strong authentication.' },
  1433: { service: 'MSSQL', level: 'High', recommendation: 'Limit database access to application servers only.' },
  3306: { service: 'MySQL', level: 'High', recommendation: 'Limit database access to application servers only.' },
  5432: { service: 'PostgreSQL', level: 'High', recommendation: 'Limit database access to application servers only.' },
  6379: { service: 'Redis', level: 'High', recommendation: 'Bind Redis to trusted interfaces and require authentication.' },
  27017: { service: 'MongoDB', level: 'High', recommendation: 'Restrict MongoDB access and require authentication.' },
};

function getExposure(port: number) {
  return exposureRules[port] ?? {
    service: getPortInfo(port)?.service ?? 'Unknown service',
    level: 'Low' as const,
    recommendation: 'Verify that this service is required and restricted by firewall policy.',
  };
}

function formatNmapService(service: NonNullable<Device['services']>[number]) {
  return [service.name, service.product, service.version, service.extraInfo]
    .filter(Boolean)
    .join(' ');
}

function inferDeviceType(device: Device) {
  const currentType = device.deviceType?.trim();
  if (currentType && currentType.toLowerCase() !== 'unknown host') return currentType;

  const serviceText = (device.services ?? [])
    .map((service) => [service.name, service.product, service.extraInfo, ...(service.cpe ?? [])].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();

  if (serviceText.includes('apple') || serviceText.includes('mac os') || serviceText.includes('macos')) return 'macOS Host';
  if (device.openPorts.includes(5000) && device.openPorts.includes(7000)) return 'macOS/AirPlay Host';
  if (device.openPorts.includes(3389)) return 'Windows/RDP Host';
  if (device.openPorts.includes(445) || device.openPorts.includes(139)) return 'Windows Host';
  if (device.openPorts.includes(22)) return 'SSH Host';

  return currentType || 'Unknown Host';
}

function getFindingClass(severity: string) {
  if (severity === 'critical' || severity === 'high') {
    return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
  }
  if (severity === 'medium') {
    return 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800';
  }
  return 'bg-muted';
}

function riskRank(risk: string) {
  return { safe: 0, low: 1, medium: 2, high: 3, critical: 4 }[risk] ?? 0;
}

function displayRisk(risk: string) {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

function exposureLevelToRisk(level: string) {
  return level.toLowerCase();
}

export function DeviceDetailsDialog({
  device,
  open,
  onOpenChange,
}: DeviceDetailsDialogProps) {
  const { t } = useLanguage();
  const [expandedPort, setExpandedPort] = useState<number | null>(null);

  if (!device) return null;

  const getRiskDescription = (risk: string): string => {
    return t(`riskDesc${risk.charAt(0).toUpperCase() + risk.slice(1)}`);
  };
  const servicesByPort = new Map((device.services ?? []).map((service) => [service.port, service]));
  const findings = device.findings ?? [];
  const findingsByPort = new Map<number, typeof findings>();
  for (const finding of findings) {
    findingsByPort.set(finding.port, [...(findingsByPort.get(finding.port) ?? []), finding]);
  }
  const rationaleByPort = new Map((device.riskRationale ?? []).map((item) => [item.port, item]));
  const displayDeviceType = inferDeviceType(device);
  const exposureItems = device.openPorts
    .map((port) => {
      const exposure = getExposure(port);
      const rationale = rationaleByPort.get(port);
      const portFindings = findingsByPort.get(port) ?? [];
      const highestFindingRisk = portFindings.reduce(
        (highest, finding) => riskRank(finding.severity) > riskRank(highest) ? finding.severity : highest,
        'safe',
      );
      const inferredRisk = rationale?.risk ?? exposureLevelToRisk(exposure.level);
      const risk = riskRank(highestFindingRisk) > riskRank(inferredRisk) ? highestFindingRisk : inferredRisk;

      return {
        port,
        exposure,
        rationale,
        findings: portFindings,
        service: servicesByPort.get(port),
        risk,
      };
    })
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || a.port - b.port);
  const riskDrivers = exposureItems.filter((item) => riskRank(item.risk) >= riskRank('high'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{device.name}</span>
            <Badge variant={device.riskLevel === 'critical' || device.riskLevel === 'high' ? 'destructive' : 'secondary'}>
              {t(device.riskLevel)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {t('device')} {displayDeviceType} - {device.ipAddress}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">{t('device_information')}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">{t('ipAddress')}:</span>
                  <div className="text-muted-foreground">{device.ipAddress}</div>
                </div>
                <div>
                  <span className="font-medium">{t('macAddress')}:</span>
                  <div className="text-muted-foreground font-mono">{device.macAddress}</div>
                </div>
                <div>
                  <span className="font-medium">{t('deviceType')}:</span>
                  <div className="text-muted-foreground">{displayDeviceType}</div>
                </div>
                <div>
                  <span className="font-medium">{t('last_scan')}:</span>
                  <div className="text-muted-foreground">
                    {device.lastScan.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Assessment */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">{t('risk_assessment')}</h4>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-2">
                  {device.riskLevel === 'safe' ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  ) : device.riskLevel === 'critical' || device.riskLevel === 'high' ? (
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                  ) : (
                    <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  )}
                  <div className="text-sm">
                    {getRiskDescription(device.riskLevel)}
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Drivers */}
            {riskDrivers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Risk Drivers</h4>
                <p className="text-xs text-muted-foreground">
                  These services are the main reason this host is marked high risk.
                </p>
                <div className="space-y-2">
                  {riskDrivers.map((item) => {
                    const serviceName = item.service ? formatNmapService(item.service) : item.exposure.service;
                    return (
                      <button
                        key={`driver-${item.port}`}
                        type="button"
                        onClick={() => setExpandedPort(expandedPort === item.port ? null : item.port)}
                        className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-left transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:hover:bg-red-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <ShieldAlert className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400" />
                            <div>
                              <div className="font-semibold text-sm">
                                Port {item.port} ({serviceName})
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.rationale?.reason ?? item.exposure.recommendation}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">{displayRisk(item.risk)}</Badge>
                            {expandedPort === item.port ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Open Ports */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">{t('openPorts')} ({device.openPorts.length})</h4>
              <p className="text-xs text-muted-foreground">
                Open ports are detected by Nmap when available, with the built-in TCP scanner as fallback.
              </p>
              <div className="space-y-2">
                {device.openPorts.map((port) => {
                  const nmapService = servicesByPort.get(port);
                  const serviceName = nmapService ? formatNmapService(nmapService) : '';
                  return (
                    <div
                      key={port}
                      className="p-3 rounded-lg border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">
                            {t('port')} {port}
                            {serviceName && (
                              <span className="ml-2 text-muted-foreground">
                                ({serviceName})
                              </span>
                            )}
                          </div>
                          {nmapService ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              Detected by Nmap
                              {nmapService.confidence !== undefined && ` - confidence ${nmapService.confidence}/10`}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verified Findings */}
            {findings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Verified Findings ({findings.length})</h4>
                <p className="text-xs text-muted-foreground">
                  These findings come from Nmap NSE script checks, not from port-number assumptions.
                </p>
                <div className="space-y-3">
                  {findings.map((finding, index) => (
                    <div
                      key={`${finding.scriptId}-${finding.port}-${index}`}
                      className={`p-3 rounded-lg border ${getFindingClass(finding.severity)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-semibold text-sm">
                            Port {finding.port}: {finding.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Nmap script: {finding.scriptId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {finding.recommendation}
                          </div>
                          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 text-[11px] text-muted-foreground">
                            {finding.evidence}
                          </pre>
                        </div>
                        <Badge variant={finding.severity === 'critical' || finding.severity === 'high' ? 'destructive' : 'outline'}>
                          {t(finding.severity)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exposure Analysis */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Exposure Analysis</h4>
              <p className="text-xs text-muted-foreground">
                Click a service to see why it is risky, what was detected, and what to do next.
              </p>
              <div className="space-y-3">
                {exposureItems.map((item) => {
                  const isHigh = riskRank(item.risk) >= riskRank('high');
                  const isMedium = item.risk === 'medium';
                  const serviceName = item.service ? formatNmapService(item.service) : item.exposure.service;
                  const isExpanded = expandedPort === item.port;

                  return (
                    <div
                      key={`exposure-${item.port}`}
                      className={`p-3 rounded-lg border ${
                        isHigh
                          ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                          : isMedium
                          ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800'
                          : 'bg-muted'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedPort(isExpanded ? null : item.port)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="font-semibold text-sm">
                              Port {item.port} ({serviceName})
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.rationale?.reason ?? item.exposure.recommendation}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={isHigh ? 'destructive' : 'outline'}>{displayRisk(item.risk)}</Badge>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 border-t pt-3 text-xs">
                          <div>
                            <div className="font-semibold text-sm">Why this matters</div>
                            <div className="mt-1 text-muted-foreground">
                              {item.rationale?.reason ?? item.exposure.recommendation}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold text-sm">Detected service</div>
                            {item.service ? (
                              <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
                                <div>Name: {item.service.name ?? 'Unknown'}</div>
                                <div>Protocol: {item.service.protocol}</div>
                                <div>Product: {item.service.product ?? '-'}</div>
                                <div>Version: {item.service.version ?? '-'}</div>
                                <div>Method: {item.service.method ?? '-'}</div>
                                <div>Confidence: {item.service.confidence ?? '-'}</div>
                              </div>
                            ) : (
                              <div className="mt-1 text-muted-foreground">
                                Service inferred from the common port number.
                              </div>
                            )}
                          </div>

                          {item.findings.length > 0 && (
                            <div>
                              <div className="font-semibold text-sm">Verified findings</div>
                              <div className="mt-2 space-y-2">
                                {item.findings.map((finding, index) => (
                                  <div key={`${finding.scriptId}-${index}`} className="rounded border bg-background/70 p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{finding.title}</span>
                                      <Badge variant={riskRank(finding.severity) >= riskRank('high') ? 'destructive' : 'outline'}>
                                        {displayRisk(finding.severity)}
                                      </Badge>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">Nmap script: {finding.scriptId}</div>
                                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] text-muted-foreground">
                                      {finding.evidence}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="font-semibold text-sm">Recommended action</div>
                            <div className="mt-1 text-muted-foreground">
                              {item.findings[0]?.recommendation ?? item.exposure.recommendation}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {device.openPorts.length === 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-green-800 dark:text-green-200">
                      No open ports were detected in this scan profile.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
