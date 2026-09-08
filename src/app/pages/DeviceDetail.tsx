import { useNavigate, useSearchParams } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { getCvssColorClass } from '../utils/cvss';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  ArrowLeft, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Network,
  Clock
} from 'lucide-react';
import { generateMockDevices, getPortInfo } from '../utils/mockData';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

export function DeviceDetail() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const deviceId = searchParams.get('id');

  // ==========================================
  // 💡 BACKEND INTEGRATION POINT 💡
  // ตรงนี้คือส่วนที่ดึงข้อมูล "อุปกรณ์ 1 ชิ้นแบบละเอียด" 
  // แทนที่จะลูปหาจาก MockData ควรเรียก API:
  // GET /api/devices/{deviceId}
  // หรือถ้ารวมข้อมูล CVE ด้วย: GET /api/devices/{deviceId}?include_cves=true
  // ==========================================
  const devices = generateMockDevices();
  const device = devices.find(d => d.id === deviceId);

  if (!device) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('device_not_found')}</p>
            <Button className="mt-4" onClick={() => {
              const scanId = searchParams.get('scanId');
              if (scanId) {
                navigate(`/history?modal=connected&scanId=${scanId}`);
              } else {
                navigate(-1);
              }
            }}>
              {t('go_back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-green-600 dark:text-green-400';
    }
  };

  const getRiskBgColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
      case 'high': return 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800';
      case 'medium': return 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800';
      case 'low': return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
      default: return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
    }
  };

  const dangerousPorts = device.openPorts
    .map(port => ({ port, info: getPortInfo(port) }))
    .filter(item => item.info !== null);

  const safePorts = device.openPorts.filter(port => !getPortInfo(port));

  const allCVEs = dangerousPorts.flatMap(item => item.info?.cves || []);
  const uniqueCVEs = Array.from(
    new Map(allCVEs.map(cve => [cve.id, cve])).values()
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ==========================================
          HEADER SECTION (ส่วนหัวของหน้ารายละเอียดอุปกรณ์)
          ========================================== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const scanId = searchParams.get('scanId');
              if (scanId) {
                navigate(`/history?modal=connected&scanId=${scanId}`);
              } else {
                navigate(-1);
              }
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{device.name}</h1>
              <Badge 
                variant={
                  device.riskLevel === 'critical' || device.riskLevel === 'high' 
                    ? 'destructive' 
                    : device.riskLevel === 'medium'
                    ? 'outline'
                    : 'secondary'
                }
                className="text-base px-3 py-1"
              >
                {t(device.riskLevel)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-muted-foreground">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                <span className="font-mono">{device.ipAddress}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{t('last_scan')}: {device.lastScan.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          RISK SUMMARY (ส่วนสรุปความเสี่ยงของอุปกรณ์)
          ========================================== */}
      <Card className={`border-2 ${getRiskBgColor(device.riskLevel)}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${getRiskColor(device.riskLevel)}`} />
            {t('risk_summary')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${getRiskColor(device.riskLevel)}`}>
                {t(device.riskLevel).toUpperCase()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{t('riskLevel')}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold">{device.openPorts.length}</div>
              <div className="text-sm text-muted-foreground mt-1">{t('openPorts')}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-red-600 dark:text-red-400">
                {dangerousPorts.length}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{t('vulnerable_ports')}</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-600 dark:text-orange-400">
                {uniqueCVEs.length}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{t('total_cves')}</div>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-background rounded-lg">
            <div className="flex items-start gap-2">
              {device.riskLevel === 'safe' ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              ) : device.riskLevel === 'critical' || device.riskLevel === 'high' ? (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Info className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="text-sm">
                {t(`riskDesc${device.riskLevel.charAt(0).toUpperCase() + device.riskLevel.slice(1)}`)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ==========================================
          DEVICE INFO & PORTS (ส่วนแสดงข้อมูลอุปกรณ์และพอร์ตที่เปิดทางคอลัมน์ซ้าย)
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Device Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('device_information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('ipAddress')}</label>
                <div className="font-mono text-lg">{device.ipAddress}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('macAddress')}</label>
                <div className="font-mono">{device.macAddress}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('deviceType')}</label>
                <div>{device.deviceType}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('last_scan')}</label>
                <div>{device.lastScan.toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>

          {/* Open Ports List */}
          <Card>
            <CardHeader>
              <CardTitle>{t('openPorts')} ({device.openPorts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {device.openPorts.map(port => {
                  const portInfo = getPortInfo(port);
                  return (
                    <div
                      key={port}
                      className={`p-3 rounded-lg border ${
                        portInfo
                          ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                          : 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">
                            {t('port')} {port}
                            {portInfo && (
                              <span className="ml-2 text-sm text-muted-foreground">
                                ({portInfo.service})
                              </span>
                            )}
                          </div>
                          {portInfo && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {portInfo.description}
                            </div>
                          )}
                        </div>
                        {portInfo && (
                          <Badge variant="destructive">
                            {t(portInfo.risk)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==========================================
            CVE MAPPING (ส่วนแสดงข้อมูลช่องโหว่ CVE ทางคอลัมน์ขวา)
            ========================================== */}
        {/* Right Column - CVE Mapping */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('port_to_cve_mapping')}</span>
                {uniqueCVEs.length > 0 && (
                  <Badge variant="destructive">
                    {uniqueCVEs.length} CVE{uniqueCVEs.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dangerousPorts.length === 0 ? (
                <div className="p-8 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                    {t('no_vulnerabilities_detected')}
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {t('all_ports_safe')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dangerousPorts.map(({ port, info }) => {
                    if (!info || !info.cves || info.cves.length === 0) return null;
                    
                    return (
                      <div key={port} className="border rounded-lg overflow-hidden">
                        {/* Port Header */}
                        <div className={`p-4 border-b ${getRiskBgColor(info.risk)}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl font-bold">{t('port')} {port}</div>
                              <div className="text-sm text-muted-foreground">
                                ({info.service})
                              </div>
                            </div>
                            <Badge 
                              variant={
                                info.risk === 'critical' || info.risk === 'high'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {t(info.risk)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">
                            {info.description}
                          </p>
                        </div>

                        {/* CVE List */}
                        <div className="divide-y">
                          {info.cves.map((cve) => (
                            <TooltipProvider key={cve.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="p-4 hover:bg-muted/50 transition-colors cursor-help">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                          <span className="font-mono font-semibold text-base">
                                            {cve.id}
                                          </span>
                                          <Badge 
                                            variant={
                                              cve.severity === 'critical' || cve.severity === 'high'
                                                ? 'destructive'
                                                : cve.severity === 'medium'
                                                ? 'outline'
                                                : 'secondary'
                                            }
                                          >
                                            {t(cve.severity)}
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          {cve.description}
                                        </p>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <div className="text-xs text-muted-foreground mb-1">
                                          {t('cvss_score')}
                                        </div>
                                        <div className={`text-3xl font-bold ${getCvssColorClass(cve.cvss)}`}>
                                          {cve.cvss.toFixed(1)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-sm">
                                  <div className="space-y-2">
                                    <p className="font-semibold">{cve.id}</p>
                                    <p className="text-sm">{cve.description}</p>
                                    <div className="flex items-center justify-between pt-2 border-t">
                                      <span className="text-xs">{t('severity')}: {t(cve.severity).toUpperCase()}</span>
                                      <span className="text-xs">CVSS: {cve.cvss.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CVE Summary by Severity */}
          {uniqueCVEs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('cve_summary_by_severity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['critical', 'high', 'medium', 'low'] as const).map(severity => {
                    const count = uniqueCVEs.filter(cve => cve.severity === severity).length;
                    if (count === 0) return null;
                    
                    return (
                      <div
                        key={severity}
                        className={`p-4 rounded-lg border ${getRiskBgColor(severity)} text-center`}
                      >
                        <div className={`text-3xl font-bold ${getRiskColor(severity)}`}>
                          {count}
                        </div>
                        <div className="text-sm font-medium mt-1 capitalize">
                          {t(severity)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
