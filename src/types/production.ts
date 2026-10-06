export type ShiftType = 'night' | 'day';

/**
 * Formula Calculation Mode:
 * - 'qty_drives_uph': Q'ty Plan + Working Hours -> calculates UPH (and recommends JIGs)
 * - 'jig_drives_qty': (JIG A + JIG B) * UPH/JIG * Utilization% -> calculates UPH -> UPH * Working Hours = Q'ty Plan
 * - 'uph_drives_qty': Manual UPH * Working Hours -> calculates Q'ty Plan (and recommends JIGs)
 */
export type FormulaCalculationMode = 'qty_drives_uph' | 'jig_drives_qty' | 'uph_drives_qty';

export interface ModelPlanItem {
  id: string;
  modelName: string;
  lineAssignment?: 'A' | 'B' | 'BOTH'; // Keeps model in Line A or Line B sheet even if JIG is temporarily edited to 0
  groupKey?: string; // e.g. "TM19 + TM21" when grouped in proportion & focus charts
  jigA: number;
  jigB: number;
  qtyPlan: number;
  uph: number; // Live calculated or input UPH
  utilizationPercent: number; // % of shift time this model's JIG is running (e.g. 100% for main models, 77.8% for T520, 0% for Standby SBS620)
  cycleTimeSec: number; // Standard cycle time per unit (sec)
  changeoverMin: number; // Estimated changeover time (min)
  defectWatch: string; // Key quality / process focus point for this model
  processFocusNote: string; // IE operational instruction
  color: string;
  highlightZero?: boolean; // Highlight standby jig row (like SBS620 in yellow)
}

export interface HourlyRecord {
  id: string;
  slotIndex?: number; // 0-based index so custom Hour labels map cleanly across Line A, Line B, and Summary
  label: string; // Editable Hour label, e.g. "H1", "20:00-21:00", "H1 (20:00-21:00)"
  durationHours: number; // 1.0 or 0.5
  plan: number;
  actual: number | null;
  downtimeMin: number;
  modelRunning: string;
  note: string;
}

export interface ProductionKpiState {
  lineStopPercent: number;
  manpowerAttendancePercent: number;
  bottleneckCtSec: number;
  wipBufferUnits: number;
}

export type AlertSeverity = 'optimal' | 'near_miss' | 'level1_5pct' | 'level2_10pct' | 'level3_15pct' | 'level4_20pct';

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  hourLabel: string;
  severity: AlertSeverity;
  shortfallPercent: number;
  ownerRole: string;
  actionTaken: string;
  resolved: boolean;
}

export interface ShiftPlanConfig {
  planTitle: string;
  shiftType: ShiftType;
  dateDisplay: string;
  workingHours: number;
  standardUphPerJig: number; // Default 6 UPH per 1 JIG (since 2 JIG = 12 UPH, 3 JIG = 18 UPH, 4 JIG = 24 UPH)
  formulaMode: FormulaCalculationMode;
  roundShiftTotalToTen: boolean; // Rounds 1,079 to 1,080 when TM19(253.5)+TM21(253.5) are shown as 253
  groupTmModels: boolean; // Group TM19 + TM21 together as 506 units (47%) like the reference board
  shiftStartTime?: string; // e.g. "20:00" for Night Shift or "08:00" for Day Shift
  customHourLabels?: Record<number, string>; // Custom user-edited Hour labels by row index
}
