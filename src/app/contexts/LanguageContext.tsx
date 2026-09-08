import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'th' | 'en';

interface Translations {
  [key: string]: {
    th: string;
    en: string;
  };
}

const translations: Translations = {
  // Navigation
  dashboard: { th: 'แดชบอร์ด', en: 'Dashboard' },
  scanner: { th: 'สแกนเครือข่าย', en: 'VA Scanner' },
  scanHistory: { th: 'ประวัติการสแกน', en: 'Scan History' },
  reports: { th: 'รายงาน', en: 'Reports' },
  settings: { th: 'ตั้งค่า', en: 'Settings' },

  // Common UI Text
  results_based_on_ip_range: { th: 'ผลลัพธ์ตามช่วง IP ที่ค้นหา', en: 'Results are based on your searched IP range' },
  network_security_scanner_analyzer: { th: 'เครื่องมือสแกนและวิเคราะห์ความปลอดภัยเครือข่าย', en: 'Network Security Scanner & Analyzer' },
  about_network_scanner: { th: 'เกี่ยวกับเครื่องมือสแกนเครือข่าย', en: 'About Network Scanner' },
  version: { th: 'เวอร์ชัน', en: 'Version' },
  about_description: { th: 'เครื่องมือสแกนเครือข่ายสำหรับตรวจสอบอุปกรณ์ที่เชื่อมต่อและประเมินความเสี่ยงด้านความปลอดภัย', en: 'Network scanning tool for detecting connected devices and assessing security risks' },
  language_description: { th: 'เลือกภาษาที่คุณต้องการใช้งานในระบบ รวมถึงคำสั่งเสียง', en: 'Select your preferred language for the system, including voice commands' },
  footer_text: { th: '© 2026 Network Scanner. สงวนลิขสิทธิ์', en: '© 2026 Network Scanner. All rights reserved.' },
  router: { th: 'เราเตอร์', en: 'Router' },
  ports: { th: 'พอร์ต', en: 'ports' },
  dangerous_ports_detected: { th: 'พบพอร์ตอันตราย', en: 'dangerous port(s) detected' },
  across_all_devices: { th: 'ทุกอุปกรณ์', en: 'Across all devices' },
  recent_scan_only: { th: 'การสแกนล่าสุดเท่านั้น', en: 'Recent Scan only' },
  view_all: { th: 'ดูทั้งหมด', en: 'View all' },
  devices_using: { th: 'อุปกรณ์ที่ใช้', en: 'Devices using' },
  close: { th: 'ปิด', en: 'Close' },
  view_breakdown: { th: 'ดูรายละเอียด', en: 'View Breakdown' },
  device_count: { th: 'อุปกรณ์', en: 'device' },
  device_count_plural: { th: 'อุปกรณ์', en: 'devices' },
  more: { th: 'เพิ่มเติม...', en: 'more...' },
  no_dangerous_ports: { th: 'ไม่มีพอร์ตอันตราย', en: 'No dangerous ports' },
  total_open_ports: { th: 'พอร์ตที่เปิดทั้งหมด', en: 'Total Open Ports' },
  total_devices: { th: 'จำนวนอุปกรณ์ทั้งหมด', en: 'Total Devices' },
  danger_ports: { th: 'พอร์ตอันตราย', en: 'Danger Ports' },
  risk_devices: { th: 'อุปกรณ์ที่มีความเสี่ยง', en: 'Risk Devices' },
  related_cves: { th: 'CVE ที่เกี่ยวข้อง', en: 'Related CVEs' },
  dangerous_ports_analysis: { th: 'การวิเคราะห์พอร์ตอันตราย', en: 'Dangerous Ports Analysis' },
  devices_using_port: { th: 'อุปกรณ์ที่ใช้พอร์ตนี้', en: 'device(s) using this port' },
  dangerous: { th: 'อันตราย', en: 'Dangerous' },
  no_dangerous_ports_detected: { th: 'ไม่พบพอร์ตอันตราย', en: 'No dangerous ports detected' },
  latest_scan_information: { th: 'ข้อมูลการสแกนล่าสุด', en: 'Latest Scan Information' },
  seconds: { th: 'วินาที', en: 'seconds' },
  
  // Dashboard
  networkScanner: { th: 'เครื่องมือสแกนเครือข่าย', en: 'Network Scanner' },
  summary: { th: 'ข้อมูลสรุป', en: 'Summary' },
  overview: { th: 'ภาพรวม', en: 'Overview' },
  totalDevices: { th: 'จำนวนอุปกรณ์ทั้งหมด', en: 'Total Devices' },
  totalOpenPorts: { th: 'พอร์ตที่เปิดทั้งหมด', en: 'Total Open Ports' },
  dangerousPorts: { th: 'พอร์ตอันตราย', en: 'Dangerous Ports' },
  vulnerabilities: { th: 'ช่องโหว่', en: 'Vulnerabilities' },
  vulnerabilitiesBySeverity: { th: 'ช่องโหว่ตามระดับความรุนแรง', en: 'Vulnerabilities by Severity' },
  recentScans: { th: 'การสแกนล่าสุด', en: 'Recent Scans' },
  riskDistribution: { th: 'การกระจายความเสี่ยง', en: 'Risk Distribution' },
  
  // Scanner Page
  startScan: { th: 'เริ่มสแกน', en: 'Start Scan' },
  stopScan: { th: 'หยุดสแกน', en: 'Stop Scan' },
  scanning: { th: 'กำลังสแกน...', en: 'Scanning...' },
  voiceCommand: { th: 'คำสั่งเสียง', en: 'Voice Command' },
  searchPlaceholder: { th: 'ค้นหา IP Address หรือชื่ออุปกรณ์', en: 'Search IP Address or Device Name' },
  connectedDevices: { th: 'อุปกรณ์ที่เชื่อมต่อ', en: 'Connected Devices' },
  networkMap: { th: 'แผนภาพเครือข่าย', en: 'Network Diagram' },
  scanControls: { th: 'การควบคุมการสแกน', en: 'Scan Controls' },
  targetIpRange: { th: 'ช่วง IP เป้าหมาย', en: 'Target IP Range' },
  basicScan: { th: 'สแกนพื้นฐาน', en: 'Basic Scan' },
  fullScan: { th: 'สแกนเต็มรูปแบบ', en: 'Full Scan' },
  scannedDevices: { th: 'อุปกรณ์ที่สแกน', en: 'Scanned Devices' },
  criticalRiskDevices: { th: 'อุปกรณ์เสี่ยงวิกฤต', en: 'Critical Risk Devices' },
  mediumRiskDevices: { th: 'อุปกรณ์เสี่ยงปานกลาง', en: 'Medium Risk Devices' },
  lowSafeDevices: { th: 'อุปกรณ์เสี่ยงต่ำและปลอดภัย', en: 'Low Risk & Safe Devices' },
  details: { th: 'รายละเอียด', en: 'Details' },
  searchDevices: { th: 'ค้นหาด้วย IP หรือชื่ออุปกรณ์...', en: 'Search by IP or device name...' },
  deviceName: { th: 'ชื่ออุปกรณ์', en: 'Device Name' },
  actions: { th: 'การดำเนินการ', en: 'Actions' },
  vulnerabilityStatus: { th: 'สถานะช่องโหว่', en: 'Vulnerability Status' },
  
  // Device Info
  device: { th: 'อุปกรณ์', en: 'Device' },
  ipAddress: { th: 'IP Address', en: 'IP Address' },
  macAddress: { th: 'MAC Address', en: 'MAC Address' },
  openPorts: { th: 'พอร์ตที่เปิด', en: 'Open Ports' },
  riskLevel: { th: 'ระดับความเสี่ยง', en: 'Risk Level' },
  status: { th: 'สถานะ', en: 'Status' },
  deviceType: { th: 'ประเภทอุปกรณ์', en: 'Device Type' },
  lastSeen: { th: 'เห็นล่าสุด', en: 'Last Seen' },
  device_not_found: { th: 'ไม่พบอุปกรณ์', en: 'Device not found' },
  device_information: { th: 'ข้อมูลอุปกรณ์', en: 'Device Information' },
  last_scan: { th: 'การสแกนล่าสุด', en: 'Last Scan' },
  risk_summary: { th: 'สรุปความเสี่ยง', en: 'Risk Summary' },
  vulnerable_ports: { th: 'พอร์ตที่มีช่องโหว่', en: 'Vulnerable Ports' },
  total_cves: { th: 'CVE ทั้งหมด', en: 'Total CVEs' },
  no_vulnerabilities_detected: { th: 'ไม่พบช่องโหว่', en: 'No Vulnerabilities Detected' },
  all_ports_safe: { th: 'พอร์ตที่เปิดทั้งหมดปลอดภัย ไม่พบ CVE ที่รู้จัก', en: 'All open ports are considered safe. No known CVEs detected.' },
  port_to_cve_mapping: { th: 'การแม็ปพอร์ตกับ CVE', en: 'Port to CVE Mapping' },
  cve_summary_by_severity: { th: 'สรุป CVE ตามระดับความรุนแรง', en: 'CVE Summary by Severity' },
  cvss_score: { th: 'คะแนน CVSS', en: 'CVSS Score' },
  severity: { th: 'ความรุนแรง', en: 'Severity' },
  port: { th: 'พอร์ต', en: 'Port' },
  risk_assessment: { th: 'การประเมินความเสี่ยง', en: 'Risk Assessment' },
  open_ports_cve_mapping: { th: 'การแม็ปพอร์ตที่เปิดกับ CVE', en: 'Open Ports & CVE Mapping' },
  no_known_cves: { th: 'ไม่พบ CVE ที่รู้จักสำหรับพอร์ตที่เปิด', en: 'No known CVEs detected for open ports' },
  
  // Risk Levels
  safe: { th: 'ปลอดภัย', en: 'Safe' },
  low: { th: 'ต่ำ', en: 'Low' },
  medium: { th: 'ปานกลาง', en: 'Medium' },
  high: { th: 'สูง', en: 'High' },
  critical: { th: 'วิกฤต', en: 'Critical' },
  
  // Actions
  exportReport: { th: 'ส่งออกรายงาน', en: 'Export Report' },
  saveResults: { th: 'บันทึกผลการสแกน', en: 'Save Results' },
  compare: { th: 'เปรียบเทียบ', en: 'Compare' },
  compareScans: { th: 'เปรียบเทียบการสแกน', en: 'Compare Scans' },
  viewDetails: { th: 'ดูรายละเอียด', en: 'View Details' },
  selectScan: { th: 'เลือกการสแกน', en: 'Select Scan' },
  generateReport: { th: 'สร้างรายงาน', en: 'Generate Report' },
  cancel_compare: { th: 'ยกเลิกการเปรียบเทียบ', en: 'Cancel Compare' },
  go_back: { th: 'กลับ', en: 'Go Back' },
  export: { th: 'ส่งออก', en: 'Export' },
  clear_filters: { th: 'ล้างตัวกรอง', en: 'Clear Filters' },
  
  // Scan History
  scanDate: { th: 'วันที่สแกน', en: 'Scan Date' },
  devicesFound: { th: 'พบอุปกรณ์', en: 'Devices Found' },
  highRiskDevices: { th: 'อุปกรณ์เสี่ยงสูง', en: 'High Risk Devices' },
  noHistory: { th: 'ไม่มีประวัติการสแกน', en: 'No Scan History' },
  comparing: { th: 'กำลังเปรียบเทียบ', en: 'Comparing' },
  newDevices: { th: 'อุปกรณ์ใหม่', en: 'New Devices' },
  removedDevices: { th: 'อุปกรณ์ที่หายไป', en: 'Removed Devices' },
  changedDevices: { th: 'อุปกรณ์ที่เปลี่ยนแปลง', en: 'Changed Devices' },
  filters: { th: 'ตัวกรอง', en: 'Filters' },
  search_ip_range: { th: 'ค้นหาช่วง IP', en: 'Search IP Range' },
  start_date: { th: 'วันที่เริ่มต้น', en: 'Start Date' },
  end_date: { th: 'วันที่สิ้นสุด', en: 'End Date' },
  port_type: { th: 'ประเภทพอร์ต', en: 'Port Type' },
  all_ports: { th: 'พอร์ตทั้งหมด', en: 'All Ports' },
  dangerous_ports_only: { th: 'เฉพาะพอร์ตอันตราย', en: 'Dangerous Ports Only' },
  safe_ports_only: { th: 'เฉพาะพอร์ตปลอดภัย', en: 'Safe Ports Only' },
  showing_results: { th: 'แสดง', en: 'Showing' },
  of: { th: 'จาก', en: 'of' },
  scans: { th: 'การสแกน', en: 'scan(s)' },
  no_scans_match_filters: { th: 'ไม่มีการสแกนที่ตรงกับตัวกรอง', en: 'No scans match the current filters' },
  duration: { th: 'ระยะเวลา', en: 'Duration' },
  safe_devices: { th: 'อุปกรณ์ปลอดภัย', en: 'Safe Devices' },
  scan_1: { th: 'การสแกน 1', en: 'Scan 1' },
  scan_2: { th: 'การสแกน 2', en: 'Scan 2' },
  devices: { th: 'อุปกรณ์', en: 'devices' },
  port_changes: { th: 'การเปลี่ยนแปลงพอร์ต', en: 'Port Changes' },
  cve_increase: { th: 'CVE เพิ่มขึ้น', en: 'CVE Increase' },
  cve_decrease: { th: 'CVE ลดลง', en: 'CVE Decrease' },
  no_port_changes_detected: { th: 'ไม่พบการเปลี่ยนแปลงพอร์ต', en: 'No port changes detected' },
  added_ports: { th: 'พอร์ตที่เพิ่ม', en: 'Added Ports' },
  removed_ports: { th: 'พอร์ตที่ถูกลบ', en: 'Removed Ports' },
  no_new_devices_detected: { th: 'ไม่พบอุปกรณ์ใหม่', en: 'No new devices detected' },
  no_removed_devices_detected: { th: 'ไม่พบอุปกรณ์ที่ถูกลบ', en: 'No removed devices detected' },
  export_scan_reports: { th: 'ส่งออกรายงานการสแกน', en: 'Export Scan Reports' },
  export_format: { th: 'รูปแบบการส่งออก', en: 'Export Format' },
  export_json: { th: 'ส่งออกเป็น JSON', en: 'Export JSON' },
  export_csv: { th: 'ส่งออกเป็น CSV', en: 'Export CSV' },
  export_pdf: { th: 'ส่งออกเป็น PDF', en: 'Export PDF' },
  select_scans_to_export: { th: 'เลือกการสแกนเพื่อส่งออก', en: 'Select Scans to Export' },
  selected: { th: 'เลือกแล้ว', en: 'selected' },
  select_2_scans_to_compare: { th: 'กรุณาเลือกการสแกน 2 รายการเพื่อเปรียบเทียบ', en: 'Please select 2 scans to compare' },
  export_success: { th: 'ส่งออกรายงาน {format} สำเร็จ ({count} รายการ)', en: 'Exported {count} scan(s) as {format}' },
  select_all: { th: 'เลือกทั้งหมด', en: 'Select All' },
  
  // Reports
  selectScansToCompare: { th: 'เลือกการสแกนเพื่อเปรียบเทียบ', en: 'Select Scans to Compare' },
  noScansSelected: { th: 'กรุณาเลือกการสแกนอย่างน้อย 1 รายการ', en: 'Please select at least 1 scan' },
  
  // Settings
  language: { th: 'ภาษา', en: 'Language' },
  thai: { th: 'ภาษาไทย', en: 'Thai' },
  english: { th: 'อังกฤษ', en: 'English' },
  
  // Voice Commands
  listeningVoice: { th: 'กำลังฟัง...', en: 'Listening...' },
  voiceNotSupported: { th: 'เบราว์เซอร์นี้ไม่รองรับการรับคำสั่งเสียง', en: 'Voice command not supported in this browser' },
  clickToSpeak: { th: 'คลิกเพื่อพูด', en: 'Click to Speak' },
  recognizedCommand: { th: 'คำสั่งที่รับรู้:', en: 'Recognized Command:' },
  editCommand: { th: 'แก้ไขคำสั่งที่นี่...', en: 'Edit command here...' },
  cancel: { th: 'ยกเลิก', en: 'Cancel' },
  next: { th: 'ถัดไป', en: 'Next' },
  confirm: { th: 'ยืนยัน', en: 'Confirm' },
  
  // Notifications
  scanCompleted: { th: 'สแกนเสร็จสมบูรณ์', en: 'Scan Completed' },
  scanSaved: { th: 'บันทึกผลการสแกนแล้ว', en: 'Scan Results Saved' },
  reportExported: { th: 'ส่งออกรายงานแล้ว', en: 'Report Exported' },
  
  // Risk Descriptions
  riskDescSafe: { th: 'ไม่พบความเสี่ยง อุปกรณ์ปลอดภัย', en: 'No risks detected. Device is secure.' },
  riskDescLow: { th: 'พบความเสี่ยงเล็กน้อย แนะนำให้ติดตาม', en: 'Minor risks detected. Monitoring recommended.' },
  riskDescMedium: { th: 'พบความเสี่ยงปานกลาง ควรตรวจสอบและแก้ไข', en: 'Moderate risks detected. Investigation recommended.' },
  riskDescHigh: { th: 'พบความเสี่ยงสูง ต้องดำเนินการแก้ไขทันที', en: 'High risks detected. Immediate action required.' },
  riskDescCritical: { th: 'พบความเสี่ยงวิกฤต อันตรายร้ายแรง ต้องแก้ไขด่วน', en: 'Critical risks detected. Severe danger. Urgent action required.' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}