import { useState, useEffect, useRef } from 'react';
import { Search, Download, Save, Zap, ScanLine, StopCircle, Mic, Check, X, Radar } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useLanguage } from '../contexts/LanguageContext';
import { NetworkGraph } from '../components/NetworkGraph';
import { DeviceDetailsDialog } from '../components/DeviceDetailsDialog';
import { generateMockDevices } from '../utils/mockData';
import { Device } from '../types/network';
import { toast } from 'sonner';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { jsPDF } from 'jspdf';
import {
  clearLatestScannerState,
  getLatestScannerState,
  saveLatestScannerState as saveLatestScannerMemoryState,
} from '../utils/scannerState';
import {
  resetGlobalScanProgress,
  setGlobalScanProgress,
} from '../utils/scanProgressStore';
import type { LatestScannerState } from '../utils/scannerState';

type ScanType = 'basic' | 'full' | 'discovery';
const HOST_DISCOVERY_API_BASE = import.meta.env.VITE_HOST_DISCOVERY_API_BASE ?? 'http://localhost:4000';
const FULL_SCAN_PORT_RANGE = import.meta.env.VITE_FULL_SCAN_PORT_RANGE ?? '1-10000';
const DISCOVERY_TIMEOUT_MS = Number(import.meta.env.VITE_DISCOVERY_TIMEOUT_MS ?? 1500);

function normalizeDiscoveryTarget(target: string) {
  if (!target.trim()) return '';

  return target
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.includes('/') ? item : `${item}/32`)
    .join(', ');
}

function inferDeviceType(device: Device) {
  const currentType = device.deviceType?.trim();
  if (currentType && currentType.toLowerCase() !== 'unknown host') return currentType;

  const openPorts = device.openPorts ?? [];
  const serviceText = (device.services ?? [])
    .map((service) => [service.name, service.product, service.extraInfo, ...(service.cpe ?? [])].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();

  if (serviceText.includes('apple') || serviceText.includes('mac os') || serviceText.includes('macos')) return 'macOS Host';
  if (serviceText.includes('microsoft') || serviceText.includes('windows')) return 'Windows Host';
  if (serviceText.includes('linux') || serviceText.includes('ubuntu') || serviceText.includes('debian')) return 'Linux Host';
  if (openPorts.includes(5000) && openPorts.includes(7000)) return 'macOS/AirPlay Host';
  if (openPorts.includes(3389)) return 'Windows/RDP Host';
  if (openPorts.includes(445) || openPorts.includes(139)) return 'Windows Host';
  if (openPorts.includes(22)) return 'SSH Host';
  if (openPorts.includes(80) || openPorts.includes(443) || openPorts.includes(8080) || openPorts.includes(8443)) return 'Web Service';

  return currentType || 'Unknown Host';
}

function normalizeDevice(device: Device): Device {
  const normalizedDevice = {
    ...device,
    lastScan: new Date(device.lastScan),
    riskLevel: device.riskLevel ?? 'safe',
  };

  return {
    ...normalizedDevice,
    deviceType: inferDeviceType(normalizedDevice),
  };
}

function getScanErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Backend is not running at http://localhost:4000. Run npm.cmd run dev and keep that terminal open.';
  }
  return error instanceof Error ? error.message : 'unknown error';
}

const reportExposureRules: Record<number, { service: string; level: 'High' | 'Medium' | 'Low'; recommendation: string }> = {
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

function getReportExposure(port: number) {
  return reportExposureRules[port] ?? {
    service: 'Unknown service',
    level: 'Low' as const,
    recommendation: 'Verify that this service is required and restricted by firewall policy.',
  };
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// ==========================================
// DISCOVERY CACHE INTERFACE
// Interface สำหรับเก็บข้อมูลการค้นพบโฮสต์ที่จะถูก Cache ไว้
// ใช้เพื่อข้ามขั้นตอนการค้นหาโฮสต์ในการสแกนครั้งต่อไป
// ==========================================
interface DiscoveryCache {
  targetRange: string;              // ช่วง IP ที่ทำการสแกน (เช่น 192.168.1.0/24)
  timestamp: number;                // เวลาที่ทำการสแกน (Unix timestamp)
  devices: Device[];                // รายการอุปกรณ์ที่ค้นพบ (เฉพาะข้อมูลพื้นฐาน)
}

interface NetworkAdapter {
  name: string;
  address: string;
  subnet: string;
  isVirtual: boolean;
  preferredForLanScan: boolean;
}

export function Scanner() {
  const { t, language } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanType, setScanType] = useState<ScanType>('basic');
  const [devices, setDevices] = useState<Device[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [targetIp, setTargetIp] = useState('');
  const [networkAdapters, setNetworkAdapters] = useState<NetworkAdapter[]>([]);
  const [sourceAddress, setSourceAddress] = useState('');
  const activeScanSourceRef = useRef<EventSource | null>(null);
  const scanCanceledRef = useRef(false);

  // ==========================================
  // DISCOVERY CACHE STATE
  // 🚨 BACKEND DEV NOTE:
  // State นี้เก็บผลลัพธ์จาก Host Discovery scan เพื่อใช้ซ้ำในการสแกนครั้งต่อไป
  // เมื่อต่อ Backend จริง ควรเก็บ Cache นี้ไว้ที่ฝั่ง Server (เช่น Redis, Database)
  // และเรียกผ่าน API GET /api/scan/discovery-cache?target={targetIp}
  // ==========================================
  const [discoveryCache, setDiscoveryCache] = useState<DiscoveryCache | null>(null);

  const saveLatestScannerState = (
    nextDevices: Device[],
    nextScanType: ScanType,
    nextDiscoveryCache: DiscoveryCache | null = discoveryCache,
    nextTargetIp = targetIp,
  ) => {
    const state: LatestScannerState = {
      targetIp: nextTargetIp,
      scanType: nextScanType,
      timestamp: Date.now(),
      devices: nextDevices,
      discoveryCache: nextDiscoveryCache,
    };
    saveLatestScannerMemoryState(state);
  };

  // ==========================================
  // LOAD DISCOVERY CACHE FROM LOCALSTORAGE ON MOUNT
  // โหลดข้อมูล Discovery Cache จาก LocalStorage เมื่อ Component ถูกสร้าง
  // 🚨 BACKEND DEV NOTE:
  // ในการทำงานจริง ควรเปลี่ยนเป็นการเรียก API แทน
  // ==========================================
  useEffect(() => {
    try {
      localStorage.removeItem('network_scanner_latest_state');
      localStorage.removeItem('network_discovery_cache');

      const latestState = getLatestScannerState();
      if (latestState) {
        const parsedLatest = latestState as LatestScannerState;
        setTargetIp(parsedLatest.targetIp);
        setScanType(parsedLatest.scanType);
        setDevices(parsedLatest.devices.map(normalizeDevice));
        if (parsedLatest.discoveryCache) {
          setDiscoveryCache({
            ...parsedLatest.discoveryCache,
            devices: parsedLatest.discoveryCache.devices.map(normalizeDevice),
          });
        }
        return;
      }
    } catch (e) {
      console.error('Failed to load discovery cache:', e);
    }
  }, [language]);

  // เลือก LAN/Wi-Fi จริงเป็นค่าเริ่มต้น และไม่ใช้ VPN/Virtual adapter ในการสแกน
  useEffect(() => {
    let canceled = false;

    const loadNetworkAdapters = async () => {
      try {
        const response = await fetch(`${HOST_DISCOVERY_API_BASE}/api/network/adapters`);
        if (!response.ok) throw new Error('Unable to load network adapters');
        const result = await response.json();
        const adapters = (result.adapters ?? []) as NetworkAdapter[];
        if (canceled) return;
        setNetworkAdapters(adapters);
        const localAdapter = adapters.find((adapter) => adapter.preferredForLanScan && !adapter.isVirtual);
        if (localAdapter) {
          setSourceAddress(localAdapter.address);
          setTargetIp((current) => current || localAdapter.subnet);
        }
      } catch (error) {
        console.warn('Unable to load local network adapters:', error);
      }
    };

    void loadNetworkAdapters();
    return () => { canceled = true; };
  }, []);

  // ==========================================
  // HOST DISCOVERY HANDLER (ฟังก์ชันสำหรับค้นหาโฮสต์และพอร์ตที่เปิด)
  // 🚨 BACKEND DEV NOTE:
  // ฟังก์ชันนี้ทำการสแกนเฉพาะ Host Discovery (ค้นหาโฮสต์ที่ทำงานและ Port ที่เปิด)
  // ไม่รวมการวิเคราะห์ช่องโหว่ เพื่อให้รวดเร็ว
  // API Endpoint: POST /api/scan/discovery
  // Request Body: { "target": "192.168.1.0/24" }
  // Response: { "devices": [...], "timestamp": 1234567890 }
  // ==========================================
  const handleHostDiscovery = () => {
    setScanType('discovery');
    setIsScanning(true);
    setScanProgress(0);

    // 💡 BACKEND INTEGRATION POINT 💡
    // เรียก API: POST /api/scan/discovery
    // Body: { "target": targetIp }
    // Response ควรมี: { devices: Device[], timestamp: number }
    //
    // การทำงาน:
    // 1. Backend ทำการ Host Discovery (ping sweep, port scan)
    // 2. ส่งข้อมูลพื้นฐานกลับมา (IP, hostname, MAC, open ports)
    // 3. ไม่ทำการวิเคราะห์ช่องโหว่ (vulnerability analysis)

    // โค้ดจำลอง (Mock) การทำงาน
    const duration = 200; // Discovery เร็วกว่า Full Scan
    const increment = 15;

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);

          // สร้างข้อมูล Mock โดยไม่มี Vulnerability Data
          const mockDevices = generateMockDevices();
          const discoveryResults = mockDevices.map(device => ({
            ...device,
            riskLevel: 'safe' as const, // Discovery ยังไม่วิเคราะห์ความเสี่ยง
          }));

          // บันทึกผลลัพธ์ลง Cache
          const cache: DiscoveryCache = {
            targetRange: targetIp,
            timestamp: Date.now(),
            devices: discoveryResults,
          };

          setDiscoveryCache(cache);
          setDevices(discoveryResults);

          // 💡 BACKEND INTEGRATION POINT 💡
          // บันทึก Cache ลง LocalStorage (ในการทำงานจริงควรบันทึกไว้ที่ Server)
          // API: POST /api/scan/discovery-cache
          // Body: cache object
          try {
            saveLatestScannerState(discoveryResults, 'discovery', cache);
          } catch (e) {
            console.error('Failed to save discovery cache:', e);
          }

          toast.success(
            language === 'th'
              ? `ค้นพบ ${discoveryResults.length} อุปกรณ์ - ข้อมูลถูกบันทึกไว้`
              : `${discoveryResults.length} hosts discovered - Results cached`
          );
          return 100;
        }
        return prev + increment;
      });
    }, duration);
  };

  // ==========================================
  // SCAN CONTROL HANDLERS (ส่วนควบคุมการสแกน)
  // 🚨 BACKEND DEV NOTE: ส่วนนี้ใช้สำหรับเรียก API เพื่อเริ่ม/หยุด การสแกน
  // ตอนนี้มีการตรวจสอบ Discovery Cache ก่อนทำการสแกน
  // หาก Cache มีอยู่และยังไม่หมดอายุ จะข้ามขั้นตอน Host Discovery
  // ==========================================
  const runBackendScanJob = async (
    mode: ScanType,
    body: Record<string, unknown>,
  ) => {
    const startResponse = await fetch(`${HOST_DISCOVERY_API_BASE}/api/scan/${mode}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!startResponse.ok) {
      const errorBody = await startResponse.json().catch(() => null);
      throw new Error(errorBody?.error ?? `${mode} scan failed with HTTP ${startResponse.status}`);
    }

    const { jobId } = await startResponse.json();
    scanCanceledRef.current = false;

    return await new Promise<any>((resolve, reject) => {
      const source = new EventSource(`${HOST_DISCOVERY_API_BASE}/api/scan/jobs/${jobId}/events`);
      activeScanSourceRef.current = source;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        source.close();
        if (activeScanSourceRef.current === source) activeScanSourceRef.current = null;
        callback();
      };

      source.addEventListener('update', (event) => {
        const job = JSON.parse((event as MessageEvent).data);
        const nextProgress = Math.max(0, Math.min(99, Math.round(job.progress ?? 0)));
        setScanProgress(nextProgress);
        setGlobalScanProgress({
          isScanning: true,
          progress: nextProgress,
          scanType: mode,
          message: job.message ?? '',
        });
      });

      source.addEventListener('complete', (event) => {
        const job = JSON.parse((event as MessageEvent).data);
        setScanProgress(100);
        setGlobalScanProgress({
          isScanning: true,
          progress: 100,
          scanType: mode,
          message: 'Scan completed',
        });
        finish(() => resolve(job.result));
      });

      source.addEventListener('error', (event) => {
        const messageEvent = event as MessageEvent;
        if (messageEvent.data) {
          const job = JSON.parse(messageEvent.data);
          finish(() => reject(new Error(job.error ?? job.message ?? 'Scan failed')));
          return;
        }

        if (source.readyState === EventSource.CLOSED) {
          finish(() => reject(new Error(scanCanceledRef.current ? 'Scan stopped by user' : 'Scan progress connection closed')));
        }
      });
    });
  };

  const handleBackendHostDiscovery = async () => {
    const normalizedTarget = normalizeDiscoveryTarget(targetIp);
    if (!normalizedTarget) {
      toast.error(language === 'th' ? 'กรุณาใส่ Target IP ก่อนเริ่มค้นหาโฮสต์' : 'Please enter a target IP before discovery.');
      return;
    }

    setScanType('discovery');
    setIsScanning(true);
    setScanProgress(0);
    setGlobalScanProgress({
      isScanning: true,
      progress: 0,
      scanType: 'discovery',
      message: `Preparing discovery for ${normalizedTarget}`,
    });

    try {
      const result = await runBackendScanJob('discovery', {
          target: normalizedTarget,
          timeoutMs: DISCOVERY_TIMEOUT_MS,
          concurrency: 64,
          sourceAddress,
      });

      const discoveryResults = (result.devices ?? []).map(normalizeDevice);

      const cache: DiscoveryCache = {
        targetRange: result.targetRange ?? normalizedTarget,
        timestamp: result.timestamp ?? Date.now(),
        devices: discoveryResults,
      };

      setDiscoveryCache(cache);
      setDevices(discoveryResults);
      saveLatestScannerState(discoveryResults, 'discovery', cache);
      setScanProgress(100);

      toast.success(
        language === 'th'
          ? `พบ ${discoveryResults.length} hosts และบันทึก cache แล้ว`
          : `${discoveryResults.length} hosts discovered - Results cached`
      );
    } catch (error) {
      console.error('Host discovery failed:', error);
      if (error instanceof Error && error.message === 'Scan stopped by user') return;
      toast.error(
        language === 'th'
          ? `Host Discovery ล้มเหลว: ${getScanErrorMessage(error)}`
          : `Host Discovery failed: ${getScanErrorMessage(error)}`
      );
    } finally {
      setIsScanning(false);
      resetGlobalScanProgress();
    }
  };

  const handleBackendBasicScan = async () => {
    const normalizedTarget = normalizeDiscoveryTarget(targetIp);
    if (!normalizedTarget) {
      toast.error(language === 'th' ? 'กรุณาใส่ Target IP ก่อนเริ่ม Basic Scan' : 'Please enter a target IP before Basic Scan.');
      return;
    }
    const hasValidCache = discoveryCache &&
                          discoveryCache.targetRange === normalizedTarget &&
                          (Date.now() - discoveryCache.timestamp) < 3600000;

    setScanType('basic');
    setIsScanning(true);
    setScanProgress(0);
    setGlobalScanProgress({
      isScanning: true,
      progress: 0,
      scanType: 'basic',
      message: `Preparing basic scan for ${normalizedTarget}`,
    });

    try {
      const result = await runBackendScanJob('basic', {
        target: hasValidCache ? undefined : normalizedTarget,
        devices: hasValidCache ? discoveryCache.devices : undefined,
        timeoutMs: 550,
        concurrency: 32,
        sourceAddress,
      });
      const scanResults = (result.devices ?? []).map(normalizeDevice);

      setDevices(scanResults);
      saveLatestScannerState(scanResults, 'basic');
      setScanProgress(100);

      toast.success(
        language === 'th'
          ? `Basic Scan สำเร็จ: ตรวจพบ ${scanResults.length} hosts`
          : `Basic scan completed: ${scanResults.length} hosts scanned`
      );
    } catch (error) {
      console.error('Basic scan failed:', error);
      if (error instanceof Error && error.message === 'Scan stopped by user') return;
      toast.error(
        language === 'th'
          ? `Basic Scan ล้มเหลว: ${getScanErrorMessage(error)}`
          : `Basic scan failed: ${getScanErrorMessage(error)}`
      );
    } finally {
      setIsScanning(false);
      resetGlobalScanProgress();
    }
  };

  const handleBackendFullScan = async () => {
    const normalizedTarget = normalizeDiscoveryTarget(targetIp);
    if (!normalizedTarget) {
      toast.error(language === 'th' ? 'กรุณาใส่ Target IP ก่อนเริ่ม Full Scan' : 'Please enter a target IP before Full Scan.');
      return;
    }
    const hasValidCache = discoveryCache &&
                          discoveryCache.targetRange === normalizedTarget &&
                          (Date.now() - discoveryCache.timestamp) < 3600000;

    setScanType('full');
    setIsScanning(true);
    setScanProgress(0);
    setGlobalScanProgress({
      isScanning: true,
      progress: 0,
      scanType: 'full',
      message: `Preparing full scan for ${normalizedTarget}`,
    });

    try {
      const result = await runBackendScanJob('full', {
        target: hasValidCache ? undefined : normalizedTarget,
        devices: hasValidCache ? discoveryCache.devices : undefined,
        ports: FULL_SCAN_PORT_RANGE,
        timeoutMs: 700,
        concurrency: 8,
        sourceAddress,
      });
      const scanResults = (result.devices ?? []).map(normalizeDevice);

      setDevices(scanResults);
      saveLatestScannerState(scanResults, 'full');
      setScanProgress(100);

      toast.success(
        language === 'th'
          ? `Full Scan สำเร็จ: ตรวจพบ ${scanResults.length} hosts`
          : `Full scan completed: ${scanResults.length} hosts scanned`
      );
    } catch (error) {
      console.error('Full scan failed:', error);
      if (error instanceof Error && error.message === 'Scan stopped by user') return;
      toast.error(
        language === 'th'
          ? `Full Scan ล้มเหลว: ${getScanErrorMessage(error)}`
          : `Full scan failed: ${getScanErrorMessage(error)}`
      );
    } finally {
      setIsScanning(false);
      resetGlobalScanProgress();
    }
  };

  const handleStartScan = (type: ScanType = 'basic') => {
    if (type === 'basic') {
      void handleBackendBasicScan();
      return;
    }
    if (type === 'full') {
      void handleBackendFullScan();
      return;
    }

    // ตรวจสอบว่ามี Discovery Cache หรือไม่
    const hasValidCache = discoveryCache &&
                          discoveryCache.targetRange === normalizeDiscoveryTarget(targetIp) &&
                          (Date.now() - discoveryCache.timestamp) < 3600000; // อายุไม่เกิน 1 ชั่วโมง

    if (hasValidCache && type !== 'discovery') {
      // 💡 BACKEND INTEGRATION POINT 💡
      // มี Cache อยู่แล้ว ข้ามขั้นตอน Discovery ไปทำ Vulnerability Analysis เลย
      // API: POST /api/scan/vulnerability-only
      // Body: { "type": "basic" | "full", "devices": discoveryCache.devices }
      // Response: { "devices": [...] } (พร้อม vulnerability data)

      toast.info(
        language === 'th'
          ? 'ใช้ข้อมูล Host Discovery ที่บันทึกไว้ - กำลังวิเคราะห์ช่องโหว่...'
          : 'Using cached discovery data - Analyzing vulnerabilities...'
      );
    }

    setScanType(type);
    setIsScanning(true);
    setScanProgress(0);

    // 💡 BACKEND INTEGRATION POINT 💡
    // 1. เรียก API: POST /api/scan/start
    //    Body: { "type": "basic" | "full", "target": targetIp, "skipDiscovery": hasValidCache }
    // 2. แนะนำให้ Backend ส่งค่า Progress กลับมาผ่าน WebSocket (ws://) หรือ Server-Sent Events (SSE)
    //    เพื่อให้แถบ Progress Bar (scanProgress) วิ่งตามความเป็นจริง
    // 3. เมื่อสแกนเสร็จ ให้ Backend ส่งผลลัพธ์มา (Array ของออบเจกต์ Device)

    // โค้ดจำลองสถานการณ์การโหลดชั่วคราว (Mocking API Call & Progress)
    // หาก hasValidCache = true จะใช้เวลาน้อยกว่าเพราะข้าม Discovery phase
    const baseDuration = hasValidCache ? 150 : 300; // ประหยัดเวลาถ้ามี cache
    const duration = type === 'full' ? baseDuration + 200 : baseDuration;
    const increment = type === 'full' ? 5 : 10;

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);

          // 💡 BACKEND INTEGRATION POINT 💡
          // ตรงนี้คือการนำข้อมูลจาก API /api/scan/result มาใส่ใน State setDevices(...)
          const mockDevices = generateMockDevices();
          const scanResults = type === 'full' ? mockDevices : mockDevices.slice(0, 4);
          setDevices(scanResults);

          toast.success(`${type === 'full' ? 'Full' : 'Basic'} ${t('scanCompleted')}`);
          return 100;
        }
        return prev + increment;
      });
    }, duration);
  };

  const handleStopScan = () => {
    scanCanceledRef.current = true;
    activeScanSourceRef.current?.close();
    activeScanSourceRef.current = null;
    setIsScanning(false);
    setScanProgress(0);
    resetGlobalScanProgress();
    // 💡 BACKEND INTEGRATION POINT 💡
    // เรียก API: POST /api/scan/stop เพื่อบังคับยกเลิกการสแกนบนเซิร์ฟเวอร์
    // Body: { "scanType": scanType } เพื่อระบุว่าเป็นการหยุดสแกนประเภทใด
    toast.info(
      language === 'th'
        ? `หยุด${scanType === 'discovery' ? 'การค้นหาโฮสต์' : scanType === 'full' ? 'การสแกนแบบเต็ม' : 'การสแกนแบบพื้นฐาน'}`
        : `${scanType === 'discovery' ? 'Discovery' : scanType === 'full' ? 'Full scan' : 'Basic scan'} stopped`
    );
  };

  // ==========================================
  // VOICE COMMAND HANDLERS (ส่วนควบคุมคำสั่งเสียง)
  // ==========================================
  const handleVoiceClick = () => {
    // Wake up the global VoiceCommandListener and show the GPT-like text input
    window.dispatchEvent(new CustomEvent('wake-up-mic'));
    toast.info(language === 'th' ? 'กำลังเปิดระบบรับเสียง...' : 'Starting voice listener...');
  };

  useEffect(() => {
    const handleVoiceIntent = (e: any) => {
      const intent = e.detail;
      if (intent === 'json') handleExportJSON();
      if (intent === 'csv') handleExportCSV();
      if (intent === 'pdf') handleExportPDF();
    };
    window.addEventListener('voice-intent-export', handleVoiceIntent);
    return () => window.removeEventListener('voice-intent-export', handleVoiceIntent);
  }, [devices]);

  // ==========================================
  // EXPORT & SAVE HANDLERS (ส่วนส่งออกข้อมูลและบันทึก)
  // ==========================================
  const createScanReport = () => {
    const generatedAt = new Date().toISOString();
    const totalOpenPorts = devices.reduce((sum, device) => sum + device.openPorts.length, 0);
    const exposureSummary = devices.flatMap((device) =>
      device.openPorts.map((port) => ({
        deviceName: device.name,
        ipAddress: device.ipAddress,
        port,
        ...getReportExposure(port),
      })),
    );

    return {
      id: Date.now(),
      generatedAt,
      date: new Date(generatedAt).toLocaleString(),
      targetIp,
      scanType,
      deviceCount: devices.length,
      totalOpenPorts,
      results: devices,
      exposureSummary,
    };
  };

  const handleExportJSON = () => {
    if (devices.length === 0) return;
    const dataStr = JSON.stringify(createScanReport(), null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `scan_report_${Date.now()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast.success(t('reportExported'));
  };

  const handleExportCSV = () => {
    if (devices.length === 0) return;
    
    const headers = ['Scan Type', 'Target', 'Device ID', 'Name', 'IP Address', 'MAC Address', 'Device Type', 'Risk Level', 'Open Ports', 'Exposure Summary'];
    const rows = devices.map(device => {
      const exposureSummary = device.openPorts
        .map((port) => {
          const exposure = getReportExposure(port);
          return `${port}/${exposure.service}/${exposure.level}`;
        })
        .join('; ');

      return [
        scanType,
        targetIp,
        device.id,
        device.name,
        device.ipAddress,
        device.macAddress,
        device.deviceType,
        device.riskLevel,
        device.openPorts.join(';'),
        exposureSummary,
      ];
    });
    
    const csvContent = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(','))
    ].join('\n');
    
    const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
    const exportFileDefaultName = `scan_report_${Date.now()}.csv`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast.success(t('reportExported'));
  };

  const handleExportPDF = () => {
    if (devices.length === 0) return;

    const report = createScanReport();
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    let yPos = 14;

    const addLine = (text: string, indent = 10) => {
      const wrapped = doc.splitTextToSize(text, 190 - indent);
      wrapped.forEach((line: string) => {
        if (yPos > pageHeight - 14) {
          doc.addPage();
          yPos = 14;
        }
        doc.text(line, indent, yPos);
        yPos += 7;
      });
    };

    doc.setFontSize(16);
    addLine('Network Scan Report');
    doc.setFontSize(10);
    addLine(`Generated: ${report.date}`);
    addLine(`Scan Type: ${report.scanType}`);
    addLine(`Target: ${report.targetIp || '-'}`);
    addLine(`Devices: ${report.deviceCount}`);
    addLine(`Total Open Ports: ${report.totalOpenPorts}`);
    yPos += 4;

    devices.forEach((device, index) => {
      const ports = device.openPorts.length > 0 ? device.openPorts.join(', ') : 'No open ports detected';
      addLine(`${index + 1}. ${device.name} (${device.ipAddress})`);
      addLine(`Type: ${device.deviceType} | Risk: ${device.riskLevel || 'safe'} | MAC: ${device.macAddress || '-'}`, 14);
      addLine(`Open Ports: ${ports}`, 14);

      device.openPorts.forEach((port) => {
        const exposure = getReportExposure(port);
        addLine(`Port ${port} ${exposure.service}: ${exposure.description} Recommendation: ${exposure.recommendation}`, 18);
      });

      yPos += 3;
    });

    doc.save(`scan_report_${Date.now()}.pdf`);
    toast.success(t('reportExported'));
    return;
  };

  const handleExportReport = () => {
    handleExportPDF();
  };

  const handleSaveResults = () => {
    if (devices.length === 0) return;
    
    // 💡 BACKEND INTEGRATION POINT 💡
    // 1. เรียก POST /api/history เพื่อบันทึกผลการสแกนรอบนี้ลงในฐานข้อมูล
    //    Body ควรเป็น { range: targetIp, devices: devices, date: ISOString }
    const payload = {
      ...createScanReport(),
      range: targetIp,
    };
    
    // โค้ดจำลองบันทึกลง LocalStorage (สามารถลบ/เปลี่ยนได้เมื่อต่อ Backend จริง)
    try {
      const existing = localStorage.getItem('network_scan_results');
      const parsed = existing ? JSON.parse(existing) : [];
      parsed.push(payload);
      localStorage.setItem('network_scan_results', JSON.stringify(parsed));
      toast.success(t('scanSaved'));
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // DEVICE INTERACTION HANDLERS (ส่วนจัดการการคลิกอุปกรณ์)
  // ==========================================
  const handleDeviceClick = (device: Device) => {
    setSelectedDevice(device);
    setDetailsOpen(true);
  };

  // ==========================================
  // DATA FILTERING & PROCESSING (ส่วนการกรองและการจัดการข้อมูล)
  // ==========================================
  // ==========================================
  // DATA FILTERING & PROCESSING (ส่วนการกรองและการจัดการข้อมูล)
  // ==========================================
  const filteredDevices = devices.filter(
    (device) =>
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ipAddress.includes(searchQuery)
  );

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'critical':
        return <Badge className="bg-red-950 text-red-100">{t('critical').toUpperCase()}</Badge>;
      case 'high':
        return <Badge className="bg-red-600 text-white">{t('high').toUpperCase()}</Badge>;
      case 'medium':
        return <Badge className="bg-orange-500 text-white">{t('medium').toUpperCase()}</Badge>;
      case 'low':
        return <Badge className="bg-green-600 text-white">{t('low').toUpperCase()}</Badge>;
      default:
        return <Badge className="bg-green-600 text-white">{t('safe').toUpperCase()}</Badge>;
    }
  };

  // Group devices by risk level
  const devicesByRisk = {
    critical: filteredDevices.filter(d => d.riskLevel === 'critical'),
    high: filteredDevices.filter(d => d.riskLevel === 'high'),
    medium: filteredDevices.filter(d => d.riskLevel === 'medium'),
    low: filteredDevices.filter(d => d.riskLevel === 'low'),
    safe: filteredDevices.filter(d => !d.riskLevel || d.riskLevel === 'safe')
  };

  const highRiskCount = devices.filter(
    (d) => d.riskLevel === 'high' || d.riskLevel === 'critical'
  ).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ==========================================
          PAGE HEADER (ส่วนหัวหน้าเว็บ)
          ========================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('scanner')}</h1>
          <p className="text-muted-foreground">{t('network_security_scanner_analyzer')}</p>
        </div>

        {/* Voice Command Button */}
        <Button onClick={handleVoiceClick} variant="outline" size="lg" className="gap-2">
          <Mic className="h-5 w-5" />
          {t('voiceCommand')}
        </Button>
      </div>

      {/* ==========================================
          SCAN CONTROLS PANEL (แผงควบคุมการสแกน)
          ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle>{t('scanControls')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {language === 'th' ? 'เครือข่ายสำหรับสแกน' : 'Scan network adapter'}
            </label>
            <select
              value={sourceAddress}
              disabled={isScanning || networkAdapters.length === 0}
              onChange={(event) => {
                const adapter = networkAdapters.find((item) => item.address === event.target.value);
                setSourceAddress(event.target.value);
                if (adapter) setTargetIp(adapter.subnet);
                setDiscoveryCache(null);
                setDevices([]);
                clearLatestScannerState();
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {networkAdapters.filter((adapter) => !adapter.isVirtual).map((adapter) => (
                <option key={adapter.address} value={adapter.address}>
                  {adapter.name} — {adapter.address} ({adapter.subnet})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {language === 'th'
                ? 'ระบบจะส่ง ping, port scan และ Nmap ออกผ่าน LAN/Wi-Fi ที่เลือก และไม่ใช้ Radmin VPN หรือ virtual adapter'
                : 'Ping, port scans, and Nmap use the selected LAN/Wi-Fi adapter; VPN and virtual adapters are excluded.'}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('targetIpRange')}</label>
            <Input
              value={targetIp}
              onChange={(e) => {
                setTargetIp(e.target.value);
                setDiscoveryCache(null);
                setDevices([]);
                localStorage.removeItem('network_discovery_cache');
                clearLatestScannerState();
              }}
              placeholder="192.168.1.0/24"
              disabled={isScanning}
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            {!isScanning ? (
              <>
                {/* ==========================================
                    HOST DISCOVERY BUTTON (ปุ่มค้นหาโฮสต์)
                    🎯 FEATURE: Host Discovery
                    - ค้นหาโฮสต์ที่ทำงานอยู่และ Port ที่เปิด
                    - ไม่วิเคราะห์ช่องโหว่ (รวดเร็ว)
                    - ผลลัพธ์จะถูก Cache ไว้ใช้ในการสแกนครั้งต่อไป
                    🚨 BACKEND DEV NOTE:
                    - API: POST /api/scan/discovery
                    - ผลลัพธ์ควรเก็บไว้ที่ Server (Redis/Database)
                    - อายุ Cache แนะนำ: 1 ชั่วโมง
                    ========================================== */}
                <Button
                  onClick={handleBackendHostDiscovery}
                  size="lg"
                  className="gap-2"
                  variant={discoveryCache && discoveryCache.targetRange === normalizeDiscoveryTarget(targetIp) ? "secondary" : "default"}
                >
                  <Radar className="h-5 w-5" />
                  {language === 'th' ? 'ค้นหาโฮสต์' : 'Host Discovery'}
                  {discoveryCache && discoveryCache.targetRange === normalizeDiscoveryTarget(targetIp) && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      <Check className="h-3 w-3 mr-1" />
                      {language === 'th' ? 'มีแคช' : 'Cached'}
                    </Badge>
                  )}
                </Button>

                <Button
                  onClick={() => handleStartScan('basic')}
                  size="lg"
                  className="gap-2"
                >
                  <Zap className="h-5 w-5" />
                  {t('basicScan')}
                </Button>
                <Button
                  onClick={() => handleStartScan('full')}
                  size="lg"
                  className="gap-2"
                >
                  <ScanLine className="h-5 w-5" />
                  {t('fullScan')}
                </Button>
              </>
            ) : (
              <Button onClick={handleStopScan} size="lg" variant="destructive" className="gap-2">
                <StopCircle className="h-5 w-5" />
                {t('stopScan')}
              </Button>
            )}
            <Button
              onClick={handleSaveResults}
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={devices.length === 0}
            >
              <Save className="h-5 w-5" />
              {t('saveResults')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={devices.length === 0}
                >
                  <Download className="h-5 w-5" />
                  {t('exportReport')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleExportJSON}>{t('export_json')}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>{t('export_csv')}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>{t('export_pdf')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Progress Bar */}
          {isScanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{t('scanning')}</span>
                  <Badge variant="outline">
                    {scanType === 'discovery'
                      ? (language === 'th' ? 'ค้นหาโฮสต์' : 'Host Discovery')
                      : scanType === 'full'
                      ? t('fullScan')
                      : t('basicScan')}
                  </Badge>
                </div>
                <span>{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} />
            </div>
          )}

          {/* ==========================================
              DISCOVERY CACHE INFO (ส่วนแสดงข้อมูล Discovery Cache)
              แสดงข้อมูลเมื่อมี Cache อยู่และตรงกับ targetIp ปัจจุบัน
              ========================================== */}
          {!isScanning && discoveryCache && discoveryCache.targetRange === normalizeDiscoveryTarget(targetIp) && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {language === 'th' ? 'พบข้อมูล Host Discovery' : 'Discovery Cache Available'}
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    {language === 'th'
                      ? `${discoveryCache.devices.length} อุปกรณ์ถูกค้นพบเมื่อ ${new Date(discoveryCache.timestamp).toLocaleString()}`
                      : `${discoveryCache.devices.length} hosts found at ${new Date(discoveryCache.timestamp).toLocaleString()}`}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {language === 'th'
                      ? 'การสแกนแบบ Basic หรือ Full จะใช้ข้อมูลนี้และข้ามขั้นตอนการค้นหาโฮสต์'
                      : 'Basic/Full scans will skip host discovery and use this data'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDiscoveryCache(null);
                    localStorage.removeItem('network_discovery_cache');
                    clearLatestScannerState();
                    toast.info(language === 'th' ? 'ลบข้อมูล Cache แล้ว' : 'Cache cleared');
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchDevices')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* ==========================================
          STATISTICS CARDS (ส่วนแสดงสถิติ)
          ========================================== */}
      {devices.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('totalDevices')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{devices.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {scanType === 'full' ? t('fullScan') : t('basicScan')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('high')} {t('riskLevel')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{highRiskCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('safe')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {devices.length - highRiskCount}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==========================================
          NETWORK VISUALIZATION (ส่วนกราฟเครือข่าย)
          ========================================== */}
      {devices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('networkMap')}</CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkGraph devices={devices} onDeviceClick={handleDeviceClick} />
          </CardContent>
        </Card>
      )}

      {/* ==========================================
          DEVICES TABLE (ตารางแสดงอุปกรณ์ที่สแกนเจอ)
          ========================================== */}
      {filteredDevices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('scannedDevices')} ({filteredDevices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('deviceName')}</TableHead>
                  <TableHead>{t('ipAddress')}</TableHead>
                  <TableHead>{t('openPorts')}</TableHead>
                  {scanType === 'full' && <TableHead>{t('vulnerabilityStatus')}</TableHead>}
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Critical Risk Devices */}
                {devicesByRisk.critical.length > 0 && (
                  <>
                    <TableRow className="bg-red-950/20">
                      <TableCell colSpan={scanType === 'full' ? 5 : 4} className="font-semibold text-red-600">
                        {t('criticalRiskDevices')}
                      </TableCell>
                    </TableRow>
                    {devicesByRisk.critical.map((device) => (
                      <TableRow key={device.id} className="hover:bg-red-950/10 border-l-4 border-l-red-950">
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {device.openPorts.slice(0, 3).map((port) => (
                              <Badge key={port} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                            {device.openPorts.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{device.openPorts.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {scanType === 'full' && <TableCell>{getRiskBadge(device.riskLevel)}</TableCell>}
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeviceClick(device)}
                          >
                            {t('details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {/* High Risk Devices */}
                {devicesByRisk.high.length > 0 && (
                  <>
                    <TableRow className="bg-red-600/20">
                      <TableCell colSpan={scanType === 'full' ? 5 : 4} className="font-semibold text-red-600">
                        {t('highRiskDevices')}
                      </TableCell>
                    </TableRow>
                    {devicesByRisk.high.map((device) => (
                      <TableRow key={device.id} className="hover:bg-red-600/10 border-l-4 border-l-red-600">
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {device.openPorts.slice(0, 3).map((port) => (
                              <Badge key={port} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                            {device.openPorts.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{device.openPorts.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {scanType === 'full' && <TableCell>{getRiskBadge(device.riskLevel)}</TableCell>}
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeviceClick(device)}
                          >
                            {t('details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {/* Medium Risk Devices */}
                {devicesByRisk.medium.length > 0 && (
                  <>
                    <TableRow className="bg-orange-500/20">
                      <TableCell colSpan={scanType === 'full' ? 5 : 4} className="font-semibold text-orange-600">
                        {t('mediumRiskDevices')}
                      </TableCell>
                    </TableRow>
                    {devicesByRisk.medium.map((device) => (
                      <TableRow key={device.id} className="hover:bg-orange-500/10 border-l-4 border-l-orange-500">
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {device.openPorts.slice(0, 3).map((port) => (
                              <Badge key={port} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                            {device.openPorts.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{device.openPorts.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {scanType === 'full' && <TableCell>{getRiskBadge(device.riskLevel)}</TableCell>}
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeviceClick(device)}
                          >
                            {t('details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}

                {/* Low Risk & Safe Devices */}
                {[...devicesByRisk.low, ...devicesByRisk.safe].length > 0 && (
                  <>
                    <TableRow className="bg-green-600/20">
                      <TableCell colSpan={scanType === 'full' ? 5 : 4} className="font-semibold text-green-600">
                        {t('lowSafeDevices')}
                      </TableCell>
                    </TableRow>
                    {[...devicesByRisk.low, ...devicesByRisk.safe].map((device) => (
                      <TableRow key={device.id} className="hover:bg-green-600/10 border-l-4 border-l-green-600">
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {device.openPorts.slice(0, 3).map((port) => (
                              <Badge key={port} variant="outline" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                            {device.openPorts.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{device.openPorts.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {scanType === 'full' && <TableCell>{getRiskBadge(device.riskLevel)}</TableCell>}
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeviceClick(device)}
                          >
                            {t('details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ==========================================
          DEVICE DETAILS MODAL (ส่วนหน้าต่างแสดงรายละเอียด)
          ========================================== */}
      <DeviceDetailsDialog
        device={selectedDevice}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
