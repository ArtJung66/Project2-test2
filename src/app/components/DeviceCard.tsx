import { Device } from '../types/network';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useLanguage } from '../contexts/LanguageContext';
import { Monitor, Laptop, Server, Wifi, Camera, AlertTriangle } from 'lucide-react';
import { getPortInfo } from '../utils/mockData';
import { useNavigate } from 'react-router';

interface DeviceCardProps {
  device: Device;
  onClick?: () => void;
}

const getRiskBadgeVariant = (risk: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (risk) {
    case 'critical':
    case 'high':
      return 'destructive';
    case 'medium':
      return 'outline';
    default:
      return 'secondary';
  }
};

const getDeviceIcon = (deviceType: string) => {
  switch (deviceType.toLowerCase()) {
    case 'server':
      return <Server className="h-5 w-5" />;
    case 'laptop':
      return <Laptop className="h-5 w-5" />;
    case 'camera':
      return <Camera className="h-5 w-5" />;
    case 'router':
      return <Wifi className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
};

export function DeviceCard({ device, onClick }: DeviceCardProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const dangerousPorts = device.openPorts.filter(port => getPortInfo(port));

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/device?id=${device.id}`);
    }
  };

  return (
    <Card 
      className="hover:shadow-lg transition-shadow cursor-pointer" 
      onClick={handleClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getDeviceIcon(device.deviceType)}
            <CardTitle className="text-lg">{device.name}</CardTitle>
          </div>
          <Badge variant={getRiskBadgeVariant(device.riskLevel)}>
            {t(device.riskLevel)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-sm">
          <span className="font-medium">{t('ipAddress')}:</span>{' '}
          <span className="text-muted-foreground">{device.ipAddress}</span>
        </div>
        <div className="text-sm">
          <span className="font-medium">{t('macAddress')}:</span>{' '}
          <span className="text-muted-foreground font-mono">{device.macAddress}</span>
        </div>
        <div className="text-sm">
          <span className="font-medium">{t('openPorts')}:</span>{' '}
          <span className="text-muted-foreground">
            {device.openPorts.length} {t('ports')}
          </span>
        </div>
        {dangerousPorts.length > 0 && (
          <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950 rounded">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="text-xs text-red-800 dark:text-red-200">
              {dangerousPorts.length} {t('dangerous_ports_detected')}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}