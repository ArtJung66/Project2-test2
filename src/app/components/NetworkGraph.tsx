import { Device } from '../types/network';
import { useLanguage } from '../contexts/LanguageContext';
import { Router, Monitor, Server, Smartphone, Network } from 'lucide-react';

interface NetworkGraphProps {
  devices: Device[];
  onDeviceClick?: (device: Device) => void;
}

const getRiskBgClass = (risk: string): string => {
  switch (risk) {
    case 'critical': return 'bg-red-950'; // matches Dashboard & Scanner
    case 'high': return 'bg-red-600'; // matches Dashboard & Scanner
    case 'medium': return 'bg-orange-500'; // matches Dashboard & Scanner
    case 'low': return 'bg-green-600'; // matches Dashboard & Scanner
    case 'safe': return 'bg-green-600'; // matches Dashboard & Scanner
    default: return 'bg-gray-500';
  }
};

const getRiskStroke = (risk: string): string => {
  switch (risk) {
    case 'critical': return '#7f1d1d'; // bg-red-950 hex
    case 'high': return '#dc2626'; // bg-red-600 hex
    case 'medium': return '#f97316'; // bg-orange-500 hex
    case 'low': return '#16a34a'; // bg-green-600 hex
    case 'safe': return '#16a34a'; // bg-green-600 hex
    default: return '#94a3b8'; // default slate-400
  }
};

const getDeviceIcon = (type: string = '') => {
  const t = type.toLowerCase();
  const className = "w-8 h-8 text-[#00b0f0] dark:text-[#00b0f0] drop-shadow-sm";
  if (t.includes('router') || t.includes('gateway') || t.includes('firewall')) return <Router className={className} />;
  if (t.includes('switch') || t.includes('hub')) return <Network className={className} />;
  if (t.includes('server') || t.includes('nas')) return <Server className={className} />;
  if (t.includes('phone') || t.includes('mobile')) return <Smartphone className={className} />;
  return <Monitor className={className} />; // Default to monitor/PC
};

const RiskBadge = ({ risk }: { risk: string }) => {
  return (
    <div
      className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-800 shadow-sm ${getRiskBgClass(risk)} ${risk === 'critical' ? 'animate-pulse' : ''}`}
      title={`Risk: ${risk}`}
    />
  );
};

export function NetworkGraph({ devices, onDeviceClick }: NetworkGraphProps) {
  const { t } = useLanguage();

  // แบ่งอุปกรณ์ออกเป็นซ้าย-ขวา เพื่อจัด Layout แบบ Hierarchical Tree (สไตล์ Packet Tracer)
  const leftNodes: Device[] = [];
  const rightNodes: Device[] = [];

  const displayDevices = devices.length > 0 ? devices : [];

  displayDevices.forEach(d => {
    const type = d.deviceType.toLowerCase();
    if (type.includes('server') || type.includes('router') || type.includes('switch') || type.includes('gateway') || type.includes('firewall')) {
      rightNodes.push(d);
    } else {
      leftNodes.push(d);
    }
  });

  // ปรับสมดุลโหนดซ้ายขวาให้ดูเต็มจอ หากเอียงไปข้างใดข้างหนึ่งมากเกินไป
  if (leftNodes.length > 2 && rightNodes.length === 0) {
    const half = Math.ceil(leftNodes.length / 2);
    rightNodes.push(...leftNodes.splice(half));
  } else if (rightNodes.length > 2 && leftNodes.length === 0) {
    const half = Math.ceil(rightNodes.length / 2);
    leftNodes.push(...rightNodes.splice(half));
  }

  const getPositions = (nodes: Device[], startY: number, endY: number) => {
    return nodes.map((device, index) => ({
      device,
      y: startY + ((endY - startY) / (nodes.length + 1)) * (index + 1)
    }));
  };

  // บีบระยะขอบ Y ให้โหนดกระจายตัวในช่วง 10% ถึง 90%
  const leftPositions = getPositions(leftNodes, 10, 90);
  const rightPositions = getPositions(rightNodes, 10, 90);

  // พิกัดของ Backbone ตรงกลางจำลอง (Mock Backbone Nodes)
  const BB_SW1 = { x: 33, y: 50, name: 'C2900-sw1' };
  const BB_RT1 = { x: 50, y: 50, name: 'c7200-bridge 1' };
  const BB_SW2 = { x: 67, y: 50, name: 'LS 1010' };

  return (
    // ==========================================
    // NETWORK VISUALIZATION (ส่วนการแสดงแผนที่เครือข่าย)
    // 💡 BACKEND INTEGRATION: โครงสร้างถูกจัดแบบ Hierarchical Topology อัตโนมัติจากข้อมูล devices
    // ==========================================
    <div className="relative w-full h-[600px] bg-slate-50 dark:bg-slate-900/50 rounded-lg border overflow-hidden font-sans">
      
      {/* 1. เลเยอร์เส้นเชื่อมต่อ (SVG Background Layer) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        
        {/* เส้นเชื่อมจาก Left Nodes ไปยัง Backbone SW1 */}
        {leftPositions.map((pos, i) => (
          <line 
            key={`l-${i}`} 
            x1="17%" y1={`${pos.y}%`} x2={`${BB_SW1.x}%`} y2={`${BB_SW1.y}%`} 
            stroke={getRiskStroke(pos.device.riskLevel)} 
            strokeWidth="1.5" 
            strokeDasharray={pos.device.riskLevel === 'safe' ? "0" : "4,4"} 
            opacity={0.6}
            className={pos.device.riskLevel === 'critical' ? 'animate-pulse' : ''} 
          />
        ))}
        
        {/* เส้นเชื่อมระหว่าง Backbone */}
        <line x1={`${BB_SW1.x}%`} y1={`${BB_SW1.y}%`} x2={`${BB_RT1.x}%`} y2={`${BB_RT1.y}%`} stroke="#94a3b8" strokeWidth="2" />
        <line x1={`${BB_RT1.x}%`} y1={`${BB_RT1.y}%`} x2={`${BB_SW2.x}%`} y2={`${BB_SW2.y}%`} stroke="#94a3b8" strokeWidth="2" />

        {/* เส้นเชื่อมจาก Backbone SW2 ไปยัง Right Nodes */}
        {rightPositions.map((pos, i) => (
          <line 
            key={`r-${i}`} 
            x1={`${BB_SW2.x}%`} y1={`${BB_SW2.y}%`} x2="83%" y2={`${pos.y}%`} 
            stroke={getRiskStroke(pos.device.riskLevel)} 
            strokeWidth="1.5" 
            strokeDasharray={pos.device.riskLevel === 'safe' ? "0" : "4,4"} 
            opacity={0.6}
            className={pos.device.riskLevel === 'critical' ? 'animate-pulse' : ''} 
          />
        ))}
        
      </svg>

      {/* 2. เลเยอร์ Port Labels (Mock Ports แบบใน Packet Tracer) */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        <span className="absolute text-[10px] font-bold text-slate-500" style={{ left: '35%', top: '48%' }}>G0/1</span>
        <span className="absolute text-[10px] font-bold text-slate-500" style={{ left: '46%', top: '48%' }}>FE 0/0</span>
        <span className="absolute text-[10px] font-bold text-slate-500" style={{ left: '52%', top: '48%' }}>ATM1/0</span>
        <span className="absolute text-[10px] font-bold text-slate-500" style={{ left: '63%', top: '48%' }}>FE 0/1</span>
      </div>

      {/* 3. เลเยอร์โหนดอุปกรณ์ (HTML Nodes Layer) */}
      <div className="absolute inset-0 w-full h-full">
        
        {/* Backbone Nodes จำลองตรงกลาง */}
        <div className="absolute z-10 flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${BB_SW1.x}%`, top: `${BB_SW1.y}%` }}>
          <Network className="w-10 h-10 text-[#00b0f0] drop-shadow-md" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono">{BB_SW1.name}</span>
        </div>
        <div className="absolute z-10 flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${BB_RT1.x}%`, top: `${BB_RT1.y}%` }}>
          <Router className="w-10 h-10 text-[#00b0f0] drop-shadow-md" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono">{BB_RT1.name}</span>
        </div>
        <div className="absolute z-10 flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${BB_SW2.x}%`, top: `${BB_SW2.y}%` }}>
          <Network className="w-10 h-10 text-[#00b0f0] drop-shadow-md" />
          <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-mono">{BB_SW2.name}</span>
        </div>

        {/* Left Nodes (ฝั่งซ้าย - เรียงลงมา) */}
        {leftPositions.map((pos) => (
          <div 
            key={pos.device.id}
            onClick={() => onDeviceClick?.(pos.device)}
            className="absolute z-20 flex items-center justify-end gap-3 transform -translate-y-1/2 -translate-x-full cursor-pointer hover:scale-110 transition-transform" 
            style={{ left: '17%', top: `${pos.y}%`, width: '200px' }}
            title={`${pos.device.name} (${pos.device.ipAddress})`}
          >
            <div className="text-right leading-tight">
              <div className="text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200">{pos.device.ipAddress}</div>
              <div className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{pos.device.name}</div>
            </div>
            <div className="relative flex flex-col items-center shrink-0">
              {getDeviceIcon(pos.device.deviceType)}
              <RiskBadge risk={pos.device.riskLevel} />
            </div>
          </div>
        ))}

        {/* Right Nodes (ฝั่งขวา - เรียงลงมา) */}
        {rightPositions.map((pos) => (
          <div 
            key={pos.device.id}
            onClick={() => onDeviceClick?.(pos.device)}
            className="absolute z-20 flex items-center justify-start gap-3 transform -translate-y-1/2 cursor-pointer hover:scale-110 transition-transform" 
            style={{ left: '83%', top: `${pos.y}%`, width: '200px' }}
            title={`${pos.device.name} (${pos.device.ipAddress})`}
          >
            <div className="relative flex flex-col items-center shrink-0">
              {getDeviceIcon(pos.device.deviceType)}
              <RiskBadge risk={pos.device.riskLevel} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200">{pos.device.ipAddress}</div>
              <div className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{pos.device.name}</div>
            </div>
          </div>
        ))}
        
      </div>
    </div>
  );
}
