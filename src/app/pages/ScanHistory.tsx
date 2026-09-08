import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Calendar, Clock, AlertTriangle, Eye, Download, ArrowLeftRight, Filter, Search, FileText, FileSpreadsheet, FileJson } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { useLanguage } from '../contexts/LanguageContext';
import { generateMockScanHistory, dangerousPorts, getPortInfo } from '../utils/mockData';
import { ScanResult, Device } from '../types/network';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { DeviceCard } from '../components/DeviceCard';
import { NetworkGraph } from '../components/NetworkGraph';
import { getLatestScannerState } from '../utils/scannerState';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { jsPDF } from 'jspdf';

type SavedScanReport = {
  id?: string | number;
  generatedAt?: string;
  date?: string;
  targetIp?: string;
  range?: string;
  results?: Device[];
};

function hydrateDevice(device: Device): Device {
  return {
    ...device,
    lastScan: new Date(device.lastScan),
  };
}

function buildStoredScanHistory(): ScanResult[] {
  const scans: ScanResult[] = [];
  const latestState = getLatestScannerState();

  if (latestState && latestState.devices.length > 0) {
    scans.push({
      id: `latest-${latestState.timestamp}`,
      scanDate: new Date(latestState.timestamp),
      devices: latestState.devices.map(hydrateDevice),
      duration: 0,
      scannedRange: latestState.targetIp || 'Latest scan',
    });
  }

  try {
    const saved = localStorage.getItem('network_scan_results');
    const parsed: SavedScanReport[] = saved ? JSON.parse(saved) : [];

    parsed.forEach((item, index) => {
      const id = String(item.id ?? item.generatedAt ?? item.date ?? `saved-${index}`);
      const numericIdDate = typeof item.id === 'number' ? item.id : Number(item.id);
      const scanDate = new Date(
        item.generatedAt ?? item.date ?? (Number.isNaN(numericIdDate) ? Date.now() : numericIdDate),
      );
      const devices = (item.results ?? []).map(hydrateDevice);

      if (devices.length > 0) {
        scans.push({
          id,
          scanDate: Number.isNaN(scanDate.getTime()) ? new Date() : scanDate,
          devices,
          duration: 0,
          scannedRange: item.targetIp ?? item.range ?? 'Saved scan',
        });
      }
    });
  } catch (error) {
    console.error('Failed to load saved scan history:', error);
  }

  const uniqueScans = new Map<string, ScanResult>();
  scans.forEach((scan) => uniqueScans.set(scan.id, scan));

  return Array.from(uniqueScans.values()).sort(
    (a, b) => b.scanDate.getTime() - a.scanDate.getTime(),
  );
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ScanHistory() {
  const { t, language } = useLanguage();
  
  // 💡 BACKEND INTEGRATION POINT: 
  // ตรงนี้คือจุดรับข้อมูล History ทั้งหมด ควรเปลี่ยนไปเรียก API:
  // GET /api/history?page=1&limit=20
  // (ถ้ามี pagination ให้ backend ทำมาให้ด้วยจะดีมากครับ)
  const allScanHistory = useMemo(() => {
    const storedScans = buildStoredScanHistory();
    return storedScans.length > 0 ? storedScans : generateMockScanHistory();
  }, []);
  
  const navigate = useNavigate();
  // ==========================================
  // STATE MANAGEMENT (จัดการ State ของหน้า)
  // ==========================================
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('diagram');
  
  // Filter states
  const [searchIP, setSearchIP] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [portFilter, setPortFilter] = useState<string>('all');
  
  // Dialog states
  const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  // ==========================================
  // URL PARAMS EFFECT (อ่านค่าจาก URL ตอนเข้าหน้า)
  // ==========================================
  useEffect(() => {
    const modal = searchParams.get('modal');
    const scanId = searchParams.get('scanId');
    if (modal === 'connected' && scanId) {
      const scan = allScanHistory.find(s => s.id === scanId);
      if (scan) {
        setSelectedScan(scan);
        setViewDialogOpen(true);
        setActiveTab('devices');
        
        searchParams.delete('modal');
        searchParams.delete('scanId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, allScanHistory, setSearchParams]);

  // ==========================================
  // DATA FILTERING (กรองข้อมูลประวัติการสแกน)
  // ==========================================
  const scanHistory = useMemo(() => {
    return allScanHistory.filter(scan => {
      // IP search filter
      if (searchIP && !scan.scannedRange.toLowerCase().includes(searchIP.toLowerCase())) {
        return false;
      }
      
      // Date range filter
      const scanDate = scan.scanDate;
      if (startDate && scanDate < new Date(startDate)) {
        return false;
      }
      if (endDate && scanDate > new Date(endDate)) {
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setHours(23, 59, 59, 999);
        if (scanDate > endDateInclusive) {
          return false;
        }
      }
      
      // Port type filter
      if (portFilter !== 'all') {
        const hasFilteredPort = scan.devices.some(device => {
          if (portFilter === 'dangerous') {
            return device.openPorts.some(port => 
              dangerousPorts.some(dp => dp.port === port)
            );
          } else if (portFilter === 'safe') {
            return device.openPorts.every(port => 
              !dangerousPorts.some(dp => dp.port === port)
            );
          }
          return true;
        });
        if (!hasFilteredPort) return false;
      }
      
      return true;
    });
  }, [allScanHistory, searchIP, startDate, endDate, portFilter]);

  // ==========================================
  // ACTION HANDLERS (ส่วนจัดการการคลิกปุ่มต่างๆ)
  // ==========================================
  const handleViewScan = (scan: ScanResult) => {
    setSelectedScan(scan);
    setViewDialogOpen(true);
  };

  const toggleSelectScan = (scanId: string) => {
    setSelectedScans((prev) => {
      if (prev.includes(scanId)) {
        return prev.filter((id) => id !== scanId);
      } else if (prev.length < 2) {
        return [...prev, scanId];
      }
      return prev;
    });
  };

  const handleCompare = () => {
    if (selectedScans.length === 2) {
      setCompareDialogOpen(true);
    }
  };

  const [selectedForExport, setSelectedForExport] = useState<string[]>([]);
  
  const toggleSelectForExport = (scanId: string) => {
    setSelectedForExport((prev) => {
      if (prev.includes(scanId)) {
        return prev.filter((id) => id !== scanId);
      } else {
        return [...prev, scanId];
      }
    });
  };
  
  const handleSelectAllForExport = (checked: boolean) => {
    if (checked) {
      setSelectedForExport(scanHistory.map(scan => scan.id));
    } else {
      setSelectedForExport([]);
    }
  };

  // ==========================================
  // EXPORT HANDLERS (ฟังก์ชันส่งออกไฟล์ JSON, CSV, PDF)
  // ==========================================
  const handleExportSelected = (format: 'json' | 'csv' | 'pdf') => {
    if (selectedForExport.length === 0) return;
    
    const scansToExport = allScanHistory.filter(scan => selectedForExport.includes(scan.id));
    
    if (format === 'json') {
      const dataStr = JSON.stringify(scansToExport, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', `scan_reports_batch.json`);
      linkElement.click();
    } else if (format === 'csv') {
      const headers = ['Scan ID', 'Date', 'Range', 'Device Name', 'IP Address', 'MAC Address', 'Device Type', 'Risk Level', 'Open Ports'];
      let rows: string[][] = [];
      
      scansToExport.forEach(scan => {
        scan.devices.forEach(device => {
          rows.push([
            scan.id,
            scan.scanDate.toISOString(),
            scan.scannedRange,
            device.name,
            device.ipAddress,
            device.macAddress,
            device.deviceType,
            device.riskLevel,
            device.openPorts.join(';')
          ]);
        });
      });
      
      const csvContent = [
        headers.map(csvEscape).join(','),
        ...rows.map(row => row.map(csvEscape).join(','))
      ].join('\n');
      
      const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', `scan_reports_batch.csv`);
      linkElement.click();
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      let yPos = 10;
      doc.text(`Network Scan Batch Report`, 10, yPos);
      yPos += 10;
      doc.text(`Total Scans: ${scansToExport.length}`, 10, yPos);
      yPos += 10;
      
      scansToExport.forEach(scan => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        doc.text(`Scan: ${scan.scannedRange} (${scan.scanDate.toLocaleDateString()})`, 10, yPos);
        yPos += 10;
        
        scan.devices.forEach(device => {
          if (yPos > 280) { doc.addPage(); yPos = 20; }
          doc.text(`- ${device.name} (${device.ipAddress}) - Risk: ${device.riskLevel}`, 15, yPos);
          yPos += 8;
        });
        yPos += 5;
      });
      
      doc.save(`scan_reports_batch.pdf`);
    }
    
    let msg = t('export_success').replace('{format}', format.toUpperCase()).replace('{count}', selectedForExport.length.toString());
    if(msg === 'export_success') msg = `Exported ${selectedForExport.length} scan(s) as ${format.toUpperCase()}`;
    toast.success(msg);
  };

  const handleExportJSON = () => {
    if (!selectedScan) return;
    const dataStr = JSON.stringify(selectedScan.devices, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `scan_report_${selectedScan.id}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast.success(t('reportExported'));
  };

  const handleExportCSV = () => {
    if (!selectedScan || selectedScan.devices.length === 0) return;
    
    const headers = ['ID', 'Name', 'IP Address', 'MAC Address', 'Device Type', 'Risk Level', 'Open Ports'];
    const rows = selectedScan.devices.map(device => [
      device.id,
      device.name,
      device.ipAddress,
      device.macAddress,
      device.deviceType,
      device.riskLevel,
      device.openPorts.join(';')
    ]);
    
    const csvContent = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(','))
    ].join('\n');
    
    const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
    const exportFileDefaultName = `scan_report_${selectedScan.id}.csv`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast.success(t('reportExported'));
  };

  const handleExportPDF = () => {
    if (!selectedScan) return;
    const doc = new jsPDF();
    doc.text('Network Scan Report', 10, 10);
    doc.text(`Scanned Range: ${selectedScan.scannedRange}`, 10, 20);
    doc.text(`Total Devices: ${selectedScan.devices.length}`, 10, 30);
    
    let yPos = 40;
    selectedScan.devices.forEach((device, index) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${index + 1}. ${device.name} (${device.ipAddress}) - Risk: ${device.riskLevel}`, 10, yPos);
      yPos += 10;
    });
    
    doc.save(`scan_report_${selectedScan.id}.pdf`);
    toast.success(t('reportExported'));
  };

  // ==========================================
  // COMPARISON & FILTER UTILS (ส่วนเปรียบเทียบข้อมูลสแกนและล้างตัวกรอง)
  // ==========================================
  const toggleCompareMode = () => {
    const newCompareMode = !compareMode;
    setCompareMode(newCompareMode);
    setSelectedScans([]);
    
    if (newCompareMode) {
      toast.info(
        language === 'th'
          ? 'กรุณาเลือกการสแกน 2 รายการเพื่อเปรียบเทียบ'
          : 'Please select 2 scans to compare',
        { duration: 5000 }
      );
    }
  };

  const clearFilters = () => {
    setSearchIP('');
    setStartDate('');
    setEndDate('');
    setPortFilter('all');
  };

  const getComparisonData = () => {
    if (selectedScans.length !== 2) return null;

    const scan1 = scanHistory.find((s) => s.id === selectedScans[0]);
    const scan2 = scanHistory.find((s) => s.id === selectedScans[1]);

    if (!scan1 || !scan2) return null;

    // Calculate port differences and CVE changes
    const portChanges: Array<{
      device: Device;
      addedPorts: number[];
      removedPorts: number[];
      cveIncrease: number;
      cveDecrease: number;
    }> = [];

    scan2.devices.forEach((device2) => {
      const device1 = scan1.devices.find((d) => d.ipAddress === device2.ipAddress);
      if (device1) {
        const ports1 = new Set(device1.openPorts);
        const ports2 = new Set(device2.openPorts);
        
        const addedPorts = device2.openPorts.filter(p => !ports1.has(p));
        const removedPorts = device1.openPorts.filter(p => !ports2.has(p));
        
        // Calculate CVE changes
        const cves1 = device1.openPorts.flatMap(port => getPortInfo(port)?.cves || []);
        const cves2 = device2.openPorts.flatMap(port => getPortInfo(port)?.cves || []);
        const cveIncrease = Math.max(0, cves2.length - cves1.length);
        const cveDecrease = Math.max(0, cves1.length - cves2.length);
        
        if (addedPorts.length > 0 || removedPorts.length > 0 || cveIncrease > 0 || cveDecrease > 0) {
          portChanges.push({
            device: device2,
            addedPorts,
            removedPorts,
            cveIncrease,
            cveDecrease,
          });
        }
      }
    });

    const devices1IPs = new Set(scan1.devices.map((d) => d.ipAddress));
    const devices2IPs = new Set(scan2.devices.map((d) => d.ipAddress));

    const newDevices = scan2.devices.filter((d) => !devices1IPs.has(d.ipAddress));
    const removedDevices = scan1.devices.filter((d) => !devices2IPs.has(d.ipAddress));

    // Calculate total CVE changes
    const totalCVEIncrease = portChanges.reduce((sum, change) => sum + change.cveIncrease, 0);
    const totalCVEDecrease = portChanges.reduce((sum, change) => sum + change.cveDecrease, 0);

    return { 
      scan1, 
      scan2, 
      newDevices, 
      removedDevices, 
      portChanges,
      totalCVEIncrease,
      totalCVEDecrease,
    };
  };

  const comparisonData = getComparisonData();

  const hasActiveFilters = searchIP || startDate || endDate || portFilter !== 'all';
  const selectedVisibleExportCount = scanHistory.filter((scan) =>
    selectedForExport.includes(scan.id),
  ).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ==========================================
          HEADER SECTION (ส่วนหัวข้อหน้าประวัติ)
          ========================================== */}
      {/* ==========================================
          HEADER ACTIONS (ส่วนปุ่มดำเนินการด้านบน: เปรียบเทียบ, ส่งออก)
          ========================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('scanHistory')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('results_based_on_ip_range')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={compareMode ? 'default' : 'outline'}
            onClick={toggleCompareMode}
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            {compareMode ? t('cancel_compare') : t('compare')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={selectedForExport.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('exportReport')} {selectedForExport.length > 0 ? `(${selectedForExport.length})` : ''}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExportSelected('json')}>{t('export_json')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportSelected('csv')}>{t('export_csv')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportSelected('pdf')}>{t('export_pdf')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {compareMode && selectedScans.length === 2 && (
            <Button onClick={handleCompare}>
              {t('compareScans')} ({selectedScans.length})
            </Button>
          )}
        </div>
      </div>

      {/* ==========================================
          FILTER PANEL (แผงตั้งค่าการกรองข้อมูล)
          ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            {t('filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('search_ip_range')}</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. 192.168.1"
                  value={searchIP}
                  onChange={(e) => setSearchIP(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('start_date')}</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('end_date')}</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('port_type')}</label>
              <Select value={portFilter} onValueChange={setPortFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('all_ports')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_ports')}</SelectItem>
                  <SelectItem value="dangerous">{t('dangerous_ports_only')}</SelectItem>
                  <SelectItem value="safe">{t('safe_ports_only')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                {t('showing_results')} {scanHistory.length} {t('of')} {allScanHistory.length} {t('scans')}
              </span>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t('clear_filters')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==========================================
          SCAN HISTORY LIST (รายการประวัติการสแกน)
          ========================================== */}
      {scanHistory.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {hasActiveFilters ? t('no_scans_match_filters') : t('noHistory')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {!compareMode && (
            <div className="flex items-center px-4 py-2">
              <Checkbox
                id="select-all-scans"
                checked={scanHistory.length > 0 && selectedVisibleExportCount === scanHistory.length}
                onCheckedChange={(checked) => handleSelectAllForExport(checked === true)}
              />
              <label htmlFor="select-all-scans" className="ml-2 text-sm font-medium cursor-pointer">
                {t('select_all') || 'Select All'}
              </label>
            </div>
          )}
          {scanHistory.map((scan) => {
            const highRiskCount = scan.devices.filter(
              (d) => d.riskLevel === 'high' || d.riskLevel === 'critical'
            ).length;
            const isSelectedForCompare = selectedScans.includes(scan.id);
            const isSelectedForExport = selectedForExport.includes(scan.id);

            return (
              <Card
                key={scan.id}
                className={`transition-all cursor-pointer ${
                  compareMode && isSelectedForCompare
                    ? 'border-primary border-2'
                    : compareMode
                    ? 'hover:border-primary/50'
                    : isSelectedForExport
                    ? 'border-primary/50 bg-primary/5'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => {
                  if (compareMode) {
                    toggleSelectScan(scan.id);
                  } else {
                    handleViewScan(scan);
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div onClick={(e) => e.stopPropagation()} className="mt-1 flex items-center justify-center">
                        {compareMode ? (
                          <Checkbox
                            checked={isSelectedForCompare}
                            onCheckedChange={() => toggleSelectScan(scan.id)}
                            disabled={!isSelectedForCompare && selectedScans.length >= 2}
                          />
                        ) : (
                          <Checkbox
                            checked={isSelectedForExport}
                            onCheckedChange={(checked) => {
                              if (checked === 'indeterminate') return;
                              toggleSelectForExport(scan.id);
                            }}
                          />
                        )}
                      </div>
                      <div className="space-y-1 flex-1">
                        <CardTitle className="text-xl">
                          {scan.scannedRange}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {scan.scanDate.toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {scan.scanDate.toLocaleTimeString()}
                          </span>
                          <span>{t('duration')}: {scan.duration}s</span>
                        </div>
                      </div>
                    </div>
                    {!compareMode && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewScan(scan);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        {t('viewDetails')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('devicesFound')}
                      </div>
                      <div className="text-2xl font-bold">{scan.devices.length}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('highRiskDevices')}
                      </div>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {highRiskCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t('safe_devices')}</div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {scan.devices.length - highRiskCount}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ==========================================
          VIEW SCAN DIALOG (ป๊อปอัพแสดงรายละเอียดเมื่อคลิกดูประวัติแต่ละอัน)
          ========================================== */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {selectedScan?.scannedRange} - {selectedScan?.scanDate.toLocaleString()}
            </DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="diagram">{t('networkMap')}</TabsTrigger>
              <TabsTrigger value="devices">{t('connectedDevices')}</TabsTrigger>
            </TabsList>
            <TabsContent value="diagram">
              <ScrollArea className="h-[60vh]">
                {selectedScan && (
                  <div className="p-4">
                    <NetworkGraph 
                      devices={selectedScan.devices} 
                      onDeviceClick={(device) => navigate(`/device?id=${device.id}&scanId=${selectedScan.id}`)}
                    />
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="devices">
              <ScrollArea className="h-[60vh]">
                {selectedScan && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                    {selectedScan.devices.map((device) => (
                      <DeviceCard 
                        key={device.id} 
                        device={device} 
                        onClick={() => navigate(`/device?id=${device.id}&scanId=${selectedScan.id}`)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ==========================================
          COMPARE SCANS DIALOG (ป๊อปอัพเปรียบเทียบผลการสแกน 2 อัน)
          ========================================== */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('compareScans')}</DialogTitle>
          </DialogHeader>
          {comparisonData && (
            <div className="space-y-4">
              {/* Scan Info */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('scan_1')}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="font-semibold">{comparisonData.scan1.scannedRange}</div>
                    <div className="text-muted-foreground">
                      {comparisonData.scan1.scanDate.toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">
                      {comparisonData.scan1.devices.length} {t('devices')}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('scan_2')}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="font-semibold">{comparisonData.scan2.scannedRange}</div>
                    <div className="text-muted-foreground">
                      {comparisonData.scan2.scanDate.toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">
                      {comparisonData.scan2.devices.length} {t('devices')}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Overview Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('overview')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                        +{comparisonData.newDevices.length}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {t('newDevices')}
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                        -{comparisonData.removedDevices.length}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {t('removedDevices')}
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                        {comparisonData.portChanges.length}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {t('port_changes')}
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        +{comparisonData.totalCVEIncrease}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {t('cve_increase')}
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        -{comparisonData.totalCVEDecrease}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {t('cve_decrease')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="ports" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="ports">
                    {t('port_changes')} ({comparisonData.portChanges.length})
                  </TabsTrigger>
                  <TabsTrigger value="new">
                    {t('newDevices')} ({comparisonData.newDevices.length})
                  </TabsTrigger>
                  <TabsTrigger value="removed">
                    {t('removedDevices')} ({comparisonData.removedDevices.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ports">
                  <ScrollArea className="h-[50vh]">
                    <div className="space-y-4 p-4">
                      {comparisonData.portChanges.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          {t('no_port_changes_detected')}
                        </p>
                      ) : (
                        comparisonData.portChanges.map((change, idx) => (
                          <Card key={idx}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <CardTitle className="text-base">{change.device.name}</CardTitle>
                                  <p className="text-sm text-muted-foreground">{change.device.ipAddress}</p>
                                </div>
                                <Badge variant={change.device.riskLevel === 'critical' || change.device.riskLevel === 'high' ? 'destructive' : 'secondary'}>
                                  {t(change.device.riskLevel)}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {change.addedPorts.length > 0 && (
                                <div>
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    {t('added_ports')} ({change.addedPorts.length}):
                                  </span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {change.addedPorts.map(port => {
                                      const portInfo = getPortInfo(port);
                                      return (
                                        <Badge key={port} variant={portInfo ? 'destructive' : 'outline'}>
                                          {port} {portInfo && `(${portInfo.service})`}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {change.removedPorts.length > 0 && (
                                <div>
                                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                    {t('removed_ports')} ({change.removedPorts.length}):
                                  </span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {change.removedPorts.map(port => {
                                      const portInfo = getPortInfo(port);
                                      return (
                                        <Badge key={port} variant="outline" className="opacity-60">
                                          {port} {portInfo && `(${portInfo.service})`}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {(change.cveIncrease > 0 || change.cveDecrease > 0) && (
                                <div className="flex gap-4 text-sm">
                                  {change.cveIncrease > 0 && (
                                    <span className="text-orange-600 dark:text-orange-400">
                                      CVE +{change.cveIncrease}
                                    </span>
                                  )}
                                  {change.cveDecrease > 0 && (
                                    <span className="text-blue-600 dark:text-blue-400">
                                      CVE -{change.cveDecrease}
                                    </span>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="new">
                  <ScrollArea className="h-[50vh]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                      {comparisonData.newDevices.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 col-span-2">
                          {t('no_new_devices_detected')}
                        </p>
                      ) : (
                        comparisonData.newDevices.map((device) => (
                          <DeviceCard key={device.id} device={device} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="removed">
                  <ScrollArea className="h-[50vh]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                      {comparisonData.removedDevices.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 col-span-2">
                          {t('no_removed_devices_detected')}
                        </p>
                      ) : (
                        comparisonData.removedDevices.map((device) => (
                          <DeviceCard key={device.id} device={device} />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
