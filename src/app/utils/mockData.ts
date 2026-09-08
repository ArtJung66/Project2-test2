import { Device, ScanResult, PortInfo, RiskLevel, CVE } from '../types/network';
import { getCvssSeverity } from './cvss';

export const dangerousPorts: PortInfo[] = [
  { 
    port: 21, 
    service: 'FTP', 
    risk: 'high', 
    description: 'Unencrypted file transfer protocol',
    cves: [
      { id: 'CVE-2023-1234', severity: getCvssSeverity(7.5), description: 'Buffer overflow in FTP service', cvss: 7.5 },
      { id: 'CVE-2022-5678', severity: getCvssSeverity(6.5), description: 'Authentication bypass', cvss: 6.5 },
    ]
  },
  { 
    port: 23, 
    service: 'Telnet', 
    risk: 'critical', 
    description: 'Unencrypted remote access',
    cves: [
      { id: 'CVE-2023-9999', severity: getCvssSeverity(9.8), description: 'Remote code execution', cvss: 9.8 },
      { id: 'CVE-2023-8888', severity: getCvssSeverity(8.1), description: 'Credential leak', cvss: 8.1 },
    ]
  },
  { 
    port: 445, 
    service: 'SMB', 
    risk: 'high', 
    description: 'Vulnerable to ransomware attacks',
    cves: [
      { id: 'CVE-2023-4567', severity: getCvssSeverity(9.3), description: 'EternalBlue exploit', cvss: 9.3 },
      { id: 'CVE-2022-3456', severity: getCvssSeverity(8.8), description: 'SMB remote code execution', cvss: 8.8 },
    ]
  },
  { 
    port: 3389, 
    service: 'RDP', 
    risk: 'medium', 
    description: 'Remote desktop - ensure strong password',
    cves: [
      { id: 'CVE-2023-7890', severity: getCvssSeverity(6.7), description: 'BlueKeep vulnerability', cvss: 6.7 },
    ]
  },
  { 
    port: 1433, 
    service: 'MSSQL', 
    risk: 'high', 
    description: 'Database exposed to network',
    cves: [
      { id: 'CVE-2023-2345', severity: getCvssSeverity(7.8), description: 'SQL injection vulnerability', cvss: 7.8 },
    ]
  },
  { 
    port: 3306, 
    service: 'MySQL', 
    risk: 'high', 
    description: 'Database exposed to network',
    cves: [
      { id: 'CVE-2023-6789', severity: getCvssSeverity(7.5), description: 'Authentication bypass', cvss: 7.5 },
      { id: 'CVE-2022-4321', severity: getCvssSeverity(6.3), description: 'Privilege escalation', cvss: 6.3 },
    ]
  },
  { 
    port: 5432, 
    service: 'PostgreSQL', 
    risk: 'medium', 
    description: 'Database service',
    cves: [
      { id: 'CVE-2023-5432', severity: getCvssSeverity(6.1), description: 'SQL injection', cvss: 6.1 },
    ]
  },
  { 
    port: 6379, 
    service: 'Redis', 
    risk: 'medium', 
    description: 'Cache service exposed',
    cves: [
      { id: 'CVE-2023-3210', severity: getCvssSeverity(6.5), description: 'Unauthenticated access', cvss: 6.5 },
    ]
  },
];

export const safePorts = [80, 443, 22, 53, 67, 68];

function calculateRiskLevel(ports: number[]): RiskLevel {
  const dangerousPortNumbers = dangerousPorts.map(p => p.port);
  const hasCritical = ports.some(p => {
    const portInfo = dangerousPorts.find(dp => dp.port === p);
    return portInfo?.risk === 'critical';
  });
  
  if (hasCritical) return 'critical';
  
  const hasHigh = ports.some(p => {
    const portInfo = dangerousPorts.find(dp => dp.port === p);
    return portInfo?.risk === 'high';
  });
  
  if (hasHigh) return 'high';
  
  const hasMedium = ports.some(p => {
    const portInfo = dangerousPorts.find(dp => dp.port === p);
    return portInfo?.risk === 'medium';
  });
  
  if (hasMedium) return 'medium';
  
  const hasDangerousPorts = ports.some(p => dangerousPortNumbers.includes(p));
  if (hasDangerousPorts) return 'low';
  
  return 'safe';
}

// ==========================================
// 🚨 FOR BACKEND DEVELOPERS 🚨
// ข้อมูลเหล่านี้คือ Mock Data (ข้อมูลจำลอง) เพื่อใช้สำหรับการพัฒนา UI ไปก่อน
// Backend ควรสร้าง API ขึ้นมาเพื่อแทนที่ฟังก์ชันเหล่านี้
// เช่น การสแกนเครือข่ายจริงๆ จะได้ข้อมูล Device[] กลับมา
// ==========================================

export function generateMockDevices(): Device[] {
  const devices: Device[] = [
    {
      id: '1',
      name: 'Router',
      ipAddress: '192.168.1.1',
      macAddress: '00:1A:2B:3C:4D:5E',
      openPorts: [80, 443, 53],
      riskLevel: 'safe',
      lastScan: new Date(),
      deviceType: 'Router',
    },
    {
      id: '2',
      name: 'Desktop-PC',
      ipAddress: '192.168.1.100',
      macAddress: '00:1A:2B:3C:4D:5F',
      openPorts: [80, 443, 3389, 445],
      riskLevel: 'high',
      lastScan: new Date(),
      deviceType: 'Computer',
    },
    {
      id: '3',
      name: 'Server-01',
      ipAddress: '192.168.1.50',
      macAddress: '00:1A:2B:3C:4D:60',
      openPorts: [22, 80, 443, 3306, 23],
      riskLevel: 'critical',
      lastScan: new Date(),
      deviceType: 'Server',
    },
    {
      id: '4',
      name: 'Laptop-Alice',
      ipAddress: '192.168.1.101',
      macAddress: '00:1A:2B:3C:4D:61',
      openPorts: [80, 443],
      riskLevel: 'safe',
      lastScan: new Date(),
      deviceType: 'Laptop',
    },
    {
      id: '5',
      name: 'Smart-TV',
      ipAddress: '192.168.1.150',
      macAddress: '00:1A:2B:3C:4D:62',
      openPorts: [80, 443, 8080],
      riskLevel: 'low',
      lastScan: new Date(),
      deviceType: 'Smart TV',
    },
    {
      id: '6',
      name: 'IoT-Camera',
      ipAddress: '192.168.1.200',
      macAddress: '00:1A:2B:3C:4D:63',
      openPorts: [80, 554, 23],
      riskLevel: 'critical',
      lastScan: new Date(),
      deviceType: 'Camera',
    },
  ];

  devices.forEach(device => {
    device.riskLevel = calculateRiskLevel(device.openPorts);
  });

  return devices;
}

// ==========================================
// 🚨 FOR BACKEND DEVELOPERS 🚨
// ข้อมูลจำลองประวัติการสแกน ควรสลับเป็น API
// GET /api/history (คืนค่า Array ของ ScanResult)
// ==========================================

export function generateMockScanHistory(): ScanResult[] {
  const now = new Date();
  
  return [
    {
      id: '1',
      scanDate: new Date(now.getTime() - 3600000), // 1 hour ago
      devices: generateMockDevices(),
      duration: 12,
      scannedRange: '192.168.1.0/24',
    },
    {
      id: '2',
      scanDate: new Date(now.getTime() - 86400000), // 1 day ago
      devices: generateMockDevices().slice(0, 5),
      duration: 10,
      scannedRange: '192.168.1.0/24',
    },
    {
      id: '3',
      scanDate: new Date(now.getTime() - 604800000), // 1 week ago
      devices: generateMockDevices().slice(0, 4),
      duration: 8,
      scannedRange: '192.168.1.0/24',
    },
    {
      id: '4',
      scanDate: new Date(now.getTime() - 2592000000), // 30 days ago
      devices: generateMockDevices().slice(0, 3),
      duration: 7,
      scannedRange: '192.168.1.0/24',
    },
    {
      id: '5',
      scanDate: new Date(now.getTime() - 5184000000), // 60 days ago
      devices: generateMockDevices().slice(0, 3),
      duration: 9,
      scannedRange: '10.0.0.0/24',
    },
  ];
}

export function getPortInfo(port: number): PortInfo | null {
  return dangerousPorts.find(p => p.port === port) || null;
}
