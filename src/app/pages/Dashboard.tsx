import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { dangerousPorts } from '../utils/mockData';
import { Activity, Shield, AlertTriangle, TrendingUp, Calendar, Search, Filter } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState, useMemo } from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Device, CVE, RiskLevel, ScanResult } from '../types/network';
import { Badge } from '../components/ui/badge';
import { getCvssColorClass } from '../utils/cvss';
import { getLatestScannerState } from '../utils/scannerState';

const riskOrder: RiskLevel[] = ['critical', 'high', 'medium', 'low', 'safe'];
const riskColors: Record<RiskLevel, string> = {
  critical: '#7f1d1d',
  high: '#dc2626',
  medium: '#f97316',
  low: '#16a34a',
  safe: '#16a34a',
};

const portRiskRules: Record<number, RiskLevel> = {
  21: 'medium',
  22: 'low',
  23: 'critical',
  80: 'low',
  135: 'medium',
  139: 'medium',
  445: 'high',
  3389: 'high',
  5900: 'high',
  1433: 'high',
  3306: 'high',
  5432: 'high',
  6379: 'high',
  27017: 'high',
};

function getPortServiceName(device: Device, port: number) {
  const detected = device.services?.find((service) => service.port === port);
  if (detected) {
    return [detected.name, detected.product, detected.version].filter(Boolean).join(' ') || 'Detected service';
  }
  return dangerousPorts.find((item) => item.port === port)?.service ?? 'Unknown service';
}

function getPortRisk(device: Device, port: number): RiskLevel {
  const rationaleRisk = device.riskRationale?.find((item) => item.port === port)?.risk;
  if (rationaleRisk) return rationaleRisk;
  return portRiskRules[port] ?? 'low';
}

export function Dashboard() {
  const { t } = useLanguage();
  
  // 💡 BACKEND INTEGRATION POINT:
  // ข้อมูล 'allScanHistory' ตรงนี้เป็นการ Mock ดึงจาก utils/mockData 
  // ในการทำงานจริงควรเป็น:
  // useEffect(() => { 
  //   fetch('/api/dashboard/history').then(res => setAllScanHistory(res.data))
  // }, [])
  const allScanHistory = useMemo<ScanResult[]>(() => {
    const scans: ScanResult[] = [];
    const latestState = getLatestScannerState();

    if (latestState && latestState.devices.length > 0) {
      scans.push({
        id: `latest-${latestState.timestamp}`,
        scanDate: new Date(latestState.timestamp),
        devices: latestState.devices,
        duration: 0,
        scannedRange: latestState.targetIp,
      });
    }

    try {
      const saved = localStorage.getItem('network_scan_results');
      const parsed = saved ? JSON.parse(saved) : [];
      parsed.forEach((item: any) => {
        scans.push({
          id: String(item.id),
          scanDate: new Date(item.generatedAt ?? item.date ?? item.id),
          devices: (item.results ?? []).map((device: Device) => ({
            ...device,
            lastScan: new Date(device.lastScan),
          })),
          duration: 0,
          scannedRange: item.targetIp ?? item.range ?? 'Saved scan',
        });
      });
    } catch (error) {
      console.error('Failed to load saved scan results:', error);
    }

    return scans.sort((a, b) => b.scanDate.getTime() - a.scanDate.getTime());
  }, []);
  
  // State for filters (State การกรองข้อมูล ที่สามารถส่งเป็น Query Params ให้ Backend ประมวลผลได้)
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string | null>(null);
  const [dangerPortsDialogOpen, setDangerPortsDialogOpen] = useState(false);
  
  // ==========================================
  // DATA AGGREGATION & FILTERING
  // 🚨 BACKEND DEV NOTE:
  // โลจิกเหล่านี้ปัจจุบันทำงานแบบ Client-side Filtering
  // ถ้าข้อมูลมีขนาดใหญ่ ควรย้ายส่วนการ กรอง (Filter) และ คำนวณ (Aggregation) ไปให้ Database จัดการ
  // และส่ง Response ที่คำนวณเสร็จแล้วมาให้ Frontend เลย (เช่น /api/dashboard/stats?start=X&end=Y)
  // ==========================================
  
  // Filter scan history - default to last 30 days
  const scanHistory = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return allScanHistory.filter(scan => {
      // Date range filter (default last 30 days)
      const scanDate = scan.scanDate;
      const startDate = dateRange.start ? new Date(dateRange.start) : thirtyDaysAgo;
      const endDate = dateRange.end ? new Date(dateRange.end) : new Date();
      
      if (scanDate < startDate || scanDate > endDate) {
        return false;
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return scan.scannedRange.toLowerCase().includes(query) ||
               scan.devices.some(d => 
                 d.name.toLowerCase().includes(query) ||
                 d.ipAddress.toLowerCase().includes(query)
               );
      }
      
      return true;
    });
  }, [allScanHistory, searchQuery, dateRange]);
  
  const latestScan = scanHistory[0];
  const dashboardDevices = useMemo(
    () => scanHistory.flatMap((scan) => scan.devices),
    [scanHistory],
  );
  const exposureItems = useMemo(
    () => dashboardDevices.flatMap((device) =>
      device.openPorts.map((port) => ({
        device,
        port,
        riskLevel: getPortRisk(device, port),
        service: getPortServiceName(device, port),
        reason: device.riskRationale?.find((item) => item.port === port)?.reason,
      })),
    ),
    [dashboardDevices],
  );

  // ==========================================
  // KPI CALCULATIONS (การคำนวณตัวเลขสถิติสำคัญ)
  // 🚨 BACKEND DEV NOTE:
  // ข้อมูลส่วนนี้ควรถูกประมวลผลมาจาก Database (เช่นใช้ SQL COUNT, SUM)
  // แทนที่จะส่ง Data ก้อนใหญ่ทั้งหมดมาให้ Client นับจำนวน (เพื่อประหยัด Bandwidth)
  // เช่น สร้าง Endpoint GET /api/dashboard/kpi ที่คืนค่า { totalDevices: X, totalOpenPorts: Y, dangerPortsCount: Z }
  // ==========================================
  const totalDevices = dashboardDevices.length;
  const totalOpenPorts = new Set(dashboardDevices.flatMap((device) => device.openPorts)).size;
  
  const dangerousPortsCount = dashboardDevices.reduce((sum, device) => {
    const dangerous = device.openPorts.filter(port => 
      dangerousPorts.some(dp => dp.port === port)
    );
    return sum + dangerous.length;
  }, 0);

  // ==========================================
  // DANGER PORTS BY IP AGGREGATION
  // 🚨 BACKEND DEV NOTE:
  // โลจิกนี้คือการจัดกลุ่มอุปกรณ์ตามหมายเลขพอร์ตที่อันตราย
  // เทียบเท่ากับ SQL Group By : SELECT port, COUNT(device_id) GROUP BY port
  // แนะนำให้ Backend เตรียม Data ก้อนนี้ผ่าน API: GET /api/dashboard/danger-ports
  // ==========================================
  const getDangerPortsByIP = () => {
    if (dashboardDevices.length === 0) return [];

    const portMap = new Map<number, { port: number; service: string; deviceCount: number; devices: Device[] }>();

    dashboardDevices.forEach(device => {
      device.openPorts.forEach(port => {
        const portInfo = dangerousPorts.find(dp => dp.port === port);
        if (portInfo) {
          if (!portMap.has(port)) {
            portMap.set(port, {
              port,
              service: portInfo.service,
              deviceCount: 0,
              devices: [],
            });
          }
          const entry = portMap.get(port)!;
          entry.deviceCount++;
          entry.devices.push(device);
        }
      });
    });

    return Array.from(portMap.values()).sort((a, b) => b.deviceCount - a.deviceCount);
  };

  // Vulnerabilities by severity - count every exposed service/port, not only whole-device risk.
  const vulnerabilityData = riskOrder.map((risk) => ({
    key: risk,
    name: t(risk),
    value: exposureItems.filter((item) => item.riskLevel === risk).length,
    color: riskColors[risk],
  }));
  const totalExposures = exposureItems.length;

  // Handle pie chart click
  const handlePieClick = (data: any) => {
    const riskLevelKey = data.key ?? riskOrder.find((key) => t(key) === data.name);
    
    if (data.value > 0) {
      setSelectedRiskLevel(riskLevelKey);
      setRiskDialogOpen(true);
    }
  };

  // Recent scans data - ensure unique keys by using scan ID and index
  const recentScansData = useMemo(() => {
    const reversedScans = scanHistory.slice().reverse();
    
    // Create a Map to deduplicate by scan ID
    const uniqueScansMap = new Map();
    reversedScans.forEach(scan => {
      if (!uniqueScansMap.has(scan.id)) {
        uniqueScansMap.set(scan.id, scan);
      }
    });
    
    const uniqueScans = Array.from(uniqueScansMap.values());
    
    return uniqueScans.map((scan, index) => ({
      id: `scan-${scan.id}-${index}`, // Unique composite key
      name: scan.id,
      dateLabel: scan.scanDate.toLocaleString(),
      devices: scan.devices.length,
      highRisk: scan.devices.filter(d => d.riskLevel === 'high' || d.riskLevel === 'critical').length,
    }));
  }, [scanHistory]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ==========================================
          HEADER (ส่วนหัวของหน้าแดชบอร์ด)
          ========================================== */}
      <div>
        <h1 className="text-3xl font-bold">{t('dashboard')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('overview')} - Showing all values from filtered scan results
        </p>
      </div>

      {/* ==========================================
          FILTERS SECTION (ส่วนการกรองข้อมูลช่วงเวลา/ค้นหา)
          ========================================== */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search devices, IPs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              placeholder="Start date"
            />
            <Input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              placeholder="End date"
            />
          </div>
          {(searchQuery || dateRange.start || dateRange.end) && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setDateRange({ start: '', end: '' });
                }}
              >
                Clear Filters
              </Button>
              <span className="text-sm text-muted-foreground">
                Showing {scanHistory.length} scan(s)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==========================================
          STATISTICS CARDS (ส่วนแสดงตัวเลขสถิติสำคัญ 3 ช่อง)
          ========================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Open Ports */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('total_open_ports')}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalOpenPorts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('across_all_devices')}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Total Devices (Recent Scan Only) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('total_devices')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{totalDevices}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across filtered scans
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Danger Ports by IP - Clickable */}
        <Card
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setDangerPortsDialogOpen(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t('danger_ports')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-600 dark:text-red-400 mb-3">
              {dangerousPortsCount}
            </div>
            <div className="space-y-1.5">
              {getDangerPortsByIP().slice(0, 3).map((portDetail) => (
                <div
                  key={portDetail.port}
                  className="text-xs bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-md flex items-center justify-between hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                >
                  <span className="font-medium">{t('port')} {portDetail.port}:</span>
                  <span className="text-red-700 dark:text-red-400 font-semibold">
                    {portDetail.deviceCount} {portDetail.deviceCount === 1 ? t('device_count') : t('device_count_plural')}
                  </span>
                </div>
              ))}
              {getDangerPortsByIP().length > 3 && (
                <div className="text-xs text-muted-foreground text-center pt-1">
                  +{getDangerPortsByIP().length - 3} {t('more')}
                </div>
              )}
              {getDangerPortsByIP().length === 0 && (
                <div className="text-xs text-green-600 dark:text-green-400 text-center py-2">
                  {t('no_dangerous_ports')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ==========================================
          CHARTS SECTION (ส่วนกราฟแสดงข้อมูล)
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vulnerabilities by Severity */}
        <Card>
          <CardHeader>
            <CardTitle>{t('vulnerabilitiesBySeverity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  key="pie"
                  data={vulnerabilityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.value > 0 ? `${entry.name}: ${entry.value}` : ''}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={handlePieClick}
                >
                  {vulnerabilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip key="pie-tooltip" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Scans Trend */}
        <Card>
          <CardHeader>
            <CardTitle>{t('recentScans')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart 
                data={recentScansData} 
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid key="grid" strokeDasharray="3 3" />
                <XAxis 
                  key="xaxis"
                  dataKey="dateLabel"
                  angle={-15}
                  textAnchor="end"
                  height={60}
                />
                <YAxis key="yaxis" />
                <Tooltip key="tooltip" />
                <Legend key="legend" />
                <Line 
                  key="line-devices"
                  type="monotone"
                  dataKey="devices" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name={t('totalDevices')}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
                <Line 
                  key="line-highrisk"
                  type="monotone"
                  dataKey="highRisk" 
                  stroke="#dc2626" 
                  strokeWidth={2}
                  name={t('highRiskDevices')}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ==========================================
          RISK DISTRIBUTION DETAILS (ส่วนแสดงรายละเอียดการกระจายความเสี่ยงด้านล่าง)
          ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle>{t('riskDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vulnerabilityData.map((item) => {
              const riskLevelKey = item.key;
              
              return (
                <div 
                  key={item.name} 
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                  onClick={() => {
                    if (item.value > 0) {
                      setSelectedRiskLevel(riskLevelKey);
                      setRiskDialogOpen(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold">{item.value}</span>
                    <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          backgroundColor: item.color,
                          width: `${totalExposures > 0 ? (item.value / totalExposures) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12">
                      {totalExposures > 0 ? ((item.value / totalExposures) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ==========================================
          RISK LEVEL DETAIL DIALOG (ส่วนหน้าต่างป๊อปอัพแสดงรายละเอียดระดับความเสี่ยง)
          ========================================== */}
      <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="capitalize">{selectedRiskLevel && t(selectedRiskLevel)}</span> service exposure
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {selectedRiskLevel && (
              <div className="space-y-4">
                {exposureItems
                  .filter((item) => item.riskLevel === selectedRiskLevel)
                  .map(({ device, port, service, reason }) => {
                    const portInfo = dangerousPorts.find(dp => dp.port === port);
                    
                    return (
                      <Card key={`${device.id}-${port}-${selectedRiskLevel}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {t('port')} {port} ({service})
                              </CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {device.name} - {device.ipAddress}
                              </p>
                            </div>
                            <Badge variant={selectedRiskLevel === 'critical' || selectedRiskLevel === 'high' ? 'destructive' : 'secondary'}>
                              {t(selectedRiskLevel)}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <span className="text-sm font-medium">Why this service is listed:</span>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {reason ?? portInfo?.description ?? 'This port is open and should be reviewed against your firewall policy.'}
                              </div>
                            </div>
                            {portInfo?.cves && portInfo.cves.length > 0 && (
                              <div>
                                <span className="text-sm font-medium">{t('related_cves')}:</span>
                                <div className="mt-2 space-y-2">
                                  <div className="border rounded-md overflow-hidden">
                                    <div className="bg-muted/50 px-3 py-1.5 border-b flex justify-between items-center">
                                      <span className="text-xs font-semibold">{t('port')} {portInfo.port} ({portInfo.service})</span>
                                    </div>
                                    <div className="divide-y">
                                      {portInfo.cves.map((cve, idx) => (
                                        <div key={`${device.id}-${port}-${cve.id}-${idx}`} className="text-xs flex items-center justify-between p-2 bg-background hover:bg-muted/30 transition-colors">
                                          <span className="font-mono w-[120px]">{cve.id}</span>
                                          <span className="text-muted-foreground flex-1 px-2 truncate">{cve.description}</span>
                                          <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${getCvssColorClass(cve.cvss)} border-current`}>CVSS: {cve.cvss.toFixed(1)}</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          DANGER PORTS DETAIL DIALOG (ส่วนหน้าต่างป๊อปอัพแสดงพอร์ตที่อันตราย)
          ========================================== */}
      <Dialog open={dangerPortsDialogOpen} onOpenChange={setDangerPortsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              {t('dangerous_ports_analysis')}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {getDangerPortsByIP().length > 0 ? (
              <div className="space-y-4">
                {getDangerPortsByIP().map((portDetail) => (
                  <Card key={portDetail.port}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {t('port')} {portDetail.port} ({portDetail.service})
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {portDetail.deviceCount} {t('devices_using_port')}
                          </p>
                        </div>
                        <Badge className="bg-red-600 text-white">{t('dangerous')}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">{t('devices')}:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {portDetail.devices.map((device, index) => (
                            <div
                              key={`${device.id}-${device.ipAddress}-${index}`}
                              className="flex items-center justify-between p-3 bg-muted rounded-md text-sm"
                            >
                              <div>
                                <div className="font-medium">{device.name}</div>
                                <div className="text-xs text-muted-foreground">{device.ipAddress}</div>
                              </div>
                              <Badge className={
                                device.riskLevel === 'critical'
                                  ? 'bg-red-950 text-red-100'
                                  : device.riskLevel === 'high'
                                  ? 'bg-red-600 text-white'
                                  : device.riskLevel === 'medium'
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-green-600 text-white'
                              }>
                                {t(device.riskLevel).toUpperCase()}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('no_dangerous_ports_detected')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          LATEST SCAN INFO (ส่วนแสดงข้อมูลการสแกนล่าสุด)
          ========================================== */}
      {latestScan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('latest_scan_information')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('scanDate')}:</span>
                <div className="font-medium">{latestScan.scanDate.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('duration')}:</span>
                <div className="font-medium">{latestScan.duration} {t('seconds')}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('devicesFound')}:</span>
                <div className="font-medium">{latestScan.devices.length} {t('devices')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
