import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Factory,
  Calendar,
  Clock,
  Target,
  Bell,
  Lightbulb,
  BarChart3,
  Settings,
  TrendingUp,
  CheckCircle2,
  Download,
  Printer,
  RotateCcw,
  Play,
  AlertTriangle,
  Sliders,
  Calculator,
  Cpu,
  FileSpreadsheet,
  FileText,
  Layers,
  Plus,
  Trash2,
  Save,
  Check,
  Cloud,
} from 'lucide-react';
import {
  ModelPlanItem,
  HourlyRecord,
  ShiftPlanConfig,
  ProductionKpiState,
  ActionLogEntry,
  AlertSeverity,
  FormulaCalculationMode,
} from './types/production';
import {
  DEFAULT_SHIFT_CONFIG,
  DEFAULT_MODELS,
  DEFAULT_KPI_STATE,
  INITIAL_ACTION_LOGS,
  generateHourlySchedule,
  computeGroupedModelFocus,
  ComputedHourlyRow,
  evaluateAlertSeverity,
  calculateModelFormulaBreakdown,
  isModelInLine,
  getModelLineQty,
  buildClockHourLabels,
} from './data/defaultPlan';
import { ModelDonutChart } from './components/ModelDonutChart';
import { RealtimeAlertBanner } from './components/RealtimeAlertBanner';
import { IeEngineeringPanel } from './components/IeEngineeringPanel';
import { FactoryManagerReport, LineSummaryMetrics } from './components/FactoryManagerReport';
import { DrivePivotDashboard } from './components/DrivePivotDashboard';
import { HistoricalShiftSnapshot } from './services/googleDriveService';

export type ActiveSheetTab = 'summary' | 'line_a' | 'line_b' | 'ie_config' | 'drive_pivot';

// Web Audio synthesizer for real-time shopfloor alert chime
function playAlertChime(severity: AlertSeverity) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (severity === 'level4_20pct' || severity === 'level3_15pct') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(440, now + 0.14); // A4
      osc.frequency.setValueAtTime(587.33, now + 0.28);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {
    // Ignore audio context restrictions if blocked
  }
}

function buildComputedHourlyRows(schedule: HourlyRecord[]): ComputedHourlyRow[] {
  let runningPlan = 0;
  let runningActual = 0;
  let hasAnyActualSoFar = false;

  let lastRecordedIdx = -1;
  schedule.forEach((r, idx) => {
    if (r.actual !== null) lastRecordedIdx = idx;
  });

  return schedule.map((row, idx) => {
    runningPlan += row.plan;
    const isRecorded = row.actual !== null;
    if (isRecorded) {
      runningActual += row.actual as number;
      hasAnyActualSoFar = true;
    }

    const showCum = isRecorded || (hasAnyActualSoFar && idx <= lastRecordedIdx);
    const diff = isRecorded ? (row.actual as number) - row.plan : null;
    const cumActual = showCum ? runningActual : null;
    const gap = showCum ? runningActual - runningPlan : null;
    const achvPercent =
      showCum && runningPlan > 0 ? (runningActual / runningPlan) * 100 : null;
    const rowSeverity = evaluateAlertSeverity(achvPercent);

    return {
      ...row,
      diff,
      cumPlan: runningPlan,
      cumActual,
      gap,
      achvPercent,
      rowSeverity,
    };
  });
}

const STORAGE_KEY = 'IE_PRODUCTION_PLAN_STORAGE_V1';

interface PersistedProductionState {
  shiftConfig: ShiftPlanConfig;
  models: ModelPlanItem[];
  hourlyRecordsA: HourlyRecord[];
  hourlyRecordsB: HourlyRecord[];
  kpiState: ProductionKpiState;
  actionLogs: ActionLogEntry[];
  savedAt: string;
}

function loadPersistedState(): Partial<PersistedProductionState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<PersistedProductionState>;
  } catch {
    return null;
  }
}

export default function App() {
  const initialSaved = useMemo(() => loadPersistedState(), []);

  const [activeSheet, setActiveSheet] = useState<ActiveSheetTab>('summary');
  const [showExecutiveReportInSummary, setShowExecutiveReportInSummary] = useState<boolean>(true);
  const [shiftConfig, setShiftConfig] = useState<ShiftPlanConfig>(() => ({
    ...DEFAULT_SHIFT_CONFIG,
    ...(initialSaved?.shiftConfig ?? {}),
    customHourLabels: initialSaved?.shiftConfig?.customHourLabels ?? {},
    shiftStartTime: initialSaved?.shiftConfig?.shiftStartTime ?? '20:00',
  }));
  const [models, setModels] = useState<ModelPlanItem[]>(() =>
    Array.isArray(initialSaved?.models) && initialSaved!.models.length > 0
      ? initialSaved!.models
      : DEFAULT_MODELS
  );
  const [kpiState, setKpiState] = useState<ProductionKpiState>(() => ({
    ...DEFAULT_KPI_STATE,
    ...(initialSaved?.kpiState ?? {}),
  }));

  // Separate hourly actual records for Line A and Line B (which automatically sum into Summary)
  const [hourlyRecordsA, setHourlyRecordsA] = useState<HourlyRecord[]>(() =>
    Array.isArray(initialSaved?.hourlyRecordsA) && initialSaved!.hourlyRecordsA.length > 0
      ? initialSaved!.hourlyRecordsA
      : generateHourlySchedule(574, 10.5)
  );
  const [hourlyRecordsB, setHourlyRecordsB] = useState<HourlyRecord[]>(() =>
    Array.isArray(initialSaved?.hourlyRecordsB) && initialSaved!.hourlyRecordsB.length > 0
      ? initialSaved!.hourlyRecordsB
      : generateHourlySchedule(506, 10.5)
  );

  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>(() =>
    Array.isArray(initialSaved?.actionLogs) && initialSaved!.actionLogs.length > 0
      ? initialSaved!.actionLogs
      : INITIAL_ACTION_LOGS
  );
  const [lastSavedTime, setLastSavedTime] = useState<string>(
    () =>
      initialSaved?.savedAt ||
      new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
  );
  const [justSavedFlash, setJustSavedFlash] = useState<boolean>(false);

  // Auto-save to localStorage whenever any plan, model, hour label, or hourly actual changes
  useEffect(() => {
    try {
      const nowStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const payload: PersistedProductionState = {
        shiftConfig,
        models,
        hourlyRecordsA,
        hourlyRecordsB,
        kpiState,
        actionLogs,
        savedAt: nowStr,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setLastSavedTime(nowStr);
    } catch {
      // Ignore storage quota errors
    }
  }, [shiftConfig, models, hourlyRecordsA, hourlyRecordsB, kpiState, actionLogs]);

  const handleManualSaveClick = useCallback(() => {
    try {
      const nowStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const payload: PersistedProductionState = {
        shiftConfig,
        models,
        hourlyRecordsA,
        hourlyRecordsB,
        kpiState,
        actionLogs,
        savedAt: nowStr,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setLastSavedTime(nowStr);
      setJustSavedFlash(true);
      setTimeout(() => setJustSavedFlash(false), 2000);
    } catch {
      // Ignore storage quota errors
    }
  }, [shiftConfig, models, hourlyRecordsA, hourlyRecordsB, kpiState, actionLogs]);

  // Quick inline Add Model state inside Summary Table (for Line A, Line B, and Summary)
  const [quickModelName, setQuickModelName] = useState<string>('');
  const [quickLineTarget, setQuickLineTarget] = useState<'A' | 'B'>('A');
  const [quickJigCount, setQuickJigCount] = useState<number>(1);
  const [quickQtyPlan, setQuickQtyPlan] = useState<number>(63);

  // Separate models into Line A, Line B, and All using isModelInLine
  const lineAModels = useMemo(
    () => models.filter((m) => isModelInLine(m, 'A')),
    [models]
  );
  const lineBModels = useMemo(
    () => models.filter((m) => isModelInLine(m, 'B')),
    [models]
  );

  const activeModelsForCurrentSheet = useMemo(() => {
    if (activeSheet === 'line_a') return lineAModels;
    if (activeSheet === 'line_b') return lineBModels;
    return models;
  }, [activeSheet, lineAModels, lineBModels, models]);

  // Quantities per line
  const rawSumA = useMemo(
    () => models.reduce((s, m) => s + getModelLineQty(m, 'A'), 0),
    [models]
  );
  const rawSumB = useMemo(
    () => models.reduce((s, m) => s + getModelLineQty(m, 'B'), 0),
    [models]
  );
  const rawModelSum = useMemo(
    () => models.reduce((sum, m) => sum + (Number(m.qtyPlan) || 0), 0),
    [models]
  );

  // In the reference board, TM19 (253.5) + TM21 (253.5) are displayed as 253 each while total shift is 1,080
  const totalPlantQty = useMemo(
    () =>
      shiftConfig.roundShiftTotalToTen && rawModelSum === 1079 && models.length === 9
        ? 1080
        : rawModelSum,
    [rawModelSum, models.length, shiftConfig.roundShiftTotalToTen]
  );
  const lineAQtyPlan = rawSumA;
  const lineBQtyPlan = useMemo(
    () =>
      shiftConfig.roundShiftTotalToTen && rawModelSum === 1079 && models.length === 9
        ? rawSumB + 1 // 506 so 574 + 506 = 1,080
        : rawSumB,
    [rawSumB, rawModelSum, models.length, shiftConfig.roundShiftTotalToTen]
  );

  // Synced hourly schedules for Line A, Line B, and Combined Plant (with custom editable Hour labels)
  const syncedScheduleA = useMemo(
    () =>
      generateHourlySchedule(
        lineAQtyPlan,
        shiftConfig.workingHours,
        hourlyRecordsA,
        shiftConfig.customHourLabels
      ),
    [lineAQtyPlan, shiftConfig.workingHours, hourlyRecordsA, shiftConfig.customHourLabels]
  );
  const syncedScheduleB = useMemo(
    () =>
      generateHourlySchedule(
        lineBQtyPlan,
        shiftConfig.workingHours,
        hourlyRecordsB,
        shiftConfig.customHourLabels
      ),
    [lineBQtyPlan, shiftConfig.workingHours, hourlyRecordsB, shiftConfig.customHourLabels]
  );

  const syncedScheduleTotal = useMemo(() => {
    const baseTotal = generateHourlySchedule(
      totalPlantQty,
      shiftConfig.workingHours,
      undefined,
      shiftConfig.customHourLabels
    );
    return baseTotal.map((slot, idx) => {
      const a = syncedScheduleA[idx];
      const b = syncedScheduleB[idx];
      const hasActual = (a && a.actual !== null) || (b && b.actual !== null);
      const sumActual = hasActual ? (a?.actual ?? 0) + (b?.actual ?? 0) : null;
      const combinedNote = [a?.note ? `A: ${a.note}` : '', b?.note ? `B: ${b.note}` : '']
        .filter(Boolean)
        .join(' | ');
      return {
        ...slot,
        actual: sumActual,
        note: combinedNote,
      };
    });
  }, [
    totalPlantQty,
    shiftConfig.workingHours,
    shiftConfig.customHourLabels,
    syncedScheduleA,
    syncedScheduleB,
  ]);

  const computedRowsA = useMemo(() => buildComputedHourlyRows(syncedScheduleA), [syncedScheduleA]);
  const computedRowsB = useMemo(() => buildComputedHourlyRows(syncedScheduleB), [syncedScheduleB]);
  const computedRowsTotal = useMemo(
    () => buildComputedHourlyRows(syncedScheduleTotal),
    [syncedScheduleTotal]
  );

  // Helper to build LineSummaryMetrics for Line A, Line B, and Total Plant
  const buildLineMetrics = useCallback(
    (
      lineId: 'A' | 'B' | 'TOTAL',
      lineName: string,
      subsetModels: ModelPlanItem[],
      qtyPlan: number,
      computedRows: ComputedHourlyRow[]
    ): LineSummaryMetrics => {
      const safeHours = shiftConfig.workingHours > 0 ? shiftConfig.workingHours : 10.5;
      const totalJigs = subsetModels.reduce(
        (s, m) =>
          s +
          (lineId === 'A'
            ? m.jigA
            : lineId === 'B'
            ? m.jigB
            : m.jigA + m.jigB),
        0
      );
      const activeJigs = subsetModels
        .filter((m) => m.qtyPlan > 0)
        .reduce(
          (s, m) =>
            s +
            (lineId === 'A'
              ? m.jigA
              : lineId === 'B'
              ? m.jigB
              : m.jigA + m.jigB),
          0
        );
      const maxJigUph = Math.round(totalJigs * shiftConfig.standardUphPerJig);
      const maxJigQty = Math.round(maxJigUph * safeHours);
      const exactUph = qtyPlan / safeHours;
      const targetUph = Math.round(exactUph);
      const taktTimeSec = qtyPlan > 0 ? (safeHours * 3600) / qtyPlan : 0;
      const jigUtilizationPercent = maxJigUph > 0 ? (exactUph / maxJigUph) * 100 : 0;
      const totalChangeoverMin = subsetModels
        .filter((m) => m.qtyPlan > 0)
        .reduce((s, m) => s + m.changeoverMin, 0);

      const recordedRows = computedRows.filter((r) => r.actual !== null);
      const latestRow = recordedRows.length > 0 ? recordedRows[recordedRows.length - 1] : null;
      const elapsedHours = latestRow
        ? computedRows
            .slice(0, computedRows.indexOf(latestRow) + 1)
            .reduce((s, r) => s + r.durationHours, 0)
        : 0;
      const remainingHours = Math.max(0, Number((safeHours - elapsedHours).toFixed(2)));
      const cumActual = latestRow?.cumActual ?? null;
      const remainingQty = Math.max(0, qtyPlan - (cumActual ?? 0));
      const requiredCatchupUph =
        remainingHours > 0 ? Math.ceil(remainingQty / remainingHours) : 0;

      return {
        lineId,
        lineName,
        modelsCount: subsetModels.length,
        activeModelsCount: subsetModels.filter((m) => m.qtyPlan > 0).length,
        standbyModelsCount: subsetModels.filter((m) => m.qtyPlan === 0).length,
        totalJigs,
        activeJigs,
        maxJigUph,
        maxJigQty,
        qtyPlan,
        sharePercent: totalPlantQty > 0 ? (qtyPlan / totalPlantQty) * 100 : 0,
        targetUph,
        exactUph,
        taktTimeSec,
        jigUtilizationPercent,
        totalChangeoverMin,
        latestHourLabel: latestRow?.label ?? null,
        cumPlanAtLatest: latestRow?.cumPlan ?? 0,
        cumActualAtLatest: cumActual,
        gapAtLatest: latestRow?.gap ?? null,
        achvPercentAtLatest: latestRow?.achvPercent ?? null,
        remainingHours,
        remainingQty,
        requiredCatchupUph,
        severity: latestRow?.rowSeverity ?? 'optimal',
      };
    },
    [shiftConfig.workingHours, shiftConfig.standardUphPerJig, totalPlantQty]
  );

  const lineAMetrics = useMemo(
    () => buildLineMetrics('A', 'Line A (JIG A)', lineAModels, lineAQtyPlan, computedRowsA),
    [buildLineMetrics, lineAModels, lineAQtyPlan, computedRowsA]
  );
  const lineBMetrics = useMemo(
    () => buildLineMetrics('B', 'Line B (JIG B)', lineBModels, lineBQtyPlan, computedRowsB),
    [buildLineMetrics, lineBModels, lineBQtyPlan, computedRowsB]
  );
  const totalMetrics = useMemo(
    () =>
      buildLineMetrics(
        'TOTAL',
        'Summary รวม 2 Line (A + B)',
        models,
        totalPlantQty,
        computedRowsTotal
      ),
    [buildLineMetrics, models, totalPlantQty, computedRowsTotal]
  );

  // Active metrics & hourly rows for whichever sheet is currently open
  const currentSheetMetrics = useMemo(() => {
    if (activeSheet === 'line_a') return lineAMetrics;
    if (activeSheet === 'line_b') return lineBMetrics;
    return totalMetrics;
  }, [activeSheet, lineAMetrics, lineBMetrics, totalMetrics]);

  const currentSheetHourlyRows = useMemo(() => {
    if (activeSheet === 'line_a') return computedRowsA;
    if (activeSheet === 'line_b') return computedRowsB;
    return computedRowsTotal;
  }, [activeSheet, computedRowsA, computedRowsB, computedRowsTotal]);

  // Grouped models for current sheet's Donut Chart & Process Focus bars
  const groupedFocusList = useMemo(
    () =>
      computeGroupedModelFocus(
        activeModelsForCurrentSheet,
        currentSheetMetrics.qtyPlan,
        shiftConfig.workingHours,
        activeSheet === 'summary' ? shiftConfig.groupTmModels : false
      ),
    [
      activeModelsForCurrentSheet,
      currentSheetMetrics.qtyPlan,
      shiftConfig.workingHours,
      activeSheet,
      shiftConfig.groupTmModels,
    ]
  );

  // Dynamic Key Focus Points (ประเด็นสำคัญที่ต้องติดตาม 1, 2, 3) for current sheet
  const keyFocusPoints = useMemo(() => {
    const active = groupedFocusList.filter((g) => g.qtyPlan > 0);
    const top1 = active[0];
    const top2 = active[1];
    const smallLots = active.filter(
      (g) => g.percent <= 12.0 && g.key !== top1?.key && g.key !== top2?.key
    );
    const smallest =
      smallLots.length > 0 ? smallLots[smallLots.length - 1] : active[active.length - 1];

    return {
      top1,
      top2,
      smallest,
    };
  }, [groupedFocusList]);

  // Selected model group for deep inspection in Bottom-Right Focus Box
  const selectedGroupDetail = useMemo(() => {
    if (!selectedGroupKey) return groupedFocusList[0] || null;
    return (
      groupedFocusList.find((g) => g.key === selectedGroupKey) ||
      groupedFocusList[0] ||
      null
    );
  }, [groupedFocusList, selectedGroupKey]);

  const sumOfSheetTableUph = useMemo(
    () => activeModelsForCurrentSheet.reduce((sum, m) => sum + (Number(m.uph) || 0), 0),
    [activeModelsForCurrentSheet]
  );

  const sheetJigATotal = useMemo(
    () => activeModelsForCurrentSheet.reduce((s, m) => s + (Number(m.jigA) || 0), 0),
    [activeModelsForCurrentSheet]
  );
  const sheetJigBTotal = useMemo(
    () => activeModelsForCurrentSheet.reduce((s, m) => s + (Number(m.jigB) || 0), 0),
    [activeModelsForCurrentSheet]
  );

  // ============================================================================
  // LINKED FORMULA HANDLERS (ผูกสูตรคำนวณ JIG <-> Q'ty Plan <-> UPH <-> ชั่วโมงการผลิต)
  // ============================================================================

  const handleUpdateWorkingHours = useCallback(
    (newHours: number) => {
      const safeHours = Math.max(0.5, Math.min(24, newHours));
      setShiftConfig((prev) => ({
        ...prev,
        workingHours: safeHours,
        roundShiftTotalToTen: false,
      }));

      setModels((prevModels) =>
        prevModels.map((m) => {
          if (
            shiftConfig.formulaMode === 'jig_drives_qty' ||
            shiftConfig.formulaMode === 'uph_drives_qty'
          ) {
            const newQty = Math.round(m.uph * safeHours);
            return {
              ...m,
              qtyPlan: newQty,
              highlightZero: newQty === 0,
            };
          } else {
            const newUph = Math.round(m.qtyPlan / safeHours);
            const totalJig = m.jigA + m.jigB;
            const maxCap = totalJig * shiftConfig.standardUphPerJig * safeHours;
            const util = maxCap > 0 ? Number(((m.qtyPlan / maxCap) * 100).toFixed(1)) : 0;
            return {
              ...m,
              uph: newUph,
              utilizationPercent: util,
            };
          }
        })
      );
    },
    [shiftConfig.formulaMode, shiftConfig.standardUphPerJig]
  );

  const handleUpdateStandardUphPerJig = useCallback(
    (newUphPerJig: number) => {
      const safeRate = Math.max(0.5, newUphPerJig);
      setShiftConfig((prev) => ({
        ...prev,
        standardUphPerJig: safeRate,
        roundShiftTotalToTen: false,
      }));

      if (shiftConfig.formulaMode === 'jig_drives_qty') {
        setModels((prevModels) =>
          prevModels.map((m) => {
            const totalJig = m.jigA + m.jigB;
            const utilFactor =
              m.qtyPlan === 0 && m.utilizationPercent === 0 ? 0 : m.utilizationPercent / 100;
            const newUph = Math.round(totalJig * safeRate * utilFactor);
            const newQty = Math.round(newUph * shiftConfig.workingHours);
            return {
              ...m,
              uph: newUph,
              qtyPlan: newQty,
              highlightZero: newQty === 0,
            };
          })
        );
      }
    },
    [shiftConfig.formulaMode, shiftConfig.workingHours]
  );

  const handleModelJigChange = useCallback(
    (id: string, newJigA: number, newJigB: number) => {
      const safeA = Math.max(0, newJigA);
      const safeB = Math.max(0, newJigB);
      const totalJig = safeA + safeB;

      setShiftConfig((prev) => ({ ...prev, roundShiftTotalToTen: false }));
      setModels((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const newUph = Math.round(totalJig * shiftConfig.standardUphPerJig);
          const newQty = Math.round(newUph * shiftConfig.workingHours);
          const nextLineAssign: 'A' | 'B' | 'BOTH' | undefined =
            safeA > 0 && safeB > 0
              ? 'BOTH'
              : safeA > 0
              ? 'A'
              : safeB > 0
              ? 'B'
              : m.lineAssignment;
          return {
            ...m,
            lineAssignment: nextLineAssign,
            jigA: safeA,
            jigB: safeB,
            uph: newUph,
            qtyPlan: newQty,
            utilizationPercent: totalJig > 0 ? 100 : 0,
            highlightZero: newQty === 0,
          };
        })
      );
    },
    [shiftConfig.standardUphPerJig, shiftConfig.workingHours]
  );

  const handleModelQtyChange = useCallback(
    (id: string, newQtyPlan: number) => {
      const safeQty = Math.max(0, newQtyPlan);
      const safeHours = shiftConfig.workingHours > 0 ? shiftConfig.workingHours : 10.5;
      const newUph = Math.round(safeQty / safeHours);

      setShiftConfig((prev) => ({ ...prev, roundShiftTotalToTen: false }));
      setModels((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const totalJig = m.jigA + m.jigB;
          const maxShiftCap = totalJig * shiftConfig.standardUphPerJig * safeHours;
          const newUtil =
            maxShiftCap > 0 ? Number(((safeQty / maxShiftCap) * 100).toFixed(1)) : 0;
          return {
            ...m,
            qtyPlan: safeQty,
            uph: newUph,
            utilizationPercent: newUtil,
            highlightZero: safeQty === 0,
          };
        })
      );
    },
    [shiftConfig.workingHours, shiftConfig.standardUphPerJig]
  );

  const handleModelUphChange = useCallback(
    (id: string, newUph: number) => {
      const safeUph = Math.max(0, newUph);
      const safeHours = shiftConfig.workingHours > 0 ? shiftConfig.workingHours : 10.5;
      const newQty = Math.round(safeUph * safeHours);

      setShiftConfig((prev) => ({ ...prev, roundShiftTotalToTen: false }));
      setModels((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const totalJig = m.jigA + m.jigB;
          const maxUphCap = totalJig * shiftConfig.standardUphPerJig;
          const newUtil =
            maxUphCap > 0 ? Number(((safeUph / maxUphCap) * 100).toFixed(1)) : 0;
          return {
            ...m,
            uph: safeUph,
            qtyPlan: newQty,
            utilizationPercent: newUtil,
            highlightZero: newQty === 0,
          };
        })
      );
    },
    [shiftConfig.workingHours, shiftConfig.standardUphPerJig]
  );

  const handleRecalculateAllFromJig = useCallback(() => {
    setShiftConfig((prev) => ({
      ...prev,
      formulaMode: 'jig_drives_qty',
      roundShiftTotalToTen: false,
    }));
    setModels((prev) =>
      prev.map((m) => {
        if (m.highlightZero && m.qtyPlan === 0) return m;
        const totalJig = m.jigA + m.jigB;
        const newUph = Math.round(totalJig * shiftConfig.standardUphPerJig);
        const newQty = Math.round(newUph * shiftConfig.workingHours);
        return {
          ...m,
          uph: newUph,
          qtyPlan: newQty,
          utilizationPercent: totalJig > 0 ? 100 : 0,
          highlightZero: newQty === 0,
        };
      })
    );
  }, [shiftConfig.standardUphPerJig, shiftConfig.workingHours]);

  const handleAutoAssignJigsFromQty = useCallback(() => {
    const safeHours = shiftConfig.workingHours > 0 ? shiftConfig.workingHours : 10.5;
    const safeRate = shiftConfig.standardUphPerJig > 0 ? shiftConfig.standardUphPerJig : 6;

    setShiftConfig((prev) => ({
      ...prev,
      formulaMode: 'qty_drives_uph',
    }));
    setModels((prev) =>
      prev.map((m) => {
        if (m.qtyPlan === 0) return { ...m, uph: 0 };
        const exactUph = m.qtyPlan / safeHours;
        const roundedUph = Math.round(exactUph);
        const recJigs = Math.max(1, Math.ceil(exactUph / safeRate));
        const useJigB = m.jigB > 0 && m.jigA === 0;
        return {
          ...m,
          uph: roundedUph,
          jigA: useJigB ? 0 : recJigs,
          jigB: useJigB ? recJigs : 0,
          utilizationPercent: Number(
            ((m.qtyPlan / (recJigs * safeRate * safeHours)) * 100).toFixed(1)
          ),
        };
      })
    );
  }, [shiftConfig.workingHours, shiftConfig.standardUphPerJig]);

  const handleResetDefaultPlan = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('IE_MANAGER_CUSTOM_NOTE_V1');
    } catch {
      // ignore storage errors
    }
    setShiftConfig(DEFAULT_SHIFT_CONFIG);
    setModels(DEFAULT_MODELS);
    setKpiState(DEFAULT_KPI_STATE);
    setActionLogs(INITIAL_ACTION_LOGS);
    setHourlyRecordsA(generateHourlySchedule(574, 10.5));
    setHourlyRecordsB(generateHourlySchedule(506, 10.5));
  }, []);

  const handleUpdateFormulaMode = useCallback(
    (mode: FormulaCalculationMode) => {
      setShiftConfig((prev) => ({ ...prev, formulaMode: mode }));
      if (mode === 'jig_drives_qty') {
        handleRecalculateAllFromJig();
      }
    },
    [handleRecalculateAllFromJig]
  );

  // Editable Hour Label Handler (syncs across Line A, Line B, and Summary + auto-saves)
  const handleUpdateHourLabel = useCallback((slotIndex: number, newLabel: string) => {
    setShiftConfig((prev) => ({
      ...prev,
      customHourLabels: {
        ...(prev.customHourLabels ?? {}),
        [slotIndex]: newLabel,
      },
    }));
  }, []);

  // Quick Clock Format Generator for all Hour rows
  const handleApplyClockFormat = useCallback(
    (mode: 'h_and_clock' | 'clock_only' | 'h_only') => {
      const startStr =
        shiftConfig.shiftStartTime || (shiftConfig.shiftType === 'night' ? '20:00' : '08:00');
      const generated = buildClockHourLabels(shiftConfig.workingHours, startStr, mode);
      setShiftConfig((prev) => ({
        ...prev,
        shiftStartTime: startStr,
        customHourLabels: generated,
      }));
    },
    [shiftConfig.workingHours, shiftConfig.shiftStartTime, shiftConfig.shiftType]
  );

  // Hourly Actual Input Handler by slotIndex (supports editing in Line A, Line B, or Combined Summary)
  const handleHourlyActualChange = useCallback(
    (slotIndex: number, valueStr: string) => {
      const parsed = valueStr.trim() === '' ? null : Math.max(0, Number(valueStr));

      if (activeSheet === 'line_a') {
        setHourlyRecordsA((prev) => {
          const cur = generateHourlySchedule(
            lineAQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, actual: parsed } : r));
        });
      } else if (activeSheet === 'line_b') {
        setHourlyRecordsB((prev) => {
          const cur = generateHourlySchedule(
            lineBQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, actual: parsed } : r));
        });
      } else {
        // Edited from Summary (Total A+B): Split proportionally between Line A and Line B
        const shareA = totalPlantQty > 0 ? lineAQtyPlan / totalPlantQty : 0.5315;
        const actA = parsed === null ? null : Math.round(parsed * shareA);
        const actB = parsed === null ? null : Math.max(0, parsed - (actA ?? 0));
        setHourlyRecordsA((prev) => {
          const cur = generateHourlySchedule(
            lineAQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, actual: actA } : r));
        });
        setHourlyRecordsB((prev) => {
          const cur = generateHourlySchedule(
            lineBQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, actual: actB } : r));
        });
      }
    },
    [
      activeSheet,
      lineAQtyPlan,
      lineBQtyPlan,
      totalPlantQty,
      shiftConfig.workingHours,
      shiftConfig.customHourLabels,
    ]
  );

  const handleHourlyNoteChange = useCallback(
    (slotIndex: number, note: string) => {
      if (activeSheet === 'line_b') {
        setHourlyRecordsB((prev) => {
          const cur = generateHourlySchedule(
            lineBQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, note } : r));
        });
      } else {
        setHourlyRecordsA((prev) => {
          const cur = generateHourlySchedule(
            lineAQtyPlan,
            shiftConfig.workingHours,
            prev,
            shiftConfig.customHourLabels
          );
          return cur.map((r, idx) => (idx === slotIndex ? { ...r, note } : r));
        });
      }
    },
    [activeSheet, lineAQtyPlan, lineBQtyPlan, shiftConfig.workingHours, shiftConfig.customHourLabels]
  );

  const handleUpdateModel = useCallback((id: string, patch: Partial<ModelPlanItem>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const handleAddModel = useCallback((item: Omit<ModelPlanItem, 'id'>) => {
    const id = `m-${Date.now()}`;
    setShiftConfig((prev) => ({ ...prev, roundShiftTotalToTen: false }));
    setModels((prev) => [...prev, { ...item, id }]);
  }, []);

  const handleDeleteModel = useCallback((id: string) => {
    setShiftConfig((prev) => ({ ...prev, roundShiftTotalToTen: false }));
    setModels((prev) => (prev.length > 1 ? prev.filter((m) => m.id !== id) : prev));
  }, []);

  // Scenario Simulation Presets (populates both Line A and Line B simultaneously!)
  const applyScenario = (
    mode: 'reset_blank' | 'on_target' | 'warn_12pct' | 'critical_21pct'
  ) => {
    const baseA = generateHourlySchedule(lineAQtyPlan, shiftConfig.workingHours);
    const baseB = generateHourlySchedule(lineBQtyPlan, shiftConfig.workingHours);

    if (mode === 'reset_blank') {
      setHourlyRecordsA(baseA.map((r) => ({ ...r, actual: null, note: '' })));
      setHourlyRecordsB(baseB.map((r) => ({ ...r, actual: null, note: '' })));
      return;
    }

    if (mode === 'on_target') {
      setHourlyRecordsA(
        baseA.map((r, idx) =>
          idx < 6
            ? { ...r, actual: r.plan + (idx % 2 === 0 ? 1 : 0), note: 'เดินเครื่องปกติ' }
            : { ...r, actual: null, note: '' }
        )
      );
      setHourlyRecordsB(
        baseB.map((r, idx) =>
          idx < 6
            ? { ...r, actual: r.plan + (idx % 2 === 1 ? 1 : -1), note: 'เดินเครื่องปกติ' }
            : { ...r, actual: null, note: '' }
        )
      );
      return;
    }

    if (mode === 'warn_12pct') {
      setHourlyRecordsA(
        baseA.map((r, idx) =>
          idx < 5
            ? {
                ...r,
                actual: Math.round(r.plan * 0.89),
                note: idx === 2 ? 'เปลี่ยนรุ่น T520 -> BM23 ล่าช้า 8 นาที' : 'รอชิ้นส่วนย่อย',
              }
            : { ...r, actual: null, note: '' }
        )
      );
      setHourlyRecordsB(
        baseB.map((r, idx) =>
          idx < 5
            ? {
                ...r,
                actual: Math.round(r.plan * 0.87),
                note: idx === 3 ? 'ตั้งค่า JIG B รุ่น SBS550 ใหม่' : 'คอยล์เย็นเข้าช้า',
              }
            : { ...r, actual: null, note: '' }
        )
      );
      if (soundEnabled) playAlertChime('level2_10pct');
      return;
    }

    if (mode === 'critical_21pct') {
      setHourlyRecordsA(
        baseA.map((r, idx) =>
          idx < 4
            ? {
                ...r,
                actual: Math.round(r.plan * 0.78),
                note: idx === 1 ? 'JIG A สถานีอัดโฟมขัดข้อง 15 นาที' : 'CT คอขวดเกิน Takt Time',
              }
            : { ...r, actual: null, note: '' }
        )
      );
      setHourlyRecordsB(
        baseB.map((r, idx) =>
          idx < 4
            ? {
                ...r,
                actual: Math.round(r.plan * 0.79),
                note: 'รอชุดแผงควบคุมรุ่น TM21',
              }
            : { ...r, actual: null, note: '' }
        )
      );
      if (soundEnabled) playAlertChime('level4_20pct');
    }
  };

  // Export CSV handler (Exports Summary + Line A + Line B)
  const handleExportCsv = () => {
    const headers = [
      'Hour',
      'Line A Plan',
      'Line A Actual',
      'Line B Plan',
      'Line B Actual',
      'Total Plan (A+B)',
      'Total Actual (A+B)',
      'Cum Plan',
      'Cum Actual',
      'Gap',
      '% Achv',
      'Note',
    ];
    const rows = computedRowsTotal.map((r, idx) => {
      const a = computedRowsA[idx];
      const b = computedRowsB[idx];
      return [
        r.label,
        a?.plan ?? 0,
        a?.actual ?? '',
        b?.plan ?? 0,
        b?.actual ?? '',
        r.plan,
        r.actual ?? '',
        r.cumPlan,
        r.cumActual ?? '',
        r.gap ?? '',
        r.achvPercent !== null ? `${r.achvPercent.toFixed(1)}%` : '',
        `"${(r.note || '').replace(/"/g, '""')}"`,
      ];
    });
    const csvContent =
      '\uFEFF' +
      `แผนการผลิต: ${shiftConfig.planTitle},วันที่: ${shiftConfig.dateDisplay},เวลาทำงาน: ${shiftConfig.workingHours} ชม.,รวมทั้งโรงงาน: ${totalPlantQty} เครื่อง (${totalMetrics.targetUph} UPH),Line A: ${lineAQtyPlan} เครื่อง (${lineAMetrics.targetUph} UPH),Line B: ${lineBQtyPlan} เครื่อง (${lineBMetrics.targetUph} UPH)\n\n` +
      headers.join(',') +
      '\n' +
      rows.map((e) => e.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IE_Production_Summary_LineA_LineB_${shiftConfig.dateDisplay.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load a historical shift snapshot from Google Drive / Pivot History onto the active production board
  const handleLoadSnapshotToBoard = useCallback((snapshot: HistoricalShiftSnapshot) => {
    setShiftConfig(snapshot.shiftConfig);
    setModels(snapshot.models);
    setHourlyRecordsA(snapshot.hourlyRecordsA);
    setHourlyRecordsB(snapshot.hourlyRecordsB);
    if (snapshot.kpiState) setKpiState(snapshot.kpiState);
    if (snapshot.actionLogs) setActionLogs(snapshot.actionLogs);
    setActiveSheet('summary');
  }, []);

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 pb-10">
      {/* Top Bar Contract: 3 Zones (Brand, Sheet Tabs, Actions) */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 no-print">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSheet('summary');
          }}
          className="text-base font-bold tracking-tight text-[#0B4F8A] whitespace-nowrap"
        >
          IE Production Control
        </a>

        {/* Zone 2: Workbook Sheet Tabs (Summary A+B, Sheet Line A, Sheet Line B, IE Matrix) */}
        <nav
          className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto"
          aria-label="เลือกแผ่นงานสายการผลิต (Production Sheets)"
        >
          <button
            type="button"
            onClick={() => setActiveSheet('summary')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSheet === 'summary'
                ? 'bg-[#0B4F8A] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Summary รวม 2 Line &amp; รายงานผู้จัดการ ({totalPlantQty.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSheet('line_a');
              setSelectedGroupKey('TM19');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSheet === 'line_a'
                ? 'bg-[#0B4F8A] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Sheet: Line A ({lineAQtyPlan.toLocaleString()} เครื่อง · {lineAMetrics.targetUph} UPH)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSheet('line_b');
              setSelectedGroupKey('TM21');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSheet === 'line_b'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Sheet: Line B ({lineBQtyPlan.toLocaleString()} เครื่อง · {lineBMetrics.targetUph} UPH)
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet('ie_config')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSheet === 'ie_config'
                ? 'bg-[#0B4F8A] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            ตั้งค่าผูกสูตร IE Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSheet('drive_pivot')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              activeSheet === 'drive_pivot'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Google Drive &amp; Pivot ย้อนหลัง</span>
          </button>
        </nav>

        {/* Zone 3: Auto-Save Indicator + Primary Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualSaveClick}
            title="ระบบบันทึกข้อมูลทุกการแก้ไขลงเบราว์เซอร์ให้อัตโนมัติ (คลิกเพื่อบันทึกซ้ำทันที)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              justSavedFlash
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            {justSavedFlash ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>บันทึกแล้ว!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-emerald-700" />
                <span className="hidden sm:inline">บันทึกอัตโนมัติ</span>
                <span className="font-mono-num text-[11px] text-emerald-700">
                  ({lastSavedTime})
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#0B4F8A]" />
            <span>ส่งออก CSV (A+B)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B4F8A] rounded-lg hover:bg-[#083B66] transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์บอร์ด/รายงาน</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-5 pt-4 space-y-4">
        {/* Royal-Blue Production Plan Header Banner */}
        <section
          className={`text-white rounded-xl px-4 sm:px-6 py-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
            activeSheet === 'line_b'
              ? 'bg-gradient-to-r from-indigo-950 via-indigo-800 to-indigo-700'
              : 'bg-gradient-to-r from-[#083B66] via-[#0B4F8A] to-[#0E5A9C]'
          }`}
          aria-label="หัวข้อแผนการผลิตและข้อมูลกะ"
        >
          {/* Left: Factory Icon + Title + Active Sheet Badge */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
              <Factory className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  aria-label="ชื่อแผนการผลิต"
                  value={shiftConfig.planTitle}
                  onChange={(e) =>
                    setShiftConfig((prev) => ({ ...prev, planTitle: e.target.value }))
                  }
                  className="text-xl sm:text-2xl font-bold tracking-tight bg-transparent border-b border-transparent hover:border-white/40 focus:border-white focus:outline-none text-white"
                />
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 whitespace-nowrap">
                  {activeSheet === 'line_a'
                    ? 'SHEET: LINE A (JIG A)'
                    : activeSheet === 'line_b'
                    ? 'SHEET: LINE B (JIG B)'
                    : activeSheet === 'summary'
                    ? 'SHEET: SUMMARY (LINE A + LINE B)'
                    : 'IE FORMULA MATRIX'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-sky-100 font-medium">
                Production Plan &amp; Hourly Tracking —{' '}
                {activeSheet === 'line_a'
                  ? `เฉพาะสายการผลิต Line A (${lineAMetrics.totalJigs} JIG A · เป้า ${lineAMetrics.qtyPlan.toLocaleString()} เครื่อง)`
                  : activeSheet === 'line_b'
                  ? `เฉพาะสายการผลิต Line B (${lineBMetrics.totalJigs} JIG B · เป้า ${lineBMetrics.qtyPlan.toLocaleString()} เครื่อง)`
                  : `ภาพรวมทั้ง 2 สายการผลิต Line A + Line B (เป้า ${totalPlantQty.toLocaleString()} เครื่อง)`}
              </p>
            </div>
          </div>

          {/* Center: Date & Working Hours + Standard UPH/JIG */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-3 lg:border-l border-white/20 lg:pl-5">
              <Calendar className="w-6 h-6 text-sky-200 flex-shrink-0" />
              <div>
                <div className="text-[11px] text-sky-200 font-medium">วันที่</div>
                <input
                  type="text"
                  aria-label="วันที่ผลิต"
                  value={shiftConfig.dateDisplay}
                  onChange={(e) =>
                    setShiftConfig((prev) => ({ ...prev, dateDisplay: e.target.value }))
                  }
                  className="text-base sm:text-lg font-bold bg-transparent border-b border-transparent hover:border-white/40 focus:border-white focus:outline-none text-white w-28"
                />
                <div className="text-[11px] text-sky-100 flex items-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setShiftConfig((prev) => ({
                        ...prev,
                        shiftType: prev.shiftType === 'night' ? 'day' : 'night',
                        planTitle:
                          prev.shiftType === 'night'
                            ? 'แผนการผลิตกะกลางวัน'
                            : 'แผนการผลิตกะกลางคืน',
                      }))
                    }
                    className="underline decoration-sky-300/60 hover:text-white whitespace-nowrap"
                  >
                    ({shiftConfig.shiftType === 'night' ? 'Night Shift' : 'Day Shift'})
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/10 border border-white/25 rounded-xl px-3.5 py-2">
              <Clock className="w-6 h-6 text-sky-200 flex-shrink-0" />
              <div>
                <label htmlFor="working-hours-input" className="block text-[11px] text-sky-100">
                  เวลาทำงาน (ผูกสูตรอัตโนมัติ)
                </label>
                <div className="flex items-baseline gap-1.5">
                  <input
                    id="working-hours-input"
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={shiftConfig.workingHours}
                    onChange={(e) => handleUpdateWorkingHours(Number(e.target.value))}
                    className="w-14 text-lg sm:text-xl font-bold font-mono-num bg-transparent border-b border-white/40 focus:border-white focus:outline-none text-white"
                  />
                  <span className="text-sm font-bold">ชม.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/10 border border-white/25 rounded-xl px-3.5 py-2">
              <Cpu className="w-6 h-6 text-amber-300 flex-shrink-0" />
              <div>
                <label htmlFor="uph-per-jig-input" className="block text-[11px] text-sky-100">
                  มาตรฐาน UPH / 1 JIG
                </label>
                <div className="flex items-baseline gap-1.5">
                  <input
                    id="uph-per-jig-input"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="100"
                    value={shiftConfig.standardUphPerJig}
                    onChange={(e) => handleUpdateStandardUphPerJig(Number(e.target.value))}
                    className="w-12 text-lg sm:text-xl font-bold font-mono-num bg-transparent border-b border-white/40 focus:border-white focus:outline-none text-amber-300"
                  />
                  <span className="text-xs font-bold text-sky-100">เครื่อง/ชม.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Motto & Quick Simulation Controls */}
          <div className="flex flex-col items-end justify-center gap-1.5">
            <div className="text-right italic font-semibold text-xs sm:text-sm text-sky-100 leading-snug">
              Better Quality · Higher Efficiency · Together
            </div>
            <div className="flex flex-wrap items-center gap-1.5 no-print">
              <button
                type="button"
                onClick={handleResetDefaultPlan}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white border border-white/20 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>รีเซ็ตแผนต้นฉบับ</span>
              </button>
              <button
                type="button"
                onClick={() => applyScenario('on_target')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/30 hover:bg-emerald-500/40 text-[11px] font-medium text-white border border-emerald-300/40 transition-colors whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                <span>จำลอง: ตามแผน</span>
              </button>
              <button
                type="button"
                onClick={() => applyScenario('warn_12pct')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/30 hover:bg-amber-500/40 text-[11px] font-medium text-white border border-amber-300/40 transition-colors whitespace-nowrap"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>จำลอง: ต่ำกว่าแผน 12%</span>
              </button>
              <button
                type="button"
                onClick={() => applyScenario('critical_21pct')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/40 hover:bg-red-500/50 text-[11px] font-medium text-white border border-red-300/40 transition-colors whitespace-nowrap"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>จำลอง: วิกฤต 21%</span>
              </button>
            </div>
          </div>
        </section>

        {/* Interactive Sheet Switcher Bar + Live Formula Relationship Display */}
        <section
          className="bg-white rounded-xl border border-slate-300 p-3.5 shadow-2xs space-y-3"
          aria-label="แถบสลับ Sheet สายการผลิตและแสดงสูตรคำนวณ"
        >
          {/* Row 1: Prominent Visual Sheet Selector Cards (Summary A+B | Sheet Line A | Sheet Line B | Google Drive & Pivot) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 no-print">
            <button
              type="button"
              onClick={() => setActiveSheet('summary')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                activeSheet === 'summary'
                  ? 'bg-emerald-50/90 border-emerald-600 ring-2 ring-emerald-600'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <FileText className="w-4 h-4 text-emerald-700" />
                  <span>Sheet 1: Summary (รวม 2 Line + รายงานผู้จัดการ)</span>
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono-num">
                  รวม {totalMetrics.totalJigs} JIG · เป้า{' '}
                  <strong className="text-slate-900">
                    {totalMetrics.qtyPlan.toLocaleString()} เครื่อง
                  </strong>{' '}
                  ({totalMetrics.targetUph} UPH)
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-white px-2 py-1 rounded border border-emerald-200 font-mono-num">
                100%
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSheet('line_a');
                setSelectedGroupKey('TM19');
              }}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                activeSheet === 'line_a'
                  ? 'bg-sky-50/90 border-[#0B4F8A] ring-2 ring-[#0B4F8A]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#083B66]">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B4F8A]" />
                  <span>Sheet 2: Line A (แยกเฉพาะ JIG A)</span>
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono-num">
                  JIG A {lineAMetrics.totalJigs} ตัว · เป้า{' '}
                  <strong className="text-slate-900">
                    {lineAMetrics.qtyPlan.toLocaleString()} เครื่อง
                  </strong>{' '}
                  ({lineAMetrics.targetUph} UPH)
                </div>
              </div>
              <span className="text-xs font-bold text-[#0B4F8A] bg-white px-2 py-1 rounded border border-sky-200 font-mono-num">
                {lineAMetrics.sharePercent.toFixed(1)}%
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSheet('line_b');
                setSelectedGroupKey('TM21');
              }}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                activeSheet === 'line_b'
                  ? 'bg-indigo-50/90 border-indigo-600 ring-2 ring-indigo-600'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-700" />
                  <span>Sheet 3: Line B (แยกเฉพาะ JIG B)</span>
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono-num">
                  JIG B {lineBMetrics.totalJigs} ตัว · เป้า{' '}
                  <strong className="text-slate-900">
                    {lineBMetrics.qtyPlan.toLocaleString()} เครื่อง
                  </strong>{' '}
                  ({lineBMetrics.targetUph} UPH)
                </div>
              </div>
              <span className="text-xs font-bold text-indigo-800 bg-white px-2 py-1 rounded border border-indigo-200 font-mono-num">
                {lineBMetrics.sharePercent.toFixed(1)}%
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('drive_pivot')}
              className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                activeSheet === 'drive_pivot'
                  ? 'bg-emerald-50/90 border-emerald-700 ring-2 ring-emerald-700'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <Cloud className="w-4 h-4 text-emerald-700" />
                  <span>Sheet 4: Google Drive &amp; Pivot ย้อนหลัง</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  ซิงค์ไฟล์แผนการผลิตลง Google Drive · วิเคราะห์ตาราง Pivot ย้อนหลัง
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-white px-2 py-1 rounded border border-emerald-200 whitespace-nowrap">
                Cloud + Pivot
              </span>
            </button>
          </div>

          {/* Row 2: Formula Equations Display */}
          <div className="pt-2 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#083B66] bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-md">
                <Calculator className="w-3.5 h-3.5 text-[#0B4F8A]" />
                <span>
                  สูตรคำนวณ ({currentSheetMetrics.lineName} · {shiftConfig.workingHours} ชม.):
                </span>
              </span>

              <div className="flex flex-wrap items-center gap-2 font-mono-num text-slate-800">
                <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200">
                  <strong>UPH จริง</strong> = {currentSheetMetrics.qtyPlan.toLocaleString()} ÷{' '}
                  {shiftConfig.workingHours} ชม. ={' '}
                  <strong className="text-[#0B4F8A]">{currentSheetMetrics.targetUph} UPH</strong>
                </span>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200">
                  <strong>Max UPH ตาม JIG</strong> = {currentSheetMetrics.totalJigs} JIG ×{' '}
                  {shiftConfig.standardUphPerJig} ={' '}
                  <strong className="text-[#0B4F8A]">
                    {currentSheetMetrics.maxJigUph} UPH ({currentSheetMetrics.maxJigQty.toLocaleString()} เครื่อง)
                  </strong>
                </span>
              </div>
            </div>

            {/* Toggle Executive Manager Report visibility when on Summary tab */}
            <div className="flex flex-wrap items-center gap-2 no-print">
              {activeSheet === 'summary' && (
                <button
                  type="button"
                  onClick={() => setShowExecutiveReportInSummary((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap ${
                    showExecutiveReportInSummary
                      ? 'bg-amber-400 text-slate-950 border-amber-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {showExecutiveReportInSummary
                      ? 'ซ่อนรายงานบทสรุปผู้จัดการโรงงาน'
                      : 'แสดงรายงานบทสรุปผู้จัดการโรงงาน'}
                  </span>
                </button>
              )}

              <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleUpdateFormulaMode('qty_drives_uph')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    shiftConfig.formulaMode === 'qty_drives_uph'
                      ? 'bg-[#0B4F8A] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  คง Q&apos;ty ➔ คำนวณ UPH
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setShiftConfig((prev) => ({ ...prev, formulaMode: 'uph_drives_qty' }))
                  }
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    shiftConfig.formulaMode === 'uph_drives_qty' ||
                    shiftConfig.formulaMode === 'jig_drives_qty'
                      ? 'bg-[#0B4F8A] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  คง UPH/JIG ➔ คำนวณ Q&apos;ty
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Real-Time Alert & Action Plan Escalation Banner (Contextual to current Sheet!) */}
        <RealtimeAlertBanner
          currentSeverity={currentSheetMetrics.severity}
          latestRecordedHourLabel={currentSheetMetrics.latestHourLabel}
          cumPlanAtLatest={currentSheetMetrics.cumPlanAtLatest}
          cumActualAtLatest={currentSheetMetrics.cumActualAtLatest ?? 0}
          achvPercentAtLatest={currentSheetMetrics.achvPercentAtLatest}
          remainingQty={currentSheetMetrics.remainingQty}
          remainingHours={currentSheetMetrics.remainingHours}
          baseUph={currentSheetMetrics.targetUph}
          requiredCatchupUph={currentSheetMetrics.requiredCatchupUph}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((v) => !v)}
          actionLogs={actionLogs}
          onAddActionLog={(entry) =>
            setActionLogs((prev) => [
              {
                ...entry,
                id: `log-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
              ...prev,
            ])
          }
          onToggleResolveLog={(id) =>
            setActionLogs((prev) =>
              prev.map((l) => (l.id === id ? { ...l, resolved: !l.resolved } : l))
            )
          }
        />

        {/* Executive Summary & Analytical Report for Factory Manager (Shown on Summary Sheet) */}
        {activeSheet === 'summary' && showExecutiveReportInSummary && (
          <FactoryManagerReport
            shiftConfig={shiftConfig}
            models={models}
            lineAMetrics={lineAMetrics}
            lineBMetrics={lineBMetrics}
            totalMetrics={totalMetrics}
            lineAHourlyRows={computedRowsA}
            lineBHourlyRows={computedRowsB}
            totalHourlyRows={computedRowsTotal}
            kpiState={kpiState}
            onNavigateSheet={setActiveSheet}
            onUpdateHourLabel={handleUpdateHourLabel}
          />
        )}

        {activeSheet === 'drive_pivot' ? (
          <DrivePivotDashboard
            currentShiftConfig={shiftConfig}
            currentModels={models}
            currentHourlyA={hourlyRecordsA}
            currentHourlyB={hourlyRecordsB}
            currentKpiState={kpiState}
            currentActionLogs={actionLogs}
            onLoadSnapshotToBoard={handleLoadSnapshotToBoard}
          />
        ) : activeSheet === 'ie_config' ? (
          <IeEngineeringPanel
            models={models}
            workingHours={shiftConfig.workingHours}
            standardUphPerJig={shiftConfig.standardUphPerJig}
            formulaMode={shiftConfig.formulaMode}
            totalQty={totalPlantQty}
            actualUph={totalMetrics.targetUph}
            kpiState={kpiState}
            onUpdateWorkingHours={handleUpdateWorkingHours}
            onUpdateStandardUphPerJig={handleUpdateStandardUphPerJig}
            onUpdateFormulaMode={handleUpdateFormulaMode}
            onChangeModelJig={handleModelJigChange}
            onChangeModelQty={handleModelQtyChange}
            onChangeModelUph={handleModelUphChange}
            onUpdateModel={handleUpdateModel}
            onAddModel={handleAddModel}
            onDeleteModel={handleDeleteModel}
            onUpdateKpi={(patch) => setKpiState((prev) => ({ ...prev, ...patch }))}
            onRecalculateAllFromJig={handleRecalculateAllFromJig}
            onAutoAssignJigsFromQty={handleAutoAssignJigsFromQty}
          />
        ) : (
          <>
            {/* UPPER 3-COLUMN BOARD (Contextual to Summary, Line A, or Line B!) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* COLUMN 1 (4 cols): สรุปแผนการผลิต (Interactive Formula-Linked Table) */}
              <section
                className="lg:col-span-4 bg-white rounded-xl border border-slate-300 overflow-hidden flex flex-col"
                aria-label={`สรุปแผนการผลิต ${currentSheetMetrics.lineName}`}
              >
                <div
                  className={`text-white px-4 py-2.5 flex items-center justify-between ${
                    activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                    <Target className="w-4 h-4 text-sky-200" />
                    <h2>
                      สรุปแผนการผลิต{' '}
                      {activeSheet === 'line_a'
                        ? '(Line A)'
                        : activeSheet === 'line_b'
                        ? '(Line B)'
                        : '(รวม A+B)'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 no-print">
                    <button
                      type="button"
                      onClick={handleRecalculateAllFromJig}
                      title="คำนวณ UPH = JIG × 6 และ Q'ty Plan = UPH × ชม.ทำงาน"
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors whitespace-nowrap"
                    >
                      คำนวณจาก JIG
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoAssignJigsFromQty}
                      title="คำนวณจำนวน JIG ที่ต้องใช้จาก Q'ty Plan ÷ ชม.ทำงาน"
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500/40 hover:bg-emerald-500/60 text-white border border-emerald-300/40 transition-colors whitespace-nowrap"
                    >
                      จัด JIG ตามแผน
                    </button>
                  </div>
                </div>

                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr
                          className={`text-white font-semibold ${
                            activeSheet === 'line_b' ? 'bg-indigo-900' : 'bg-[#0F528C]'
                          }`}
                        >
                          <th className="py-2 px-2 text-left border border-slate-300">Model</th>
                          {activeSheet !== 'line_b' && (
                            <th
                              className="py-2 px-1.5 text-center border border-slate-300"
                              title={`1 JIG = ${shiftConfig.standardUphPerJig} UPH`}
                            >
                              JIG A
                            </th>
                          )}
                          {activeSheet !== 'line_a' && (
                            <th
                              className="py-2 px-1.5 text-center border border-slate-300"
                              title={`1 JIG = ${shiftConfig.standardUphPerJig} UPH`}
                            >
                              JIG B
                            </th>
                          )}
                          <th
                            className="py-2 px-2 text-right border border-slate-300"
                            title={`Q'ty Plan = UPH × ${shiftConfig.workingHours} ชม.`}
                          >
                            Q&apos;ty Plan
                          </th>
                            <th
                              className="py-2 px-2 text-right border border-slate-300"
                              title={`UPH = Q'ty Plan ÷ ${shiftConfig.workingHours} ชม.`}
                            >
                              UPH
                            </th>
                            <th className="py-2 px-1 text-center border border-slate-300 no-print">
                              ลบ
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeModelsForCurrentSheet.map((m) => {
                            const groupKey =
                              activeSheet === 'summary' && shiftConfig.groupTmModels && m.groupKey
                                ? m.groupKey
                                : m.modelName;
                            const isSelected = selectedGroupDetail?.key === groupKey;
                            const isZeroRow = m.qtyPlan === 0 || m.highlightZero;
                            const f = calculateModelFormulaBreakdown(
                              m,
                              shiftConfig.workingHours,
                              shiftConfig.standardUphPerJig
                            );

                            return (
                              <tr
                                key={m.id}
                                onClick={() => setSelectedGroupKey(groupKey)}
                                className={`cursor-pointer transition-colors ${
                                  isZeroRow
                                    ? 'bg-[#FEF08A] font-semibold text-slate-900'
                                    : isSelected
                                    ? 'bg-sky-50'
                                    : 'even:bg-slate-50/70 hover:bg-slate-100/70'
                                }`}
                              >
                                <td className="py-1 px-1.5 border border-slate-200 font-semibold text-slate-900">
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                      <span
                                        className="w-2 h-2 rounded-xs flex-shrink-0"
                                        style={{ backgroundColor: m.color }}
                                      />
                                      <input
                                        type="text"
                                        aria-label={`ชื่อรุ่น ${m.modelName}`}
                                        value={m.modelName}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) =>
                                          handleUpdateModel(m.id, { modelName: e.target.value })
                                        }
                                        className="w-full min-w-[56px] px-1 py-0.5 font-bold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {activeSheet === 'summary' && (
                                        <button
                                          type="button"
                                          title="คลิกเพื่อสลับสายการผลิต Line A / Line B"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const totalJ = Math.max(1, m.jigA + m.jigB);
                                            const isCurrentlyB =
                                              isModelInLine(m, 'B') && !isModelInLine(m, 'A');
                                            if (isCurrentlyB) {
                                              handleUpdateModel(m.id, {
                                                lineAssignment: 'A',
                                                jigA: totalJ,
                                                jigB: 0,
                                              });
                                            } else {
                                              handleUpdateModel(m.id, {
                                                lineAssignment: 'B',
                                                jigA: 0,
                                                jigB: totalJ,
                                              });
                                            }
                                          }}
                                          className={`px-1 py-0.5 rounded text-[9px] font-bold border no-print ${
                                            m.jigA > 0 && m.jigB > 0
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                              : isModelInLine(m, 'B') && !isModelInLine(m, 'A')
                                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                              : 'bg-sky-50 text-[#0B4F8A] border-sky-200'
                                          }`}
                                        >
                                          {m.jigA > 0 && m.jigB > 0
                                            ? 'A+B'
                                            : isModelInLine(m, 'B') && !isModelInLine(m, 'A')
                                            ? 'B'
                                            : 'A'}
                                        </button>
                                      )}
                                      {f.isOverCapacity && (
                                        <span
                                          className="text-[10px] text-red-600 font-mono-num"
                                          title={`เกินกำลัง JIG (${f.maxJigUphCapacity} UPH) แนะนำใช้ ${f.recommendedJigCount} JIG`}
                                        >
                                          !JIG
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Editable JIG A (shown in Summary and Line A) */}
                                {activeSheet !== 'line_b' && (
                                  <td className="py-1 px-1 text-center border border-slate-200 font-mono-num">
                                    <input
                                      type="number"
                                      min="0"
                                      aria-label={`JIG A รุ่น ${m.modelName}`}
                                      value={m.jigA === 0 ? '' : m.jigA}
                                      placeholder=""
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        handleModelJigChange(
                                          m.id,
                                          e.target.value === '' ? 0 : Number(e.target.value),
                                          m.jigB
                                        )
                                      }
                                      className="w-11 px-1 py-0.5 text-center font-semibold bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                    />
                                  </td>
                                )}

                                {/* Editable JIG B (shown in Summary and Line B) */}
                                {activeSheet !== 'line_a' && (
                                  <td className="py-1 px-1 text-center border border-slate-200 font-mono-num">
                                    <input
                                      type="number"
                                      min="0"
                                      aria-label={`JIG B รุ่น ${m.modelName}`}
                                      value={m.jigB === 0 ? '' : m.jigB}
                                      placeholder=""
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) =>
                                        handleModelJigChange(
                                          m.id,
                                          m.jigA,
                                          e.target.value === '' ? 0 : Number(e.target.value)
                                        )
                                      }
                                      className="w-11 px-1 py-0.5 text-center font-semibold bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                    />
                                  </td>
                                )}

                                {/* Editable Q'ty Plan */}
                                <td className="py-1 px-1 text-right border border-slate-200 font-mono-num font-semibold">
                                  <input
                                    type="number"
                                    min="0"
                                    aria-label={`Q'ty Plan รุ่น ${m.modelName}`}
                                    value={m.qtyPlan}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleModelQtyChange(m.id, Number(e.target.value))
                                    }
                                    className="w-15 px-1 py-0.5 text-right font-bold bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                  />
                                </td>

                                {/* Editable UPH */}
                                <td className="py-1 px-1 text-right border border-slate-200 font-mono-num">
                                  <input
                                    type="number"
                                    min="0"
                                    aria-label={`UPH รุ่น ${m.modelName}`}
                                    value={m.uph}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleModelUphChange(m.id, Number(e.target.value))
                                    }
                                    title={`คำนวณละเอียด: ${m.qtyPlan} ÷ ${shiftConfig.workingHours} ชม. = ${f.exactUphFromQty.toFixed(2)} UPH`}
                                    className="w-11 px-1 py-0.5 text-right font-bold text-[#083B66] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                  />
                                </td>

                                {/* Delete Model Button */}
                                <td className="py-1 px-1 text-center border border-slate-200 no-print">
                                  <button
                                    type="button"
                                    disabled={models.length <= 1}
                                    aria-label={`ลบรุ่น ${m.modelName}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteModel(m.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr
                            className={`text-white font-bold font-mono-num ${
                              activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                            }`}
                          >
                            <td className="py-2 px-2 text-center border border-slate-400/30 font-sans">
                              รวม
                            </td>
                            {activeSheet !== 'line_b' && (
                              <td className="py-2 px-1.5 text-center border border-slate-400/30">
                                {sheetJigATotal}
                              </td>
                            )}
                            {activeSheet !== 'line_a' && (
                              <td className="py-2 px-1.5 text-center border border-slate-400/30">
                                {sheetJigBTotal}
                              </td>
                            )}
                            <td className="py-2 px-2 text-right border border-slate-400/30">
                              {currentSheetMetrics.qtyPlan.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-right border border-slate-400/30">
                              {currentSheetMetrics.targetUph}
                            </td>
                            <td className="py-2 px-1 border border-slate-400/30 no-print" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Inline Form to Add New Model directly in Summary / Line A / Line B Table */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = quickModelName.trim();
                        if (!name) return;
                        const targetLine: 'A' | 'B' =
                          activeSheet === 'line_a'
                            ? 'A'
                            : activeSheet === 'line_b'
                            ? 'B'
                            : quickLineTarget;
                        const jigVal = Math.max(0, Number(quickJigCount) || 0);
                        const qtyVal = Math.max(0, Number(quickQtyPlan) || 0);
                        const uphVal =
                          shiftConfig.workingHours > 0
                            ? Math.round(qtyVal / shiftConfig.workingHours)
                            : 0;
                        const palette = [
                          '#1D63D8',
                          '#16A34A',
                          '#F59E0B',
                          '#9333EA',
                          '#14B8A6',
                          '#EF4444',
                          '#0EA5E9',
                        ];

                        handleAddModel({
                          modelName: name,
                          lineAssignment: targetLine,
                          jigA: targetLine === 'A' ? jigVal : 0,
                          jigB: targetLine === 'B' ? jigVal : 0,
                          qtyPlan: qtyVal,
                          uph: uphVal,
                          utilizationPercent: jigVal > 0 && qtyVal > 0 ? 100 : 0,
                          cycleTimeSec: 34.0,
                          changeoverMin: 10,
                          processFocusNote: `รุ่นผลิตใน Line ${targetLine} (${jigVal} JIG = ${uphVal} UPH × ${shiftConfig.workingHours} ชม. = ${qtyVal} เครื่อง)`,
                          defectWatch: 'ตรวจสอบมาตรฐานการประกอบและคุณภาพ 100%',
                          color: palette[models.length % palette.length],
                          highlightZero: qtyVal === 0,
                        });
                        setQuickModelName('');
                      }}
                      className="mt-2.5 p-2.5 rounded-lg bg-sky-50/80 border border-sky-200 space-y-2 no-print"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#083B66]">
                        <span>
                          + เพิ่ม Model ใหม่ลงตาราง{' '}
                          {activeSheet === 'line_a'
                            ? '(Line A)'
                            : activeSheet === 'line_b'
                            ? '(Line B)'
                            : '(เลือก Line A หรือ B)'}
                        </span>
                        <span className="font-mono-num text-slate-500 font-normal">
                          1 JIG = {shiftConfig.standardUphPerJig} UPH
                        </span>
                      </div>

                      <div className="grid grid-cols-12 gap-1.5 items-end">
                        <div className={activeSheet === 'summary' ? 'col-span-4' : 'col-span-5'}>
                          <label
                            htmlFor="quick-add-model-name"
                            className="block text-[10px] font-semibold text-slate-600 mb-0.5"
                          >
                            ชื่อ Model
                          </label>
                          <input
                            id="quick-add-model-name"
                            type="text"
                            placeholder="เช่น TM25"
                            value={quickModelName}
                            onChange={(e) => setQuickModelName(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0B4F8A]"
                          />
                        </div>

                        {activeSheet === 'summary' && (
                          <div className="col-span-2">
                            <label
                              htmlFor="quick-add-line"
                              className="block text-[10px] font-semibold text-slate-600 mb-0.5"
                            >
                              Line
                            </label>
                            <select
                              id="quick-add-line"
                              value={quickLineTarget}
                              onChange={(e) => setQuickLineTarget(e.target.value as 'A' | 'B')}
                              className="w-full px-1 py-1 text-xs bg-white border border-slate-300 rounded font-bold text-[#083B66]"
                            >
                              <option value="A">A</option>
                              <option value="B">B</option>
                            </select>
                          </div>
                        )}

                        <div className="col-span-2">
                          <label
                            htmlFor="quick-add-jig"
                            className="block text-[10px] font-semibold text-slate-600 mb-0.5"
                          >
                            {activeSheet === 'line_b'
                              ? 'JIG B'
                              : activeSheet === 'line_a'
                              ? 'JIG A'
                              : `JIG ${quickLineTarget}`}
                          </label>
                          <input
                            id="quick-add-jig"
                            type="number"
                            min="0"
                            value={quickJigCount}
                            onChange={(e) => {
                              const j = Math.max(0, Number(e.target.value));
                              setQuickJigCount(j);
                              setQuickQtyPlan(
                                Math.round(
                                  j * shiftConfig.standardUphPerJig * shiftConfig.workingHours
                                )
                              );
                            }}
                            className="w-full px-1.5 py-1 text-xs text-center bg-white border border-slate-300 rounded font-mono-num font-bold"
                          />
                        </div>

                        <div className={activeSheet === 'summary' ? 'col-span-2' : 'col-span-3'}>
                          <label
                            htmlFor="quick-add-qty"
                            className="block text-[10px] font-semibold text-slate-600 mb-0.5"
                          >
                            Q&apos;ty Plan
                          </label>
                          <input
                            id="quick-add-qty"
                            type="number"
                            min="0"
                            value={quickQtyPlan}
                            onChange={(e) =>
                              setQuickQtyPlan(Math.max(0, Number(e.target.value)))
                            }
                            className="w-full px-1.5 py-1 text-xs text-right bg-white border border-slate-300 rounded font-mono-num font-bold"
                          />
                        </div>

                        <div className="col-span-2">
                          <button
                            type="submit"
                            aria-label="เพิ่มรุ่นผลิตใหม่"
                            className="w-full py-1 px-2 bg-[#0B4F8A] hover:bg-[#083B66] text-white text-xs font-bold rounded flex items-center justify-center gap-0.5 transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>เพิ่ม</span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Formula Footnote under Summary Table */}
                    <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
                      <div className="flex items-center justify-between font-mono-num">
                        <span>
                          รวม JIG ใน Sheet นี้: <strong>{currentSheetMetrics.totalJigs} ตัว</strong>{' '}
                          (เดินจริง {currentSheetMetrics.activeJigs} ตัว)
                        </span>
                        <span className="font-bold text-[#0B4F8A]">
                          Max: {currentSheetMetrics.totalJigs} × {shiftConfig.standardUphPerJig} ={' '}
                          {currentSheetMetrics.maxJigUph} UPH
                        </span>
                      </div>
                      <div className="text-slate-500">
                        คลิกแก้ไข <strong>ชื่อ Model, JIG A, JIG B, Q&apos;ty Plan, UPH</strong> หรือเพิ่ม/ลบรุ่นในตารางได้ทั้ง Line A และ Line B
                      </div>
                    </div>
                </div>
              </section>

              {/* COLUMN 2 (4 cols): เป้าหมายรวมของ Sheet นี้ & สัดส่วนยอดผลิตแต่ละรุ่น */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <section
                  className="bg-white rounded-xl border border-slate-300 p-4"
                  aria-label="เป้าหมายรวมและ UPH จริง"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
                      <Target className="w-4 h-4 text-[#0B4F8A]" />
                      <h2>
                        {activeSheet === 'line_a'
                          ? 'เป้าหมายรวม Line A'
                          : activeSheet === 'line_b'
                          ? 'เป้าหมายรวม Line B'
                          : 'เป้าหมายรวมทั้งวัน (Line A + B)'}
                      </h2>
                    </div>
                    <span className="text-[11px] font-mono-num font-semibold text-[#0B4F8A]">
                      JIG Load: {currentSheetMetrics.jigUtilizationPercent.toFixed(1)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-200 py-3 text-center">
                    <div className="px-2">
                      <div className="text-3xl sm:text-4xl font-bold text-[#083B66] font-mono-num tracking-tight">
                        {currentSheetMetrics.qtyPlan.toLocaleString()}
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-1">เครื่อง</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        (Q&apos;ty Plan · {currentSheetMetrics.sharePercent.toFixed(1)}% ของกะ)
                      </div>
                    </div>

                    <div className="px-2">
                      <div className="text-3xl sm:text-4xl font-bold text-[#083B66] font-mono-num tracking-tight">
                        {currentSheetMetrics.targetUph}
                      </div>
                      <div className="text-xs font-bold text-slate-800 mt-1">UPH จริง</div>
                      <div className="text-[11px] text-slate-500 font-mono-num">
                        ({currentSheetMetrics.qtyPlan.toLocaleString()} ÷{' '}
                        {shiftConfig.workingHours} ชม.)
                      </div>
                    </div>
                  </div>

                  {/* IE Formula Explanation Note */}
                  <div className="bg-sky-50/90 border border-sky-200 rounded-lg p-2.5 flex items-start gap-2.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-[#0B4F8A] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-slate-800 leading-relaxed">
                      <span className="font-bold text-[#083B66]">หมายเหตุสูตรคำนวณ : </span>
                      กำลังผลิตเต็มตาม JIG ({currentSheetMetrics.totalJigs} ตัว ×{' '}
                      {shiftConfig.standardUphPerJig}) ={' '}
                      <span className="font-mono-num font-bold">
                        {currentSheetMetrics.maxJigUph} UPH
                      </span>{' '}
                      (ผลรวม UPH รายรุ่น ={' '}
                      <span className="font-mono-num font-bold">{sumOfSheetTableUph} UPH</span>) แต่ยอดรวมแผนผลิตจริง ={' '}
                      <span className="font-mono-num font-bold">
                        {currentSheetMetrics.qtyPlan.toLocaleString()}
                      </span>{' '}
                      เครื่อง ÷{' '}
                      <span className="font-mono-num font-bold">
                        {shiftConfig.workingHours} ชม.
                      </span>{' '}
                      จึงได้เป้าหมาย{' '}
                      <span className="font-mono-num font-bold text-[#0B4F8A]">
                        {currentSheetMetrics.targetUph} UPH
                      </span>{' '}
                      (Takt Time ={' '}
                      <span className="font-mono-num font-bold">
                        {currentSheetMetrics.taktTimeSec.toFixed(1)}s
                      </span>
                      )
                    </div>
                  </div>
                </section>

                {/* Card 2B: สัดส่วนยอดผลิตแต่ละรุ่น (Donut Chart) */}
                <section
                  className="bg-white rounded-xl border border-slate-300 p-4 flex-1 flex flex-col justify-between"
                  aria-label="สัดส่วนยอดผลิตแต่ละรุ่น"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                    <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                      สัดส่วนยอดผลิตแต่ละรุ่น{' '}
                      {activeSheet === 'line_a'
                        ? '(Line A)'
                        : activeSheet === 'line_b'
                        ? '(Line B)'
                        : '(รวม A+B)'}
                    </h2>
                    {activeSheet === 'summary' && (
                      <button
                        type="button"
                        onClick={() =>
                          setShiftConfig((prev) => ({
                            ...prev,
                            groupTmModels: !prev.groupTmModels,
                          }))
                        }
                        className="text-[11px] font-semibold text-[#0B4F8A] hover:underline no-print whitespace-nowrap"
                      >
                        {shiftConfig.groupTmModels ? 'แยกรุ่น TM19/TM21' : 'รวมกลุ่ม TM19+TM21'}
                      </button>
                    )}
                  </div>

                  <ModelDonutChart
                    groups={groupedFocusList}
                    totalQty={currentSheetMetrics.qtyPlan}
                    selectedGroupKey={selectedGroupDetail?.key ?? null}
                    onSelectGroup={setSelectedGroupKey}
                  />
                </section>
              </div>

              {/* COLUMN 3 (4 cols): ประเด็นสำคัญที่ต้องติดตาม & KPI ที่ควรติดตาม */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <section
                  className="bg-white rounded-xl border border-slate-300 overflow-hidden"
                  aria-label="ประเด็นสำคัญที่ต้องติดตาม"
                >
                  <div
                    className={`text-white px-4 py-2.5 flex items-center gap-2 font-bold text-sm sm:text-base ${
                      activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                    }`}
                  >
                    <Bell className="w-4 h-4 text-sky-200" />
                    <h2>
                      ประเด็นสำคัญที่ต้องติดตาม{' '}
                      {activeSheet === 'line_a'
                        ? '(Line A)'
                        : activeSheet === 'line_b'
                        ? '(Line B)'
                        : ''}
                    </h2>
                  </div>

                  <div className="p-3.5 space-y-2.5">
                    {keyFocusPoints.top1 && (
                      <div
                        onClick={() => setSelectedGroupKey(keyFocusPoints.top1.key)}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#1D63D8] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 font-mono-num">
                          1
                        </div>
                        <div className="text-xs">
                          <div className="font-bold text-[#083B66] text-sm">
                            {keyFocusPoints.top1.label} —{' '}
                            <span className="font-mono-num">
                              {keyFocusPoints.top1.qtyPlan.toLocaleString()} เครื่อง (
                              {keyFocusPoints.top1.percent.toFixed(1)}%)
                            </span>
                          </div>
                          <p className="text-slate-700 mt-0.5">
                            เป็นรุ่นหลักของสายการผลิต ถ้ามีปัญหาจะกระทบแผนทันที (
                            {keyFocusPoints.top1.uph} UPH)
                          </p>
                        </div>
                      </div>
                    )}

                    {keyFocusPoints.top2 && (
                      <div
                        onClick={() => setSelectedGroupKey(keyFocusPoints.top2.key)}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border-t border-slate-100"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#16A34A] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 font-mono-num">
                          2
                        </div>
                        <div className="text-xs">
                          <div className="font-bold text-emerald-800 text-sm">
                            {keyFocusPoints.top2.label} —{' '}
                            <span className="font-mono-num">
                              {keyFocusPoints.top2.qtyPlan.toLocaleString()} เครื่อง (
                              {keyFocusPoints.top2.percent.toFixed(1)}%)
                            </span>
                          </div>
                          <p className="text-slate-700 mt-0.5">
                            อันดับ 2 ของสายการผลิต ({keyFocusPoints.top2.uph} UPH)
                            ควบคุมการป้อนชิ้นส่วนและสมดุลสถานี
                          </p>
                        </div>
                      </div>
                    )}

                    {keyFocusPoints.smallest &&
                      keyFocusPoints.smallest.key !== keyFocusPoints.top2?.key && (
                        <div
                          onClick={() => setSelectedGroupKey(keyFocusPoints.smallest.key)}
                          className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border-t border-slate-100"
                        >
                          <div className="w-7 h-7 rounded-full bg-[#F59E0B] text-white font-bold text-sm flex items-center justify-center flex-shrink-0 font-mono-num">
                            3
                          </div>
                          <div className="text-xs">
                            <div className="font-bold text-amber-700 text-sm">
                              {keyFocusPoints.smallest.label} —{' '}
                              <span className="font-mono-num">
                                {keyFocusPoints.smallest.qtyPlan.toLocaleString()} เครื่อง (
                                {keyFocusPoints.smallest.percent.toFixed(1)}%)
                              </span>
                            </div>
                            <p className="text-slate-700 mt-0.5">
                              ควรจัดผลิตช่วงต้นกะหรือช่วงเปลี่ยน Model เพื่อลด Changeover Loss
                            </p>
                          </div>
                        </div>
                      )}
                  </div>
                </section>

                {/* Card 3B: KPI ที่ควรติดตาม (Production Meeting) */}
                <section
                  className="bg-white rounded-xl border border-slate-300 overflow-hidden flex-1 flex flex-col"
                  aria-label="KPI ที่ควรติดตามในการประชุมการผลิต"
                >
                  <div
                    className={`text-white px-4 py-2.5 flex items-center justify-between ${
                      activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                      <Lightbulb className="w-4 h-4 text-amber-300" />
                      <h2>KPI ที่ควรติดตาม (Production Meeting)</h2>
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr
                          className={`text-white font-semibold ${
                            activeSheet === 'line_b' ? 'bg-indigo-900' : 'bg-[#0F528C]'
                          }`}
                        >
                          <th className="py-1.5 px-2.5 text-left border border-slate-300">KPI</th>
                          <th className="py-1.5 px-2.5 text-left border border-slate-300">
                            Target
                          </th>
                          <th className="py-1.5 px-2 text-right border border-slate-300">
                            สถานะปัจจุบัน
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            Hourly Output
                          </td>
                          <td className="py-1.5 px-2.5 font-mono-num font-bold text-slate-900 border border-slate-200">
                            ≥ {currentSheetMetrics.targetUph} Unit/hr
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            {currentSheetMetrics.latestHourLabel ? (
                              <span
                                className={
                                  (currentSheetMetrics.achvPercentAtLatest ?? 100) >= 100
                                    ? 'text-emerald-700 font-bold'
                                    : 'text-red-600 font-bold'
                                }
                              >
                                อัปเดตถึง {currentSheetMetrics.latestHourLabel}
                              </span>
                            ) : (
                              <span className="text-slate-500">รอผล H1</span>
                            )}
                          </td>
                        </tr>
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            Cum. Achievement
                          </td>
                          <td className="py-1.5 px-2.5 font-mono-num font-bold text-slate-900 border border-slate-200">
                            ≥ 100%
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            {currentSheetMetrics.achvPercentAtLatest != null ? (
                              <span
                                className={
                                  currentSheetMetrics.achvPercentAtLatest >= 100
                                    ? 'text-emerald-700 font-bold'
                                    : currentSheetMetrics.achvPercentAtLatest >= 95
                                    ? 'text-amber-700 font-bold'
                                    : 'text-red-600 font-bold'
                                }
                              >
                                {currentSheetMetrics.achvPercentAtLatest.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-slate-500">100.0%</span>
                            )}
                          </td>
                        </tr>
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            Line Stop &gt;5 min
                          </td>
                          <td className="py-1.5 px-2.5 font-mono-num font-bold text-slate-900 border border-slate-200">
                            &lt; 5%
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            <span
                              className={
                                kpiState.lineStopPercent < 5
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-red-600 font-bold'
                              }
                            >
                              {kpiState.lineStopPercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            Manpower Attendance
                          </td>
                          <td className="py-1.5 px-2.5 font-mono-num font-bold text-slate-900 border border-slate-200">
                            100%
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            <span
                              className={
                                kpiState.manpowerAttendancePercent >= 100
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-amber-700 font-bold'
                              }
                            >
                              {kpiState.manpowerAttendancePercent}%
                            </span>
                          </td>
                        </tr>
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            Bottleneck CT
                          </td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-900 border border-slate-200">
                            ≤ Takt Time ({currentSheetMetrics.taktTimeSec.toFixed(1)}s)
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            <span
                              className={
                                kpiState.bottleneckCtSec <= currentSheetMetrics.taktTimeSec
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-red-600 font-bold'
                              }
                            >
                              {kpiState.bottleneckCtSec.toFixed(1)}s
                            </span>
                          </td>
                        </tr>
                        <tr className="even:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-medium text-slate-800 border border-slate-200">
                            WIP Before Bottleneck
                          </td>
                          <td className="py-1.5 px-2.5 font-bold text-slate-900 border border-slate-200">
                            1 Hour Buffer ({currentSheetMetrics.targetUph} เครื่อง)
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono-num border border-slate-200">
                            <span className="text-emerald-700 font-bold">พร้อม 1 ชม.</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>

            {/* LOWER 2-COLUMN BOARD: Hourly Tracking Plan + Process Focus Bars */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* LEFT 8 COLS: แผนติดตามยอดรายชั่วโมง (Hourly Tracking Plan) & Action Plan */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <section
                  className="bg-white rounded-xl border border-slate-300 overflow-hidden flex-1"
                  aria-label="แผนติดตามยอดรายชั่วโมง"
                >
                  <div className="bg-[#0B7A58] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                      <BarChart3 className="w-4 h-4 text-emerald-200" />
                      <h2>
                        แผนติดตามยอดรายชั่วโมง ({currentSheetMetrics.lineName} —{' '}
                        {shiftConfig.workingHours} ชม.)
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-emerald-100 font-mono-num">
                        เป้าชั่วโมงเต็ม = {currentSheetMetrics.targetUph} เครื่อง/ชม. · ยอดสะสมรวม ={' '}
                        {currentSheetMetrics.qtyPlan.toLocaleString()} เครื่อง
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-400/40 text-[11px] font-mono-num text-emerald-100 no-print">
                        <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                        <span>Auto-Save ({lastSavedTime})</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Hour Label & Shift Clock Time Toolbar */}
                  <div className="px-3.5 py-2.5 bg-emerald-50/70 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emerald-950 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#0B7A58]" />
                        <span>แก้ไขเวลา Hour:</span>
                      </span>
                      <label htmlFor="shift-start-time" className="text-slate-700 font-medium">
                        เริ่มกะ
                      </label>
                      <input
                        id="shift-start-time"
                        type="time"
                        value={shiftConfig.shiftStartTime || '20:00'}
                        onChange={(e) =>
                          setShiftConfig((prev) => ({
                            ...prev,
                            shiftStartTime: e.target.value,
                          }))
                        }
                        className="px-2 py-1 text-xs font-mono-num font-bold bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0B7A58]"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyClockFormat('h_and_clock')}
                        className="px-2.5 py-1 rounded bg-[#0B7A58] hover:bg-[#096347] text-white font-semibold transition-colors whitespace-nowrap"
                      >
                        ตั้งเป็น H1 + เวลาจริง (เช่น H1 20:00-21:00)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyClockFormat('clock_only')}
                        className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold transition-colors whitespace-nowrap"
                      >
                        เฉพาะช่วงเวลา (20:00-21:00)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyClockFormat('h_only')}
                        className="px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 font-medium transition-colors whitespace-nowrap"
                      >
                        รีเซ็ต H1..H{shiftConfig.workingHours}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-600">ปรับชม.ทำงาน:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateWorkingHours(shiftConfig.workingHours - 0.5)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono-num font-bold text-slate-800"
                        title="ลดชั่วโมงทำงานลง 0.5 ชม."
                      >
                        -0.5
                      </button>
                      <span className="font-mono-num font-bold text-[#083B66] px-1">
                        {shiftConfig.workingHours} ชม.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateWorkingHours(shiftConfig.workingHours + 0.5)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono-num font-bold text-slate-800"
                        title="เพิ่มชั่วโมงทำงาน 0.5 ชม."
                      >
                        +0.5
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 grid grid-cols-1 xl:grid-cols-12 gap-4">
                    {/* Left Sub-table (4 cols): เป้าหมายรายชั่วโมง */}
                    <div className="xl:col-span-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs sm:text-sm font-bold text-[#083B66]">
                          เป้าหมายรายชั่วโมง ({currentSheetMetrics.lineName})
                        </h3>
                        <span className="text-[10px] text-slate-500 no-print">
                          คลิกแก้ไขช่อง Hour ได้ทันที
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#138A63] text-white font-semibold">
                              <th className="py-1.5 px-2 text-center border border-slate-300">
                                Hour (คลิกแก้เวลาได้)
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Plan/Hr
                              </th>
                              <th className="py-1.5 px-2.5 text-right border border-slate-300">
                                Cum.Plan
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentSheetHourlyRows.map((row, idx) => (
                              <tr
                                key={`target-${row.id}`}
                                className="even:bg-emerald-50/40 hover:bg-emerald-50"
                              >
                                <td className="py-1 px-1.5 text-center font-mono-num font-semibold text-slate-800 border border-slate-200">
                                  <input
                                    type="text"
                                    aria-label={`แก้ไขเวลา Hour แถวที่ ${idx + 1} (ตารางเป้าหมาย)`}
                                    value={row.label}
                                    onChange={(e) => handleUpdateHourLabel(idx, e.target.value)}
                                    className="w-full min-w-[78px] px-1 py-0.5 text-center font-mono-num font-bold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B7A58] rounded focus:outline-none"
                                  />
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono-num text-slate-800 border border-slate-200">
                                  {row.plan.toLocaleString()}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono-num font-bold text-slate-900 border border-slate-200">
                                  {row.cumPlan.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Right Main Tracking Table (8 cols): ตารางติดตามการผลิตรายชั่วโมง */}
                    <div className="xl:col-span-8">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h3 className="text-xs sm:text-sm font-bold text-[#083B66]">
                          ตารางติดตามการผลิตรายชั่วโมง ({currentSheetMetrics.lineName})
                        </h3>
                        <span className="text-[11px] text-slate-500 no-print">
                          แก้ไขช่อง <strong>Hour, Actual, หมายเหตุ</strong> แล้วระบบบันทึกอัตโนมัติทันที
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr
                              className={`text-white font-semibold ${
                                activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                              }`}
                            >
                              <th className="py-1.5 px-2 text-center border border-slate-300">
                                Hour (แก้ไขได้)
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Plan
                              </th>
                              <th className="py-1.5 px-2 text-center border border-slate-300">
                                Actual
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Diff
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Cum Plan
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Cum Actual
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                Gap
                              </th>
                              <th className="py-1.5 px-2 text-right border border-slate-300">
                                % Achv.
                              </th>
                              <th className="py-1.5 px-2 text-left border border-slate-300 no-print">
                                หมายเหตุ / ปัญหาหน้างาน
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentSheetHourlyRows.map((row, idx) => {
                              const isAlertRow =
                                row.rowSeverity === 'level1_5pct' ||
                                row.rowSeverity === 'level2_10pct' ||
                                row.rowSeverity === 'level3_15pct' ||
                                row.rowSeverity === 'level4_20pct';

                              return (
                                <tr
                                  key={row.id}
                                  className={`${
                                    isAlertRow
                                      ? 'bg-red-50/70 hover:bg-red-50'
                                      : 'even:bg-slate-50/70 hover:bg-sky-50/50'
                                  } transition-colors`}
                                >
                                  <td className="py-1 px-1.5 text-center font-mono-num font-semibold text-slate-800 border border-slate-200">
                                    <input
                                      type="text"
                                      aria-label={`แก้ไขเวลา Hour แถวที่ ${idx + 1}`}
                                      value={row.label}
                                      onChange={(e) => handleUpdateHourLabel(idx, e.target.value)}
                                      className="w-full min-w-[82px] px-1 py-0.5 text-center font-mono-num font-bold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num text-slate-800 border border-slate-200">
                                    {row.plan.toLocaleString()}
                                  </td>
                                  <td className="py-1 px-1.5 text-center border border-slate-200">
                                    <input
                                      type="number"
                                      min="0"
                                      aria-label={`ยอดผลิตจริงชั่วโมงที่ ${row.label}`}
                                      placeholder="-"
                                      value={row.actual === null ? '' : row.actual}
                                      onChange={(e) =>
                                        handleHourlyActualChange(idx, e.target.value)
                                      }
                                      className="w-16 px-1.5 py-0.5 text-right font-mono-num font-bold bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num font-semibold border border-slate-200">
                                    {row.diff === null ? (
                                      <span className="text-slate-400">-</span>
                                    ) : (
                                      <span
                                        className={
                                          row.diff < 0
                                            ? 'text-red-600'
                                            : row.diff > 0
                                            ? 'text-emerald-700'
                                            : 'text-slate-700'
                                        }
                                      >
                                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num text-slate-800 border border-slate-200">
                                    {row.cumPlan.toLocaleString()}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num font-bold text-slate-900 border border-slate-200">
                                    {row.cumActual === null ? (
                                      <span className="text-slate-400 font-normal">-</span>
                                    ) : (
                                      row.cumActual.toLocaleString()
                                    )}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num font-bold border border-slate-200">
                                    {row.gap === null ? (
                                      <span className="text-slate-400 font-normal">-</span>
                                    ) : (
                                      <span
                                        className={
                                          row.gap < 0
                                            ? 'text-red-600'
                                            : row.gap > 0
                                            ? 'text-emerald-700'
                                            : 'text-slate-700'
                                        }
                                      >
                                        {row.gap > 0 ? `+${row.gap}` : row.gap}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono-num font-bold border border-slate-200">
                                    {row.achvPercent === null ? (
                                      <span className="text-slate-400 font-normal">-</span>
                                    ) : (
                                      <span
                                        className={
                                          row.achvPercent < 95
                                            ? 'text-red-600'
                                            : row.achvPercent < 100
                                            ? 'text-amber-700'
                                            : 'text-emerald-700'
                                        }
                                      >
                                        {row.achvPercent.toFixed(1)}%
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1 px-2 border border-slate-200 no-print">
                                    <input
                                      type="text"
                                      aria-label={`หมายเหตุชั่วโมงที่ ${row.label}`}
                                      placeholder="บันทึกสาเหตุ..."
                                      value={row.note}
                                      onChange={(e) =>
                                        handleHourlyNoteChange(idx, e.target.value)
                                      }
                                      className="w-full min-w-[110px] px-1.5 py-0.5 text-[11px] bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#0B4F8A] focus:bg-white focus:outline-none text-slate-700"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr
                              className={`text-white font-bold font-mono-num ${
                                activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                              }`}
                            >
                              <td className="py-1.5 px-2 text-center border border-slate-400/30 font-sans">
                                รวม
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.qtyPlan.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-2 text-center border border-slate-400/30">
                                {currentSheetMetrics.cumActualAtLatest !== null
                                  ? currentSheetMetrics.cumActualAtLatest.toLocaleString()
                                  : '-'}
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.gapAtLatest !== null
                                  ? currentSheetMetrics.gapAtLatest > 0
                                    ? `+${currentSheetMetrics.gapAtLatest}`
                                    : currentSheetMetrics.gapAtLatest
                                  : '-'}
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.qtyPlan.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.cumActualAtLatest !== null
                                  ? currentSheetMetrics.cumActualAtLatest.toLocaleString()
                                  : '-'}
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.gapAtLatest !== null
                                  ? currentSheetMetrics.gapAtLatest > 0
                                    ? `+${currentSheetMetrics.gapAtLatest}`
                                    : currentSheetMetrics.gapAtLatest
                                  : '-'}
                              </td>
                              <td className="py-1.5 px-2 text-right border border-slate-400/30">
                                {currentSheetMetrics.achvPercentAtLatest != null
                                  ? `${currentSheetMetrics.achvPercentAtLatest.toFixed(1)}%`
                                  : '-'}
                              </td>
                              <td className="py-1.5 px-2 border border-slate-400/30 no-print" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Bottom Left: Action Plan (กรณียอดต่ำกว่าแผน) 4-Step Escalation Pipeline */}
                <section
                  className="bg-white rounded-xl border border-slate-300 overflow-hidden"
                  aria-label="Action Plan กรณียอดต่ำกว่าแผน"
                >
                  <div
                    className={`text-white px-4 py-2 flex items-center justify-between ${
                      activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                      <Settings className="w-4 h-4 text-sky-200" />
                      <h2>Action Plan (กรณียอดต่ำกว่าแผน)</h2>
                    </div>
                    <span className="text-xs text-sky-100">
                      ระบบไฮไลท์ขั้นตอนปฏิบัติการอัตโนมัติตาม % ยอดผลิตสะสมจริงของ{' '}
                      {currentSheetMetrics.lineName}
                    </span>
                  </div>

                  <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div
                      className={`rounded-lg border p-3 transition-all ${
                        currentSheetMetrics.severity === 'level1_5pct'
                          ? 'ring-2 ring-emerald-600 border-emerald-600 bg-emerald-50/90 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="bg-[#168A59] text-white px-2.5 py-1.5 rounded font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-white text-[#168A59] flex items-center justify-center font-mono-num text-[11px]">
                          1
                        </span>
                        <span>ต่ำกว่าแผน 5%</span>
                      </div>
                      <ul className="mt-2.5 text-xs text-slate-800 space-y-1 font-medium">
                        <li>• Leader แก้ไขหน้างาน</li>
                        <li className="text-[11px] text-slate-600 font-normal">
                          เช็คความพร้อมชิ้นส่วนย่อยและกระตุ้นจังหวะ Takt Time
                        </li>
                      </ul>
                    </div>

                    <div
                      className={`rounded-lg border p-3 transition-all ${
                        currentSheetMetrics.severity === 'level2_10pct'
                          ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/90 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="bg-[#F5B014] text-slate-950 px-2.5 py-1.5 rounded font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-white text-slate-900 flex items-center justify-center font-mono-num text-[11px]">
                          2
                        </span>
                        <span>ต่ำกว่าแผน 10%</span>
                      </div>
                      <ul className="mt-2.5 text-xs text-slate-800 space-y-1 font-medium">
                        <li>• Supervisor ลงตรวจ Line Balance</li>
                        <li className="text-[11px] text-slate-600 font-normal">
                          ตรวจสอบ WIP หน้าคอขวดและเกลี่ยงานระหว่างสถานี
                        </li>
                      </ul>
                    </div>

                    <div
                      className={`rounded-lg border p-3 transition-all ${
                        currentSheetMetrics.severity === 'level3_15pct'
                          ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50/90 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="bg-[#F27B13] text-white px-2.5 py-1.5 rounded font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-white text-[#F27B13] flex items-center justify-center font-mono-num text-[11px]">
                          3
                        </span>
                        <span>ต่ำกว่าแผน 15%</span>
                      </div>
                      <ul className="mt-2.5 text-xs text-slate-800 space-y-1 font-medium">
                        <li>• IE วิเคราะห์ Bottleneck + จัดกำลังคนใหม่</li>
                        <li className="text-[11px] text-slate-600 font-normal">
                          จับเวลา Cycle Time จุดคอขวดและเสริม Relief Operator
                        </li>
                      </ul>
                    </div>

                    <div
                      className={`rounded-lg border p-3 transition-all ${
                        currentSheetMetrics.severity === 'level4_20pct'
                          ? 'ring-2 ring-red-600 border-red-600 bg-red-50/90 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="bg-[#E02424] text-white px-2.5 py-1.5 rounded font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-white text-[#E02424] flex items-center justify-center font-mono-num text-[11px]">
                          4
                        </span>
                        <span>ต่ำกว่าแผน 20%</span>
                      </div>
                      <ul className="mt-2.5 text-xs text-slate-800 space-y-1 font-medium">
                        <li>• แจ้ง ET / Production Manager ทันที</li>
                        <li className="text-[11px] text-slate-600 font-normal">
                          แก้ไขเครื่องจักร/JIG ฉุกเฉิน และวางแผน Recovery กะ
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT 4 COLS: โฟกัสกระบวนการ (จากยอดผลิต) & Selected Model Focus Inspector & Quote */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <section
                  className="bg-white rounded-xl border border-slate-300 overflow-hidden flex-1 flex flex-col"
                  aria-label="โฟกัสกระบวนการจากยอดผลิต"
                >
                  <div
                    className={`text-white px-4 py-2.5 flex items-center gap-2 font-bold text-sm sm:text-base ${
                      activeSheet === 'line_b' ? 'bg-indigo-800' : 'bg-[#0B4F8A]'
                    }`}
                  >
                    <Target className="w-4 h-4 text-sky-200" />
                    <h2>
                      โฟกัสกระบวนการ{' '}
                      {activeSheet === 'line_a'
                        ? '(Line A)'
                        : activeSheet === 'line_b'
                        ? '(Line B)'
                        : '(รวม A+B)'}
                    </h2>
                  </div>

                  <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      {groupedFocusList.map((group) => {
                        const isSelected = selectedGroupDetail?.key === group.key;
                        const barWidth = Math.min(
                          100,
                          Math.max(group.qtyPlan > 0 ? 4 : 0, group.percent * 1.8)
                        );
                        return (
                          <button
                            key={`focus-bar-${group.key}`}
                            type="button"
                            onClick={() => setSelectedGroupKey(group.key)}
                            className={`w-full text-left p-2 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-sky-50/90 border-[#0B4F8A] ring-1 ring-[#0B4F8A]'
                                : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/80'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span
                                className="flex items-center gap-1.5"
                                style={{ color: group.qtyPlan > 0 ? group.color : '#475569' }}
                              >
                                <span
                                  className="w-1.5 h-4 rounded-full inline-block"
                                  style={{ backgroundColor: group.color }}
                                />
                                <span>{group.label}</span>
                              </span>
                              <span className="font-mono-num text-slate-900">
                                {group.qtyPlan.toLocaleString()} เครื่อง (
                                {group.percent.toFixed(1).replace(/\.0$/, '')}%)
                              </span>
                            </div>

                            <div className="mt-1.5 h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-200"
                                style={{
                                  width: `${barWidth}%`,
                                  backgroundColor: group.color,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected Model IE Operational & Quality Focus Box */}
                    {selectedGroupDetail && (
                      <div className="mt-3 p-3 rounded-lg bg-slate-900 text-white text-xs space-y-1.5">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                          <div className="font-bold text-sky-300 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5" />
                            <span>จุดโฟกัส IE ประจำรุ่น: {selectedGroupDetail.label}</span>
                          </div>
                          <span className="font-mono-num text-[11px] text-slate-300">
                            JIG A: {selectedGroupDetail.jigA} · JIG B: {selectedGroupDetail.jigB} ·{' '}
                            {selectedGroupDetail.uph} UPH
                          </span>
                        </div>
                        <p className="text-slate-200 leading-relaxed">
                          <span className="font-semibold text-amber-300">การควบคุมไลน์: </span>
                          {selectedGroupDetail.focusSummary}
                        </p>
                        <p className="text-slate-300 leading-relaxed">
                          <span className="font-semibold text-emerald-300">
                            จุดเฝ้าระวังคุณภาพ:{' '}
                          </span>
                          {selectedGroupDetail.defectWatch}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Bottom Right Motivational IE Card */}
                <section
                  className="bg-gradient-to-br from-sky-50 via-white to-sky-100/70 rounded-xl border border-sky-200 p-4 flex items-center gap-3.5"
                  aria-label="เป้าหมายคุณภาพและประสิทธิภาพการผลิต"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#0B4F8A] text-white flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs sm:text-sm font-bold text-[#083B66] leading-snug">
                      “ติดตามทุกชั่วโมง ผลิตให้ถึงเป้าหมาย
                      <br />
                      เพื่อคุณภาพและประสิทธิภาพที่ดียิ่งขึ้น”
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
