import { RiskLevel } from '../types/network';

/**
 * แปลงคะแนน CVSS เป็นระดับความรุนแรงตามมาตรฐาน
 * 0.0: None (Safe)
 * 0.1 - 3.9: Low
 * 4.0 - 6.9: Medium
 * 7.0 - 8.9: High
 * 9.0 - 10.0: Critical
 */
export function getCvssSeverity(score: number): RiskLevel {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'safe';
}

export function getCvssColorClass(score: number): string {
  if (score >= 9.0) return 'text-red-950 dark:text-red-400'; // Critical
  if (score >= 7.0) return 'text-red-600 dark:text-red-500'; // High
  if (score >= 4.0) return 'text-orange-500 dark:text-orange-400'; // Medium
  if (score >= 0.1) return 'text-green-600 dark:text-green-500'; // Low
  return 'text-green-600 dark:text-green-500'; // Safe/None
}
