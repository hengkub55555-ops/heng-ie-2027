import {
  ModelPlanItem,
  HourlyRecord,
  ShiftPlanConfig,
  ProductionKpiState,
  AlertSeverity,
  ActionLogEntry,
} from '../types/production';

export const DEFAULT_SHIFT_CONFIG: ShiftPlanConfig = {
  planTitle: 'แผนการผลิตกะกลางคืน',
  shiftType: 'night',
  dateDisplay: '6 ต.ค. 2569',
  workingHours: 10.5,
  standardUphPerJig: 6, // 1 JIG = 6 UPH, 2 JIG = 12 UPH, 3 JIG = 18 UPH, 4 JIG = 24 UPH (19 JIGs = 114 UPH)
  formulaMode: 'qty_drives_uph',
  roundShiftTotalToTen: true,
  groupTmModels: true,
  shiftStartTime: '20:00',
  customHourLabels: {},
};

export const DEFAULT_MODELS: ModelPlanItem[] = [
  {
    id: 'm-t520',
    modelName: 'T520',
    lineAssignment: 'A',
    jigA: 1,
    jigB: 0,
    qtyPlan: 49,
    uph: 5, // 49 / 10.5 = 4.67 -> rounded 5 UPH
    utilizationPercent: 77.8, // 49 / (1 * 6 * 10.5 = 63) = 77.8%
    cycleTimeSec: 36.0,
    changeoverMin: 12,
    defectWatch: 'ระวังการประกอบชุดสายไฟหลักและการตั้งค่าแรงบิดสกรู',
    processFocusNote: 'ล็อตเล็ก (4.5%) ควรผลิตช่วงต้นกะหรือช่วงเปลี่ยน Model เพื่อลดการสูญเสียเวลา Changeover',
    color: '#EF4444', // Coral Red (4.5% in chart)
  },
  {
    id: 'm-sbs550',
    modelName: 'SBS550',
    lineAssignment: 'B',
    jigA: 0,
    jigB: 2,
    qtyPlan: 126,
    uph: 12, // 2 JIG * 6 UPH/JIG = 12 UPH -> 12 * 10.5 = 126 units
    utilizationPercent: 100,
    cycleTimeSec: 34.5,
    changeoverMin: 15,
    defectWatch: 'ตรวจสอบระยะห่างขอบประตูคู่และซีลยางกันความเย็น',
    processFocusNote: 'เดินคู่บน JIG B จำนวน 2 ตัว (2 × 6 = 12 UPH × 10.5 ชม. = 126 เครื่อง)',
    color: '#F59E0B', // Amber Orange (11.7% in chart)
  },
  {
    id: 'm-sbs620',
    modelName: 'SBS620',
    lineAssignment: 'B',
    jigA: 0,
    jigB: 1,
    qtyPlan: 0,
    uph: 0, // Standby JIG (0% utilization)
    utilizationPercent: 0,
    cycleTimeSec: 35.5,
    changeoverMin: 15,
    defectWatch: 'JIG B สำรอง (Standby) — ห้ามป้อนชิ้นส่วนปนกับรุ่น SBS550',
    processFocusNote: 'ไม่มีแผนผลิตในกะนี้ (0 เครื่อง) ใช้ JIG B เป็นตัวสำรองกรณีฉุกเฉินเท่านั้น',
    color: '#94A3B8', // Slate
    highlightZero: true,
  },
  {
    id: 'm-bm23',
    modelName: 'BM23',
    lineAssignment: 'A',
    jigA: 3,
    jigB: 0,
    qtyPlan: 189,
    uph: 18, // 3 JIG * 6 UPH/JIG = 18 UPH -> 18 * 10.5 = 189 units
    utilizationPercent: 100,
    cycleTimeSec: 33.8,
    changeoverMin: 10,
    defectWatch: 'ตรวจสอบรอยขีดข่วนฝาหน้าและแนวเชื่อมท่อคอมเพรสเซอร์',
    processFocusNote: 'อันดับ 2 ของไลน์ (17.5%) ใช้ JIG A 3 ตัว (3 × 6 = 18 UPH × 10.5 ชม. = 189 เครื่อง)',
    color: '#16A34A', // Green (17.5% in chart)
  },
  {
    id: 'm-bm29',
    modelName: 'BM29',
    lineAssignment: 'A',
    jigA: 1,
    jigB: 0,
    qtyPlan: 20,
    uph: 2, // 20 / 10.5 = 1.90 -> rounded 2 UPH
    utilizationPercent: 31.7, // 20 / 63 = 31.7%
    cycleTimeSec: 35.0,
    changeoverMin: 10,
    defectWatch: 'เช็คสเปกแผงควบคุมอุณหภูมิ (PCB) ไม่ให้สลับกับ BM23',
    processFocusNote: 'ล็อตเล็กมาก (20 เครื่อง) แนะนำเดินต่อเนื่องจาก T520/BM23 บน JIG A เพื่อใช้ชิ้นส่วนร่วมกัน',
    color: '#0EA5E9', // Sky Blue
  },
  {
    id: 'm-bmtd28',
    modelName: 'BMTD28',
    lineAssignment: 'A',
    jigA: 1,
    jigB: 0,
    qtyPlan: 63,
    uph: 6, // 1 JIG * 6 UPH/JIG = 6 UPH -> 6 * 10.5 = 63 units
    utilizationPercent: 100,
    cycleTimeSec: 34.8,
    changeoverMin: 12,
    defectWatch: 'ตรวจสอบชุด Dispenser น้ำดื่มและการทดสอบรั่วซึม (Leak Test)',
    processFocusNote: 'สัดส่วน 5.9% (1 JIG × 6 UPH × 10.5 ชม. = 63 เครื่อง)',
    color: '#14B8A6', // Teal (5.9% in chart)
  },
  {
    id: 'm-tm14',
    modelName: 'TM14',
    lineAssignment: 'B',
    jigA: 0,
    jigB: 2,
    qtyPlan: 126,
    uph: 12, // 2 JIG * 6 UPH/JIG = 12 UPH -> 12 * 10.5 = 126 units
    utilizationPercent: 100,
    cycleTimeSec: 34.0,
    changeoverMin: 10,
    defectWatch: 'ตรวจสอบความแน่นของบานพับบนและฉนวนโฟม',
    processFocusNote: 'สัดส่วน 11.7% เดินบน JIG B 2 ตัว (2 × 6 = 12 UPH × 10.5 ชม. = 126 เครื่อง)',
    color: '#9333EA', // Purple (11.7% in chart)
  },
  {
    id: 'm-tm19',
    modelName: 'TM19',
    lineAssignment: 'A',
    groupKey: 'TM19 + TM21',
    jigA: 4,
    jigB: 0,
    qtyPlan: 253,
    uph: 24, // 4 JIG * 6 UPH/JIG = 24 UPH -> 253 units
    utilizationPercent: 100.4,
    cycleTimeSec: 33.2,
    changeoverMin: 8,
    defectWatch: 'รุ่นหลัก (Main Volume) — คุม Takt Time สถานีอัดโฟมและประกอบคอยล์เย็น',
    processFocusNote: 'เมื่อรวมกับ TM21 คิดเป็น 506 เครื่อง (47%) เป็นรุ่นหลัก ถ้ามีปัญหาจะกระทบแผนทั้งกะทันที',
    color: '#1D63D8', // Royal Blue (47% in chart)
  },
  {
    id: 'm-tm21',
    modelName: 'TM21',
    lineAssignment: 'B',
    groupKey: 'TM19 + TM21',
    jigA: 0,
    jigB: 4,
    qtyPlan: 253,
    uph: 24, // 4 JIG * 6 UPH/JIG = 24 UPH -> 253 units
    utilizationPercent: 100.4,
    cycleTimeSec: 33.2,
    changeoverMin: 8,
    defectWatch: 'รุ่นหลักคู่ขนาน JIG B — ระวังการป้อนฝาครอบหลังสลับกับ TM19',
    processFocusNote: 'เดินคู่ขนานบน JIG B 4 ตัว (4 × 6 = 24 UPH) ห้ามเกิด Line Stop เกิน 5 นาทีเด็ดขาด',
    color: '#2563EB', // Blue
  },
];

export function isModelInLine(model: ModelPlanItem, line: 'A' | 'B'): boolean {
  if (line === 'A') {
    if (model.lineAssignment === 'A' || model.lineAssignment === 'BOTH') return true;
    if (model.lineAssignment === 'B') return model.jigA > 0;
    return model.jigA > 0 || (model.jigA === 0 && model.jigB === 0);
  } else {
    if (model.lineAssignment === 'B' || model.lineAssignment === 'BOTH') return true;
    if (model.lineAssignment === 'A') return model.jigB > 0;
    return model.jigB > 0;
  }
}

export function getModelLineQty(model: ModelPlanItem, line: 'A' | 'B'): number {
  const jA = Number(model.jigA) || 0;
  const jB = Number(model.jigB) || 0;
  const qty = Number(model.qtyPlan) || 0;
  if (jA > 0 && jB > 0) {
    const qtyA = Math.round((qty * jA) / (jA + jB));
    return line === 'A' ? qtyA : Math.max(0, qty - qtyA);
  }
  if (line === 'A') {
    return isModelInLine(model, 'A') ? qty : 0;
  }
  return isModelInLine(model, 'B') ? qty : 0;
}

export function getModelLineUph(model: ModelPlanItem, line: 'A' | 'B'): number {
  const jA = Number(model.jigA) || 0;
  const jB = Number(model.jigB) || 0;
  const uph = Number(model.uph) || 0;
  if (jA > 0 && jB > 0) {
    const uphA = Math.round((uph * jA) / (jA + jB));
    return line === 'A' ? uphA : Math.max(0, uph - uphA);
  }
  if (line === 'A') {
    return isModelInLine(model, 'A') ? uph : 0;
  }
  return isModelInLine(model, 'B') ? uph : 0;
}

export const DEFAULT_KPI_STATE: ProductionKpiState = {
  lineStopPercent: 3.2,
  manpowerAttendancePercent: 100,
  bottleneckCtSec: 34.2,
  wipBufferUnits: 105,
};

/**
 * Helper to compute all derived formula metrics for a single model row
 */
export interface ModelFormulaBreakdown {
  totalJig: number;
  maxJigUphCapacity: number; // totalJig * standardUphPerJig
  maxJigShiftQty: number; // maxJigUphCapacity * workingHours
  exactUphFromQty: number; // qtyPlan / workingHours
  roundedUphFromQty: number; // Math.round(qtyPlan / workingHours)
  recommendedJigCount: number; // Math.ceil(exactUphFromQty / standardUphPerJig)
  actualJigUtilizationPercent: number; // (qtyPlan / maxJigShiftQty) * 100
  isOverCapacity: boolean;
}

export function calculateModelFormulaBreakdown(
  model: ModelPlanItem,
  workingHours: number,
  standardUphPerJig: number
): ModelFormulaBreakdown {
  const safeHours = workingHours > 0 ? workingHours : 10.5;
  const safeUphPerJig = standardUphPerJig > 0 ? standardUphPerJig : 6;
  const totalJig = (Number(model.jigA) || 0) + (Number(model.jigB) || 0);
  const maxJigUphCapacity = totalJig * safeUphPerJig;
  const maxJigShiftQty = maxJigUphCapacity * safeHours;
  const exactUphFromQty = model.qtyPlan / safeHours;
  const roundedUphFromQty = Math.round(exactUphFromQty);
  const recommendedJigCount =
    model.qtyPlan > 0 ? Math.max(1, Math.ceil(exactUphFromQty / safeUphPerJig)) : 0;
  const actualJigUtilizationPercent =
    maxJigShiftQty > 0 ? (model.qtyPlan / maxJigShiftQty) * 100 : 0;
  const isOverCapacity = model.qtyPlan > 0 && actualJigUtilizationPercent > 105;

  return {
    totalJig,
    maxJigUphCapacity,
    maxJigShiftQty,
    exactUphFromQty,
    roundedUphFromQty,
    recommendedJigCount,
    actualJigUtilizationPercent,
    isOverCapacity,
  };
}

export function buildClockHourLabels(
  workingHours: number,
  startTimeHHMM: string,
  mode: 'h_and_clock' | 'clock_only' | 'h_only'
): Record<number, string> {
  if (mode === 'h_only') return {};
  const safeHours = workingHours > 0 ? workingHours : 10.5;
  const fullHours = Math.floor(safeHours);
  const remainderFraction = Number((safeHours - fullHours).toFixed(2));
  const [rawH, rawM] = (startTimeHHMM || '20:00').split(':').map((n) => Number(n) || 0);
  let currentMinutes = ((rawH % 24) * 60 + (rawM % 60) + 1440) % 1440;

  const formatMin = (totalMin: number) => {
    const normalized = ((Math.round(totalMin) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
    const mm = String(normalized % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const result: Record<number, string> = {};
  for (let i = 1; i <= fullHours; i++) {
    const idx = i - 1;
    const startStr = formatMin(currentMinutes);
    currentMinutes += 60;
    const endStr = formatMin(currentMinutes);
    const hCode = `H${i}`;
    result[idx] =
      mode === 'clock_only' ? `${startStr}-${endStr}` : `${hCode} (${startStr}-${endStr})`;
  }

  if (remainderFraction > 0) {
    const idx = fullHours;
    const startStr = formatMin(currentMinutes);
    currentMinutes += Math.round(remainderFraction * 60);
    const endStr = formatMin(currentMinutes);
    const hCode = `H${Number((fullHours + remainderFraction).toFixed(1))}`;
    result[idx] =
      mode === 'clock_only' ? `${startStr}-${endStr}` : `${hCode} (${startStr}-${endStr})`;
  }

  return result;
}

export function generateHourlySchedule(
  totalQty: number,
  workingHours: number,
  existingRecords?: HourlyRecord[],
  customHourLabels?: Record<number, string>
): HourlyRecord[] {
  const safeHours = workingHours > 0 ? workingHours : 10.5;
  const baseUph = totalQty > 0 ? Math.round(totalQty / safeHours) : 0;
  const fullHours = Math.floor(safeHours);
  const remainderFraction = Number((safeHours - fullHours).toFixed(2));

  const slots: { defaultLabel: string; duration: number; plan: number }[] = [];
  let allocatedPlan = 0;

  for (let i = 1; i <= fullHours; i++) {
    const isVeryLastSlot = i === fullHours && remainderFraction <= 0;
    const planForHour = isVeryLastSlot
      ? Math.max(0, totalQty - allocatedPlan)
      : Math.min(baseUph, Math.max(0, totalQty - allocatedPlan));
    slots.push({
      defaultLabel: `H${i}`,
      duration: 1.0,
      plan: planForHour,
    });
    allocatedPlan += planForHour;
  }

  if (remainderFraction > 0) {
    const labelStr = `H${Number((fullHours + remainderFraction).toFixed(1))}`;
    const lastPlan = Math.max(0, totalQty - allocatedPlan);
    slots.push({
      defaultLabel: labelStr,
      duration: remainderFraction,
      plan: lastPlan,
    });
  }

  return slots.map((slot, idx) => {
    const prev =
      existingRecords?.find((r) => r.slotIndex === idx) ??
      existingRecords?.[idx] ??
      existingRecords?.find((r) => r.label === slot.defaultLabel);
    const resolvedLabel =
      customHourLabels && customHourLabels[idx] !== undefined && customHourLabels[idx] !== ''
        ? customHourLabels[idx]
        : slot.defaultLabel;

    return {
      id: `hr-slot-${idx}`,
      slotIndex: idx,
      label: resolvedLabel,
      durationHours: slot.duration,
      plan: slot.plan,
      actual: prev ? prev.actual : null,
      downtimeMin: prev ? prev.downtimeMin : 0,
      modelRunning: prev
        ? prev.modelRunning
        : idx < 2
        ? 'T520 / TM19+TM21'
        : idx < 6
        ? 'TM19+TM21 / BM23'
        : 'TM19+TM21 / SBS550 / TM14',
      note: prev ? prev.note : '',
    };
  });
}

export interface GroupedModelFocus {
  key: string;
  label: string;
  qtyPlan: number;
  percent: number;
  uph: number;
  exactUph: number;
  jigA: number;
  jigB: number;
  color: string;
  models: ModelPlanItem[];
  focusSummary: string;
  defectWatch: string;
}

export function computeGroupedModelFocus(
  models: ModelPlanItem[],
  totalQty: number,
  workingHours: number,
  groupTmModels: boolean
): GroupedModelFocus[] {
  const safeTotal = totalQty > 0 ? totalQty : 1;
  const safeHours = workingHours > 0 ? workingHours : 10.5;
  const map = new Map<string, GroupedModelFocus>();

  for (const m of models) {
    const key = groupTmModels && m.groupKey ? m.groupKey : m.modelName;
    const existing = map.get(key);
    const modelExactUph = m.qtyPlan / safeHours;
    const modelUph = Math.round(modelExactUph);
    if (existing) {
      existing.qtyPlan += m.qtyPlan;
      existing.percent = (existing.qtyPlan / safeTotal) * 100;
      existing.exactUph = existing.qtyPlan / safeHours;
      existing.uph = Math.round(existing.exactUph);
      existing.jigA += m.jigA;
      existing.jigB += m.jigB;
      existing.models.push(m);
    } else {
      map.set(key, {
        key,
        label: key,
        qtyPlan: m.qtyPlan,
        percent: (m.qtyPlan / safeTotal) * 100,
        uph: modelUph,
        exactUph: modelExactUph,
        jigA: m.jigA,
        jigB: m.jigB,
        color: m.color,
        models: [m],
        focusSummary: m.processFocusNote,
        defectWatch: m.defectWatch,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.qtyPlan !== a.qtyPlan) return b.qtyPlan - a.qtyPlan;
    return a.label.localeCompare(b.label);
  });
}

export interface ComputedHourlyRow extends HourlyRecord {
  diff: number | null;
  cumPlan: number;
  cumActual: number | null;
  gap: number | null;
  achvPercent: number | null;
  rowSeverity: AlertSeverity;
}

export function evaluateAlertSeverity(achvPercent: number | null): AlertSeverity {
  if (achvPercent === null) return 'optimal';
  const shortfall = 100 - achvPercent;
  if (shortfall >= 20) return 'level4_20pct';
  if (shortfall >= 15) return 'level3_15pct';
  if (shortfall >= 10) return 'level2_10pct';
  if (shortfall >= 5) return 'level1_5pct';
  if (shortfall > 0) return 'near_miss';
  return 'optimal';
}

export function getAlertActionDetails(severity: AlertSeverity): {
  levelNumber: number;
  badgeText: string;
  thresholdLabel: string;
  roleOwner: string;
  actionInstruction: string;
  ieRecommendation: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  accentHex: string;
} {
  switch (severity) {
    case 'level4_20pct':
      return {
        levelNumber: 4,
        badgeText: 'วิกฤต: ต่ำกว่าแผน ≥ 20%',
        thresholdLabel: 'ต่ำกว่าแผน 20%',
        roleOwner: 'ET / Production Manager',
        actionInstruction: 'แจ้ง ET / Production Manager ทันที',
        ieRecommendation:
          'หยุดประเมินสาเหตุหลักทันที (Major Line Stop / JIG Breakdown) พิจารณาเปิด Line สำรอง (SBS620 JIG B) หรือวางแผน Recovery OT',
        bgClass: 'bg-red-50',
        borderClass: 'border-red-500',
        textClass: 'text-red-800',
        accentHex: '#EF4444',
      };
    case 'level3_15pct':
      return {
        levelNumber: 3,
        badgeText: 'เตือนภัยระดับ 3: ต่ำกว่าแผน 15%',
        thresholdLabel: 'ต่ำกว่าแผน 15%',
        roleOwner: 'Industrial Engineer (IE)',
        actionInstruction: 'IE วิเคราะห์ Bottleneck + จัดกำลังคนใหม่',
        ieRecommendation:
          'วิศวกร IE ลงจับเวลา Cycle Time สถานีคอขวดเทียบ Takt Time ทันที และจัดสรร Relief Operator เสริมจุดที่ CT เกินเป้าหมาย',
        bgClass: 'bg-orange-50',
        borderClass: 'border-orange-500',
        textClass: 'text-orange-900',
        accentHex: '#F97316',
      };
    case 'level2_10pct':
      return {
        levelNumber: 2,
        badgeText: 'เตือนภัยระดับ 2: ต่ำกว่าแผน 10%',
        thresholdLabel: 'ต่ำกว่าแผน 10%',
        roleOwner: 'Production Supervisor',
        actionInstruction: 'Supervisor ลงตรวจ Line Balance',
        ieRecommendation:
          'Supervisor ตรวจสอบ WIP Buffer หน้าคอขวด (ต้องมีอย่างน้อย 1 ชม.) และเกลี่ยงานย่อยระหว่างสถานี JIG A / JIG B',
        bgClass: 'bg-amber-50',
        borderClass: 'border-amber-500',
        textClass: 'text-amber-900',
        accentHex: '#F59E0B',
      };
    case 'level1_5pct':
      return {
        levelNumber: 1,
        badgeText: 'แจ้งเตือนระดับ 1: ต่ำกว่าแผน 5%',
        thresholdLabel: 'ต่ำกว่าแผน 5%',
        roleOwner: 'Line Leader',
        actionInstruction: 'Leader แก้ไขหน้างาน',
        ieRecommendation:
          'Line Leader ตรวจสอบความพร้อมของชิ้นส่วนป้อนเข้าไลน์ ลด Micro-stop และคุมจังหวะการปล่อยชิ้นงานให้ตรงตาม Takt Time',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-600',
        textClass: 'text-emerald-900',
        accentHex: '#10B981',
      };
    case 'near_miss':
      return {
        levelNumber: 0,
        badgeText: 'เฝ้าระวัง: ต่ำกว่าแผนเล็กน้อย (< 5%)',
        thresholdLabel: 'ต่ำกว่าแผน < 5%',
        roleOwner: 'Line Leader',
        actionInstruction: 'เฝ้าระวังจังหวะ Takt Time หน้างาน',
        ieRecommendation:
          'ยอดผลิตต่ำกว่าแผนเล็กน้อยแต่ยังไม่เกินเกณฑ์ 5% ให้รักษาระดับความเร็วเพื่อชดเชยในชั่วโมงถัดไป',
        bgClass: 'bg-sky-50',
        borderClass: 'border-sky-400',
        textClass: 'text-sky-900',
        accentHex: '#0284C7',
      };
    default:
      return {
        levelNumber: 0,
        badgeText: 'ปกติ: ยอดผลิตตามเป้าหมาย (≥ 100%)',
        thresholdLabel: 'ตามแผน 100%',
        roleOwner: 'All Team',
        actionInstruction: 'รักษามาตรฐานการผลิตและคุณภาพ',
        ieRecommendation:
          'การผลิตเป็นไปตามแผน ควบคุมคุณภาพตามจุดโฟกัสของแต่ละรุ่นและเตรียมพร้อมสำหรับช่วงเปลี่ยนรุ่น (Changeover)',
        bgClass: 'bg-emerald-50',
        borderClass: 'border-emerald-500',
        textClass: 'text-emerald-900',
        accentHex: '#16A34A',
      };
  }
}

export const INITIAL_ACTION_LOGS: ActionLogEntry[] = [
  {
    id: 'log-1',
    timestamp: '20:00',
    hourLabel: 'Start Shift',
    severity: 'optimal',
    shortfallPercent: 0,
    ownerRole: 'IE Engineer',
    actionTaken: 'ผูกสูตรมาตรฐาน 1 JIG = 6 UPH (JIG A 10 ตัว + JIG B 9 ตัว = 114 UPH สูงสุด) เดินแผนจริง 1,080 เครื่อง ÷ 10.5 ชม. = 103 UPH',
    resolved: true,
  },
];
