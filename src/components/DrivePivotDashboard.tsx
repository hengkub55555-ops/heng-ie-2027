import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  CloudUpload,
  RefreshCw,
  FolderOpen,
  Trash2,
  Download,
  Filter,
  Table,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ExternalLink,
  LogOut,
  Database,
  Layers,
  Calendar,
  Clock,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ModelPlanItem,
  HourlyRecord,
  ShiftPlanConfig,
  ProductionKpiState,
  ActionLogEntry,
} from '../types/production';
import {
  DEFAULT_MODELS,
  DEFAULT_SHIFT_CONFIG,
  DEFAULT_KPI_STATE,
  generateHourlySchedule,
  isModelInLine,
  getModelLineQty,
  getModelLineUph,
} from '../data/defaultPlan';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  listAppDriveFiles,
  readDriveJsonFile,
  createDriveFile,
  updateDriveFileContent,
  deleteDriveFile,
  HistoricalShiftSnapshot,
  DriveFileMeta,
} from '../services/googleDriveService';

interface DrivePivotDashboardProps {
  currentShiftConfig: ShiftPlanConfig;
  currentModels: ModelPlanItem[];
  currentHourlyA: HourlyRecord[];
  currentHourlyB: HourlyRecord[];
  currentKpiState: ProductionKpiState;
  currentActionLogs: ActionLogEntry[];
  onLoadSnapshotToBoard: (snapshot: HistoricalShiftSnapshot) => void;
}

type PivotDatasetMode = 'model_facts' | 'hourly_facts';
type PivotRowField = 'modelName' | 'line' | 'dateDisplay' | 'dateAndShift' | 'hourLabel';
type PivotColField = 'none_multi_metric' | 'line' | 'dateDisplay' | 'shiftType';
type PivotValueMetric = 'actual' | 'plan' | 'gap' | 'achvPercent' | 'jigs' | 'uph';

interface ModelFactRow {
  snapshotId: string;
  dateDisplay: string;
  shiftType: 'night' | 'day';
  shiftLabel: string;
  workingHours: number;
  line: 'Line A' | 'Line B';
  modelName: string;
  groupKey: string;
  jigs: number;
  planQty: number;
  actualQty: number;
  gapQty: number;
  uphPlan: number;
  uphActual: number;
  achvPercent: number;
}

interface HourlyFactRow {
  snapshotId: string;
  dateDisplay: string;
  shiftType: 'night' | 'day';
  shiftLabel: string;
  line: 'Line A' | 'Line B';
  hourSlotIndex: number;
  hourLabel: string;
  planQty: number;
  actualQty: number;
  gapQty: number;
  achvPercent: number;
  note: string;
}

const HISTORY_LOCAL_KEY = 'IE_PRODUCTION_PIVOT_HISTORY_V1';
const MASTER_DRIVE_FILENAME = 'IE_Production_History_Database.json';

function buildSeededHistoricalSnapshots(): HistoricalShiftSnapshot[] {
  // Seed 3 historical shifts (4 Oct Night, 5 Oct Day, 5 Oct Night) so Pivot analysis works immediately out of the box
  const buildActuals = (planTotal: number, hours: number, factor: number, noteText: string) => {
    const base = generateHourlySchedule(planTotal, hours);
    return base.map((r, idx) => ({
      ...r,
      actual: Math.max(0, Math.round(r.plan * (factor + (idx % 3 === 0 ? 0.02 : -0.01)))),
      note: idx === 2 ? noteText : 'เดินเครื่องปกติ',
    }));
  };

  const modelsOct4Night: ModelPlanItem[] = DEFAULT_MODELS.map((m) => ({
    ...m,
    qtyPlan: m.qtyPlan > 0 ? Math.round(m.qtyPlan * 0.96) : 0,
  }));

  const modelsOct5Day: ModelPlanItem[] = DEFAULT_MODELS.map((m) => ({
    ...m,
    qtyPlan: m.qtyPlan > 0 ? Math.round(m.qtyPlan * 1.02) : 0,
  }));

  return [
    {
      id: 'hist-2026-10-04-night',
      savedAtIso: '2026-10-04T20:00:00.000Z',
      savedAtDisplay: '4 ต.ค. 2569 · 06:35 น.',
      shiftConfig: {
        ...DEFAULT_SHIFT_CONFIG,
        planTitle: 'แผนการผลิตกะกลางคืน',
        shiftType: 'night',
        dateDisplay: '4 ต.ค. 2569',
        workingHours: 10.5,
      },
      models: modelsOct4Night,
      hourlyRecordsA: buildActuals(551, 10.5, 0.94, 'เปลี่ยนรุ่น T520 -> BM23 ล่าช้า 7 นาที'),
      hourlyRecordsB: buildActuals(486, 10.5, 0.96, 'ปรับตั้ง JIG B รุ่น SBS550'),
      kpiState: { ...DEFAULT_KPI_STATE, lineStopPercent: 4.1 },
      actionLogs: [],
      summaryNote: 'กะกลางคืน 4 ต.ค. มียอดผลิต 95.1% ของแผน',
    },
    {
      id: 'hist-2026-10-05-day',
      savedAtIso: '2026-10-05T08:00:00.000Z',
      savedAtDisplay: '5 ต.ค. 2569 · 18:35 น.',
      shiftConfig: {
        ...DEFAULT_SHIFT_CONFIG,
        planTitle: 'แผนการผลิตกะกลางวัน',
        shiftType: 'day',
        dateDisplay: '5 ต.ค. 2569',
        workingHours: 10.5,
      },
      models: modelsOct5Day,
      hourlyRecordsA: buildActuals(585, 10.5, 1.01, 'เดินเครื่องเต็มประสิทธิภาพ 100%'),
      hourlyRecordsB: buildActuals(516, 10.5, 0.99, 'เดินเครื่องตามแผน'),
      kpiState: { ...DEFAULT_KPI_STATE, lineStopPercent: 2.4 },
      actionLogs: [],
      summaryNote: 'กะกลางวัน 5 ต.ค. ทำยอดทะลุเป้าหมาย 100.2%',
    },
    {
      id: 'hist-2026-10-05-night',
      savedAtIso: '2026-10-05T20:00:00.000Z',
      savedAtDisplay: '5 ต.ค. 2569 · 06:32 น.',
      shiftConfig: {
        ...DEFAULT_SHIFT_CONFIG,
        planTitle: 'แผนการผลิตกะกลางคืน',
        shiftType: 'night',
        dateDisplay: '5 ต.ค. 2569',
        workingHours: 10.5,
      },
      models: DEFAULT_MODELS,
      hourlyRecordsA: buildActuals(574, 10.5, 0.91, 'สถานีอัดโฟม TM19 หยุดตรวจเช็ค 12 นาที'),
      hourlyRecordsB: buildActuals(506, 10.5, 0.97, 'คอยล์เย็น TM21 เข้าปกติ'),
      kpiState: { ...DEFAULT_KPI_STATE, lineStopPercent: 4.8 },
      actionLogs: [],
      summaryNote: 'กะกลางคืน 5 ต.ค. Line A ต่ำกว่าเป้าเล็กน้อยช่วง H3-H4',
    },
  ];
}

export const DrivePivotDashboard: React.FC<DrivePivotDashboardProps> = ({
  currentShiftConfig,
  currentModels,
  currentHourlyA,
  currentHourlyB,
  currentKpiState,
  currentActionLogs,
  onLoadSnapshotToBoard,
}) => {
  // Google Auth State
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Google Drive Files State
  const [driveFiles, setDriveFiles] = useState<DriveFileMeta[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Mandatory Confirmation Dialog State for Mutating/Destructive Google Drive Operations
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Historical Snapshots State (persisted locally + synced with Google Drive)
  const [historySnapshots, setHistorySnapshots] = useState<HistoricalShiftSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_LOCAL_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return buildSeededHistoricalSnapshots();
  });

  const [includeCurrentLiveShift, setIncludeCurrentLiveShift] = useState<boolean>(true);

  // Pivot Table Controls State
  const [datasetMode, setDatasetMode] = useState<PivotDatasetMode>('model_facts');
  const [rowField, setRowField] = useState<PivotRowField>('modelName');
  const [colField, setColField] = useState<PivotColField>('line');
  const [valueMetric, setValueMetric] = useState<PivotValueMetric>('actual');

  // Slicer Filters
  const [filterDate, setFilterDate] = useState<string>('ALL');
  const [filterShift, setFilterShift] = useState<'ALL' | 'night' | 'day'>('ALL');
  const [filterLine, setFilterLine] = useState<'ALL' | 'Line A' | 'Line B'>('ALL');
  const [filterModelQuery, setFilterModelQuery] = useState<string>('');

  // Auto-save historySnapshots to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_LOCAL_KEY, JSON.stringify(historySnapshots));
    } catch {
      // ignore quota errors
    }
  }, [historySnapshots]);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
        refreshDriveFileList();
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const refreshDriveFileList = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingDrive(true);
    try {
      const files = await listAppDriveFiles();
      setDriveFiles(files);
    } catch (err: any) {
      if (err?.message === 'NO_ACCESS_TOKEN') {
        setNeedsAuth(true);
      } else {
        setDriveStatusMsg({
          type: 'error',
          text: err?.message || 'ไม่สามารถดึงรายการไฟล์จาก Google Drive ได้',
        });
      }
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setDriveStatusMsg(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        setDriveStatusMsg({
          type: 'success',
          text: `เชื่อมต่อบัญชี Google Drive (${result.user.email || result.user.displayName}) สำเร็จ!`,
        });
        await refreshDriveFileList();
      }
    } catch (err: any) {
      setDriveStatusMsg({
        type: 'error',
        text: err?.message || 'การเข้าสู่ระบบ Google Drive ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setDriveFiles([]);
    setDriveStatusMsg({
      type: 'info',
      text: 'ออกจากระบบ Google Drive แล้ว (ข้อมูลในหน้าเว็บยังคงใช้งานได้ปกติ)',
    });
  };

  // Build live snapshot object from current active board
  const currentLiveSnapshot = useMemo<HistoricalShiftSnapshot>(() => {
    const sumA = currentModels.reduce((s, m) => s + getModelLineQty(m, 'A'), 0);
    const sumB = currentModels.reduce((s, m) => s + getModelLineQty(m, 'B'), 0);
    const schedA = generateHourlySchedule(
      sumA,
      currentShiftConfig.workingHours,
      currentHourlyA,
      currentShiftConfig.customHourLabels
    );
    const schedB = generateHourlySchedule(
      sumB,
      currentShiftConfig.workingHours,
      currentHourlyB,
      currentShiftConfig.customHourLabels
    );

    return {
      id: `live-current-shift`,
      savedAtIso: new Date().toISOString(),
      savedAtDisplay: `${currentShiftConfig.dateDisplay} (กะปัจจุบันบนบอร์ด)`,
      shiftConfig: currentShiftConfig,
      models: currentModels,
      hourlyRecordsA: schedA,
      hourlyRecordsB: schedB,
      kpiState: currentKpiState,
      actionLogs: currentActionLogs,
      summaryNote: 'ข้อมูลสดจากบอร์ดที่กำลังเปิดทำงานอยู่',
    };
  }, [
    currentShiftConfig,
    currentModels,
    currentHourlyA,
    currentHourlyB,
    currentKpiState,
    currentActionLogs,
  ]);

  // Save current shift into local history list
  const handleSaveCurrentShiftToLocalHistory = () => {
    const newId = `snap-${currentShiftConfig.dateDisplay.replace(/\s+/g, '')}-${currentShiftConfig.shiftType}-${Date.now()}`;
    const newSnap: HistoricalShiftSnapshot = {
      ...currentLiveSnapshot,
      id: newId,
      savedAtIso: new Date().toISOString(),
      savedAtDisplay: `${currentShiftConfig.dateDisplay} (${
        currentShiftConfig.shiftType === 'night' ? 'กะดึก' : 'กะเช้า'
      } · บันทึกเมื่อ ${new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      })})`,
      summaryNote: `บันทึกจากบอร์ด (${currentModels.length} รุ่น · ${currentShiftConfig.workingHours} ชม.)`,
    };

    setHistorySnapshots((prev) => [newSnap, ...prev]);
    setDriveStatusMsg({
      type: 'success',
      text: `บันทึกกะ "${currentShiftConfig.dateDisplay} (${currentShiftConfig.planTitle})" ลงตารางประวัติ Pivot เรียบร้อยแล้ว!`,
    });
  };

  // Save / Upload to Google Drive (New File or Update Master File with Mandatory Confirmation)
  const handleSaveToGoogleDrive = async (asNewFile: boolean) => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setDriveStatusMsg({
        type: 'info',
        text: 'กรุณากดปุ่ม "Sign in with Google" ด้านบนเพื่อเชื่อมต่อ Google Drive ก่อนบันทึกไฟล์',
      });
      return;
    }

    // Ensure current live shift is included in the payload saved to Drive
    const mergedSnapshots: HistoricalShiftSnapshot[] = [
      {
        ...currentLiveSnapshot,
        id: `snap-${currentShiftConfig.dateDisplay.replace(/\s+/g, '')}-${currentShiftConfig.shiftType}`,
        savedAtDisplay: `${currentShiftConfig.dateDisplay} (${
          currentShiftConfig.shiftType === 'night' ? 'กะกลางคืน' : 'กะกลางวัน'
        })`,
      },
      ...historySnapshots.filter(
        (s) =>
          !(
            s.shiftConfig.dateDisplay === currentShiftConfig.dateDisplay &&
            s.shiftConfig.shiftType === currentShiftConfig.shiftType
          )
      ),
    ];

    const payloadString = JSON.stringify(
      {
        app: 'IE Production Plan & Hourly Tracking',
        updatedAt: new Date().toISOString(),
        totalSnapshots: mergedSnapshots.length,
        snapshots: mergedSnapshots,
      },
      null,
      2
    );

    const existingMaster = driveFiles.find((f) => f.name === MASTER_DRIVE_FILENAME);

    if (!asNewFile && existingMaster) {
      // MANDATORY USER CONFIRMATION BEFORE UPDATING/OVERWRITING EXISTING GOOGLE DRIVE FILE
      setPendingConfirmAction({
        title: 'ยืนยันการอัปเดตทับไฟล์ฐานข้อมูลบน Google Drive',
        description: `คุณต้องการอัปเดตข้อมูลแผนการผลิตและประวัติย้อนหลังจำนวน ${mergedSnapshots.length} กะ ทับลงในไฟล์ "${existingMaster.name}" บน Google Drive ของคุณใช่หรือไม่?`,
        confirmLabel: 'ยืนยันการอัปเดตไฟล์ (Confirm Update)',
        isDestructive: false,
        onConfirm: async () => {
          setIsLoadingDrive(true);
          try {
            await updateDriveFileContent(existingMaster.id, payloadString, 'application/json');
            setHistorySnapshots(mergedSnapshots);
            await refreshDriveFileList();
            setDriveStatusMsg({
              type: 'success',
              text: `อัปเดตฐานข้อมูล "${existingMaster.name}" บน Google Drive สำเร็จ (${mergedSnapshots.length} กะ)!`,
            });
          } catch (err: any) {
            setDriveStatusMsg({
              type: 'error',
              text: err?.message || 'เกิดข้อผิดพลาดในการอัปเดตไฟล์บน Google Drive',
            });
          } finally {
            setIsLoadingDrive(false);
          }
        },
      });
      return;
    }

    // Creating a brand-new file on Google Drive
    const fileName = asNewFile
      ? `IE_Production_Snapshot_${currentShiftConfig.dateDisplay.replace(/\s+/g, '_')}_${currentShiftConfig.shiftType}.json`
      : MASTER_DRIVE_FILENAME;

    setIsLoadingDrive(true);
    try {
      const created = await createDriveFile(fileName, payloadString, 'application/json');
      setHistorySnapshots(mergedSnapshots);
      await refreshDriveFileList();
      setDriveStatusMsg({
        type: 'success',
        text: `สร้างและบันทึกไฟล์ "${created.name}" ขึ้น Google Drive สำเร็จ!`,
      });
    } catch (err: any) {
      setDriveStatusMsg({
        type: 'error',
        text: err?.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์บน Google Drive',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Load / Sync a file from Google Drive
  const handleLoadDriveFile = async (file: DriveFileMeta) => {
    setIsLoadingDrive(true);
    setDriveStatusMsg(null);
    try {
      const data = await readDriveJsonFile<any>(file.id);
      if (data && Array.isArray(data.snapshots) && data.snapshots.length > 0) {
        setHistorySnapshots(data.snapshots);
        setDriveStatusMsg({
          type: 'success',
          text: `ดึงข้อมูลย้อนหลังจำนวน ${data.snapshots.length} กะ จากไฟล์ "${file.name}" บน Google Drive สำเร็จ! พร้อมสำหรับทำตาราง Pivot ทันที`,
        });
      } else if (data && data.shiftConfig && Array.isArray(data.models)) {
        // Single snapshot file
        const singleSnap = data as HistoricalShiftSnapshot;
        setHistorySnapshots((prev) => [
          singleSnap,
          ...prev.filter((p) => p.id !== singleSnap.id),
        ]);
        setDriveStatusMsg({
          type: 'success',
          text: `โหลดข้อมูลกะจากไฟล์ "${file.name}" เข้าตาราง Pivot สำเร็จ!`,
        });
      } else {
        setDriveStatusMsg({
          type: 'error',
          text: `รูปแบบไฟล์ "${file.name}" ไม่ตรงกับโครงสร้างข้อมูลแผนการผลิต IE`,
        });
      }
    } catch (err: any) {
      setDriveStatusMsg({
        type: 'error',
        text: err?.message || 'ไม่สามารถอ่านไฟล์จาก Google Drive ได้',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Delete a file from Google Drive (WITH MANDATORY USER CONFIRMATION MODAL)
  const handleRequestDeleteDriveFile = (file: DriveFileMeta) => {
    setPendingConfirmAction({
      title: 'ยืนยันการลบไฟล์ออกจาก Google Drive',
      description: `คุณต้องการลบไฟล์ "${file.name}" ออกจาก Google Drive ของคุณอย่างถาวรใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      confirmLabel: 'ยืนยันการลบไฟล์ (Delete)',
      isDestructive: true,
      onConfirm: async () => {
        setIsLoadingDrive(true);
        try {
          await deleteDriveFile(file.id);
          await refreshDriveFileList();
          setDriveStatusMsg({
            type: 'info',
            text: `ลบไฟล์ "${file.name}" ออกจาก Google Drive เรียบร้อยแล้ว`,
          });
        } catch (err: any) {
          setDriveStatusMsg({
            type: 'error',
            text: err?.message || 'ไม่สามารถลบไฟล์จาก Google Drive ได้',
          });
        } finally {
          setIsLoadingDrive(false);
        }
      },
    });
  };

  // Combine historical snapshots + optional current live shift for Pivot analysis
  const allSnapshotsForPivot = useMemo(() => {
    if (!includeCurrentLiveShift) return historySnapshots;
    return [currentLiveSnapshot, ...historySnapshots];
  }, [includeCurrentLiveShift, currentLiveSnapshot, historySnapshots]);

  // Flatten snapshots into Model-Level Fact Rows and Hourly-Level Fact Rows
  const { modelFacts, hourlyFacts, distinctDates } = useMemo(() => {
    const mFacts: ModelFactRow[] = [];
    const hFacts: HourlyFactRow[] = [];
    const dateSet = new Set<string>();

    allSnapshotsForPivot.forEach((snap) => {
      const dateStr = snap.shiftConfig.dateDisplay;
      dateSet.add(dateStr);
      const shiftType = snap.shiftConfig.shiftType;
      const shiftLabel = shiftType === 'night' ? 'กะกลางคืน (Night)' : 'กะกลางวัน (Day)';
      const hours = snap.shiftConfig.workingHours > 0 ? snap.shiftConfig.workingHours : 10.5;

      // Calculate total actual recorded on Line A and Line B for this snapshot
      const planLineA = snap.models.reduce((s, m) => s + getModelLineQty(m, 'A'), 0);
      const planLineB = snap.models.reduce((s, m) => s + getModelLineQty(m, 'B'), 0);

      const recordedA = snap.hourlyRecordsA.filter((r) => r.actual !== null);
      const recordedB = snap.hourlyRecordsB.filter((r) => r.actual !== null);

      const sumActualA =
        recordedA.length > 0
          ? recordedA.reduce((s, r) => s + (r.actual ?? 0), 0)
          : planLineA; // If no hourly actual entered yet in live shift, use plan as baseline preview
      const sumActualB =
        recordedB.length > 0
          ? recordedB.reduce((s, r) => s + (r.actual ?? 0), 0)
          : planLineB;

      const ratioA = planLineA > 0 ? sumActualA / planLineA : 1;
      const ratioB = planLineB > 0 ? sumActualB / planLineB : 1;

      // 1. Model-level facts per Line (Line A and Line B)
      snap.models.forEach((m) => {
        if (isModelInLine(m, 'A')) {
          const pQty = getModelLineQty(m, 'A');
          const aQty = Math.round(pQty * ratioA);
          const uPlan = getModelLineUph(m, 'A');
          const uAct = Math.round(aQty / hours);
          mFacts.push({
            snapshotId: snap.id,
            dateDisplay: dateStr,
            shiftType,
            shiftLabel,
            workingHours: hours,
            line: 'Line A',
            modelName: m.modelName,
            groupKey: m.groupKey || m.modelName,
            jigs: Number(m.jigA) || 0,
            planQty: pQty,
            actualQty: aQty,
            gapQty: aQty - pQty,
            uphPlan: uPlan,
            uphActual: uAct,
            achvPercent: pQty > 0 ? (aQty / pQty) * 100 : 100,
          });
        }
        if (isModelInLine(m, 'B')) {
          const pQty = getModelLineQty(m, 'B');
          const aQty = Math.round(pQty * ratioB);
          const uPlan = getModelLineUph(m, 'B');
          const uAct = Math.round(aQty / hours);
          mFacts.push({
            snapshotId: snap.id,
            dateDisplay: dateStr,
            shiftType,
            shiftLabel,
            workingHours: hours,
            line: 'Line B',
            modelName: m.modelName,
            groupKey: m.groupKey || m.modelName,
            jigs: Number(m.jigB) || 0,
            planQty: pQty,
            actualQty: aQty,
            gapQty: aQty - pQty,
            uphPlan: uPlan,
            uphActual: uAct,
            achvPercent: pQty > 0 ? (aQty / pQty) * 100 : 100,
          });
        }
      });

      // 2. Hourly-level facts for Line A and Line B
      snap.hourlyRecordsA.forEach((r, idx) => {
        const act = r.actual ?? r.plan;
        hFacts.push({
          snapshotId: snap.id,
          dateDisplay: dateStr,
          shiftType,
          shiftLabel,
          line: 'Line A',
          hourSlotIndex: idx,
          hourLabel: r.label,
          planQty: r.plan,
          actualQty: act,
          gapQty: act - r.plan,
          achvPercent: r.plan > 0 ? (act / r.plan) * 100 : 100,
          note: r.note || '',
        });
      });

      snap.hourlyRecordsB.forEach((r, idx) => {
        const act = r.actual ?? r.plan;
        hFacts.push({
          snapshotId: snap.id,
          dateDisplay: dateStr,
          shiftType,
          shiftLabel,
          line: 'Line B',
          hourSlotIndex: idx,
          hourLabel: r.label,
          planQty: r.plan,
          actualQty: act,
          gapQty: act - r.plan,
          achvPercent: r.plan > 0 ? (act / r.plan) * 100 : 100,
          note: r.note || '',
        });
      });
    });

    return {
      modelFacts: mFacts,
      hourlyFacts: hFacts,
      distinctDates: Array.from(dateSet),
    };
  }, [allSnapshotsForPivot]);

  // Apply Slicers / Filters & Compute Pivot Matrix
  const pivotResult = useMemo(() => {
    const activeRowField: PivotRowField =
      datasetMode === 'hourly_facts' && rowField === 'modelName' ? 'hourLabel' : rowField;

    type CellAccumulator = {
      plan: number;
      actual: number;
      gap: number;
      jigs: number;
      uphSum: number;
      count: number;
    };

    const emptyAcc = (): CellAccumulator => ({
      plan: 0,
      actual: 0,
      gap: 0,
      jigs: 0,
      uphSum: 0,
      count: 0,
    });

    const rowMap = new Map<string, Map<string, CellAccumulator>>();
    const rowTotals = new Map<string, CellAccumulator>();
    const colKeysSet = new Set<string>();
    const grandTotal = emptyAcc();

    const addValue = (rowKey: string, colKey: string, item: {
      plan: number;
      actual: number;
      jigs: number;
      uph: number;
    }) => {
      colKeysSet.add(colKey);
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, new Map());
      const colMap = rowMap.get(rowKey)!;
      if (!colMap.has(colKey)) colMap.set(colKey, emptyAcc());
      const cell = colMap.get(colKey)!;

      cell.plan += item.plan;
      cell.actual += item.actual;
      cell.gap += item.actual - item.plan;
      cell.jigs += item.jigs;
      cell.uphSum += item.uph;
      cell.count += 1;

      if (!rowTotals.has(rowKey)) rowTotals.set(rowKey, emptyAcc());
      const rTot = rowTotals.get(rowKey)!;
      rTot.plan += item.plan;
      rTot.actual += item.actual;
      rTot.gap += item.actual - item.plan;
      rTot.jigs += item.jigs;
      rTot.uphSum += item.uph;
      rTot.count += 1;

      grandTotal.plan += item.plan;
      grandTotal.actual += item.actual;
      grandTotal.gap += item.actual - item.plan;
      grandTotal.jigs += item.jigs;
      grandTotal.uphSum += item.uph;
      grandTotal.count += 1;
    };

    if (datasetMode === 'model_facts') {
      const filtered = modelFacts.filter((f) => {
        if (filterDate !== 'ALL' && f.dateDisplay !== filterDate) return false;
        if (filterShift !== 'ALL' && f.shiftType !== filterShift) return false;
        if (filterLine !== 'ALL' && f.line !== filterLine) return false;
        if (
          filterModelQuery.trim() !== '' &&
          !f.modelName.toLowerCase().includes(filterModelQuery.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      });

      filtered.forEach((f) => {
        const rKey =
          activeRowField === 'modelName'
            ? f.modelName
            : activeRowField === 'line'
            ? f.line
            : activeRowField === 'dateDisplay'
            ? f.dateDisplay
            : `${f.dateDisplay} (${f.shiftType === 'night' ? 'กะดึก' : 'กะเช้า'})`;

        const cKey =
          colField === 'line'
            ? f.line
            : colField === 'dateDisplay'
            ? f.dateDisplay
            : colField === 'shiftType'
            ? f.shiftLabel
            : 'รวมทั้งหมด';

        addValue(rKey, cKey, {
          plan: f.planQty,
          actual: f.actualQty,
          jigs: f.jigs,
          uph: f.uphActual,
        });
      });
    } else {
      const filtered = hourlyFacts.filter((f) => {
        if (filterDate !== 'ALL' && f.dateDisplay !== filterDate) return false;
        if (filterShift !== 'ALL' && f.shiftType !== filterShift) return false;
        if (filterLine !== 'ALL' && f.line !== filterLine) return false;
        return true;
      });

      filtered.forEach((f) => {
        const rKey =
          activeRowField === 'hourLabel'
            ? f.hourLabel
            : activeRowField === 'line'
            ? f.line
            : activeRowField === 'dateDisplay'
            ? f.dateDisplay
            : `${f.dateDisplay} (${f.shiftType === 'night' ? 'กะดึก' : 'กะเช้า'})`;

        const cKey =
          colField === 'line'
            ? f.line
            : colField === 'dateDisplay'
            ? f.dateDisplay
            : colField === 'shiftType'
            ? f.shiftLabel
            : 'รวมทั้งหมด';

        addValue(rKey, cKey, {
          plan: f.planQty,
          actual: f.actualQty,
          jigs: 0,
          uph: f.actualQty,
        });
      });
    }

    const colKeys = Array.from(colKeysSet);
    const rows = Array.from(rowMap.entries()).map(([rowKey, cols]) => ({
      rowKey,
      cols,
      total: rowTotals.get(rowKey) || emptyAcc(),
    }));

    // Sort rows by Plan descending (except when grouped by hourLabel)
    if (activeRowField !== 'hourLabel') {
      rows.sort((a, b) => b.total.plan - a.total.plan);
    }

    return {
      activeRowField,
      colKeys,
      rows,
      grandTotal,
    };
  }, [
    datasetMode,
    rowField,
    colField,
    modelFacts,
    hourlyFacts,
    filterDate,
    filterShift,
    filterLine,
    filterModelQuery,
  ]);

  const formatCellMetric = (acc: {
    plan: number;
    actual: number;
    gap: number;
    jigs: number;
    uphSum: number;
    count: number;
  } | undefined): string => {
    if (!acc || acc.count === 0) return '-';
    if (valueMetric === 'plan') return acc.plan.toLocaleString();
    if (valueMetric === 'actual') return acc.actual.toLocaleString();
    if (valueMetric === 'gap') return acc.gap > 0 ? `+${acc.gap.toLocaleString()}` : acc.gap.toLocaleString();
    if (valueMetric === 'jigs') return acc.jigs.toLocaleString();
    if (valueMetric === 'uph') return Math.round(acc.uphSum / acc.count).toLocaleString();
    const pct = acc.plan > 0 ? (acc.actual / acc.plan) * 100 : 100;
    return `${pct.toFixed(1)}%`;
  };

  // Export Pivot Table to CSV (or upload CSV to Google Drive)
  const buildPivotCsvContent = () => {
    const headers = [
      'Row Dimension',
      ...pivotResult.colKeys.map((c) => `${c} (${valueMetric})`),
      'Total Plan',
      'Total Actual',
      'Total Gap',
      '% Achievement',
    ];
    const lines = pivotResult.rows.map((r) => {
      const colVals = pivotResult.colKeys.map((cKey) =>
        formatCellMetric(r.cols.get(cKey)).replace(/,/g, '')
      );
      const pct = r.total.plan > 0 ? ((r.total.actual / r.total.plan) * 100).toFixed(1) : '100.0';
      return [
        `"${r.rowKey}"`,
        ...colVals,
        r.total.plan,
        r.total.actual,
        r.total.gap,
        `${pct}%`,
      ].join(',');
    });

    return '\uFEFF' + headers.join(',') + '\n' + lines.join('\n');
  };

  const handleDownloadPivotCsv = () => {
    const csv = buildPivotCsvContent();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IE_Pivot_Report_${datasetMode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSavePivotCsvToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setDriveStatusMsg({
        type: 'info',
        text: 'กรุณากดปุ่ม "Sign in with Google" เพื่อเชื่อมต่อ Google Drive ก่อนส่งออกไฟล์ CSV ขึ้น Drive',
      });
      return;
    }
    setIsLoadingDrive(true);
    try {
      const csv = buildPivotCsvContent();
      const fileName = `IE_Production_Pivot_${datasetMode}_${new Date().toISOString().slice(0, 10)}.csv`;
      const created = await createDriveFile(fileName, csv, 'text/csv');
      await refreshDriveFileList();
      setDriveStatusMsg({
        type: 'success',
        text: `บันทึกตาราง Pivot ไฟล์ "${created.name}" ขึ้น Google Drive สำเร็จ! สามารถเปิดด้วย Google Sheets ได้ทันที`,
      });
    } catch (err: any) {
      setDriveStatusMsg({
        type: 'error',
        text: err?.message || 'ไม่สามารถอัปโหลดไฟล์ CSV ขึ้น Google Drive ได้',
      });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* MANDATORY CONFIRMATION MODAL FOR GOOGLE DRIVE UPDATE / DELETE */}
      {pendingConfirmAction && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div className="bg-white rounded-xl border border-slate-300 max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    pendingConfirmAction.isDestructive
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 id="confirm-modal-title" className="text-base font-bold text-slate-900">
                  {pendingConfirmAction.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirmAction(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {pendingConfirmAction.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPendingConfirmAction(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = pendingConfirmAction.onConfirm;
                  setPendingConfirmAction(null);
                  await fn();
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors ${
                  pendingConfirmAction.isDestructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#0B4F8A] hover:bg-[#083B66]'
                }`}
              >
                {pendingConfirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: GOOGLE DRIVE CLOUD STORAGE & AUTHENTICATION PANEL */}
      <section
        className="bg-white rounded-xl border-2 border-[#0B4F8A] overflow-hidden shadow-xs"
        aria-label="ระบบเชื่อมต่อ Google Drive และจัดเก็บข้อมูลย้อนหลัง"
      >
        <div className="bg-gradient-to-r from-[#083B66] via-[#0B4F8A] to-[#0F528C] text-white px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-white/15 border border-white/25 flex-shrink-0">
              <Cloud className="w-6 h-6 text-sky-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200 font-semibold">
                <span>GOOGLE DRIVE CLOUD ARCHIVE &amp; HISTORICAL PIVOT ENGINE</span>
                <span aria-hidden="true">·</span>
                <span>ฐานข้อมูลแผนการผลิตและวิเคราะห์ข้อมูลย้อนหลัง</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                จัดเก็บแผนการผลิตบน Google Drive &amp; ตาราง Pivot วิเคราะห์ข้อมูลย้อนหลัง
              </h2>
              <p className="text-xs text-sky-100 mt-0.5">
                บันทึกข้อมูลแผนและผลผลิตจริงรายชั่วโมงของทั้ง Line A และ Line B ขึ้น Google Drive เพื่อเรียกดูและทำตาราง Pivot เปรียบเทียบย้อนหลังได้ทุกวัน
              </p>
            </div>
          </div>

          {/* Right: Google Sign-In Button or Connected Account Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {needsAuth ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      ></path>
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      ></path>
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      ></path>
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      ></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isLoggingIn ? 'กำลังเชื่อมต่อ...' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-1.5">
                <div className="text-xs">
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>เชื่อมต่อ Google Drive แล้ว</span>
                  </div>
                  <div className="text-[11px] text-sky-100">{user?.email || user?.displayName}</div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>สลับบัญชี</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status Message Banner */}
        {driveStatusMsg && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
              driveStatusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : driveStatusMsg.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-sky-50 text-[#083B66] border-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{driveStatusMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setDriveStatusMsg(null)}
              className="text-slate-500 hover:text-slate-800"
            >
              ปิด
            </button>
          </div>
        )}

        {/* Cloud Action Controls & Google Drive File List */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 Cols: Save Current Shift & Manage Historical Snapshots */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#083B66] flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0B4F8A]" />
                <span>
                  1. บันทึกกะปัจจุบัน ({currentShiftConfig.dateDisplay} · {currentShiftConfig.planTitle}) ลงประวัติ &amp; Google Drive
                </span>
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-slate-900">
                  ข้อมูลกะปัจจุบันพร้อมบันทึก: {currentModels.length} รุ่น (Line A + Line B) · เวลาทำงาน{' '}
                  {currentShiftConfig.workingHours} ชม.
                </div>
                <div className="text-slate-600">
                  สามารถบันทึกลงตารางประวัติบนเว็บได้ทันที และซิงค์เป็นไฟล์ JSON / CSV ขึ้น Google Drive เพื่อเก็บถาวร
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCurrentShiftToLocalHistory}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ บันทึกกะปัจจุบันลงประวัติ Pivot</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveToGoogleDrive(false)}
                  disabled={isLoadingDrive}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#0B4F8A] hover:bg-[#083B66] text-white transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>ซิงค์ฐานข้อมูลหลักขึ้น Google Drive</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveToGoogleDrive(true)}
                  disabled={isLoadingDrive}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-[#0B4F8A] border border-sky-300 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>แยกไฟล์ใหม่บน Drive</span>
                </button>
              </div>
            </div>

            {/* Saved Shift Snapshots Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-800">
                  รายการข้อมูลกะย้อนหลังที่ใช้คำนวณ Pivot ({allSnapshotsForPivot.length} กะ)
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-[#0B4F8A]">
                  <input
                    type="checkbox"
                    checked={includeCurrentLiveShift}
                    onChange={(e) => setIncludeCurrentLiveShift(e.target.checked)}
                    className="rounded border-slate-300 text-[#0B4F8A]"
                  />
                  <span>รวมข้อมูลกะปัจจุบันที่กำลังเปิดอยู่เข้าในตาราง Pivot ด้วย</span>
                </label>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 text-xs">
                {allSnapshotsForPivot.map((snap) => {
                  const totalPlan = snap.models.reduce((s, m) => s + (Number(m.qtyPlan) || 0), 0);
                  const isLive = snap.id === 'live-current-shift';
                  return (
                    <div
                      key={snap.id}
                      className={`px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 ${
                        isLive ? 'bg-amber-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{snap.savedAtDisplay}</span>
                          {isLive && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-300 text-slate-950 font-bold">
                              LIVE ปัจจุบัน
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {snap.shiftConfig.planTitle} · แผนรวม {totalPlan.toLocaleString()} เครื่อง ·{' '}
                          {snap.models.length} รุ่น · {snap.shiftConfig.workingHours} ชม.
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isLive && (
                          <>
                            <button
                              type="button"
                              onClick={() => onLoadSnapshotToBoard(snap)}
                              className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-100 text-[#0B4F8A] border border-sky-200 font-semibold transition-colors"
                            >
                              โหลดขึ้นบอร์ด
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setHistorySnapshots((prev) => prev.filter((p) => p.id !== snap.id))
                              }
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              title="ลบออกจากรายการประวัติบนเว็บ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Files Stored in User's Google Drive */}
          <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="font-bold text-xs sm:text-sm text-[#083B66] flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-[#0B4F8A]" />
                  <span>2. ไฟล์แผนการผลิตใน Google Drive ของคุณ</span>
                </div>
                <button
                  type="button"
                  onClick={refreshDriveFileList}
                  disabled={isLoadingDrive || needsAuth}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                  <span>รีเฟรช</span>
                </button>
              </div>

              {needsAuth ? (
                <div className="py-6 text-center space-y-2">
                  <p className="text-xs text-slate-600">
                    เชื่อมต่อบัญชี Google เพื่อดู ดึงข้อมูล หรือสำรองไฟล์แผนการผลิตและตาราง Pivot ไว้บน Google Drive ของคุณ
                  </p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
                      className="gsi-material-button"
                    >
                      <div className="gsi-material-button-state"></div>
                      <div className="gsi-material-button-content-wrapper">
                        <div className="gsi-material-button-icon">
                          <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 48 48"
                            style={{ display: 'block' }}
                          >
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            ></path>
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            ></path>
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            ></path>
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            ></path>
                            <path fill="none" d="M0 0h48v48H0z"></path>
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">Sign in with Google</span>
                      </div>
                    </button>
                  </div>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 space-y-1">
                  <div>ยังไม่มีไฟล์ฐานข้อมูลที่สร้างจากแอปนี้ใน Google Drive</div>
                  <div>
                    คลิกปุ่ม <strong>&ldquo;ซิงค์ฐานข้อมูลหลักขึ้น Google Drive&rdquo;</strong> ด้านซ้ายเพื่อสร้างไฟล์แรกทันที
                  </div>
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          แก้ไขล่าสุด:{' '}
                          {new Date(file.modifiedTime).toLocaleString('th-TH', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {file.name.endsWith('.json') && (
                          <button
                            type="button"
                            onClick={() => handleLoadDriveFile(file)}
                            className="px-2 py-1 rounded bg-[#0B4F8A] hover:bg-[#083B66] text-white text-[11px] font-semibold"
                          >
                            ดึงข้อมูล
                          </button>
                        )}
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-500 hover:text-[#0B4F8A]"
                            title="เปิดดูบน Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteDriveFile(file)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="ลบไฟล์ออกจาก Google Drive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>สิทธิ์ความปลอดภัย: เฉพาะไฟล์ที่สร้างโดยแอปนี้ (drive.file)</span>
              <span className="font-mono-num font-semibold text-emerald-700">Ready</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: INTERACTIVE PIVOT TABLE & HISTORICAL ANALYTICS ON WEB */}
      <section
        className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-xs"
        aria-label="ตาราง Pivot วิเคราะห์ข้อมูลการผลิตย้อนหลังบนเว็บ"
      >
        <div className="bg-[#0B4F8A] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Table className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                ตาราง Pivot วิเคราะห์ข้อมูลย้อนหลังบน Web (Interactive IE Pivot Table)
              </h2>
              <p className="text-xs text-sky-100">
                เลือกมิติแถว (Row), คอลัมน์ (Column), ตัวชี้วัด (Value Metric) และตัวกรองวันที่/กะ/สายการผลิต เพื่อวิเคราะห์แนวโน้มย้อนหลัง
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleDownloadPivotCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#0B4F8A]" />
              <span>ดาวน์โหลด Pivot (.CSV)</span>
            </button>
            <button
              type="button"
              onClick={handleSavePivotCsvToDrive}
              disabled={isLoadingDrive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors disabled:opacity-50"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>ส่งออก Pivot (.CSV) ขึ้น Google Drive</span>
            </button>
          </div>
        </div>

        {/* Pivot Configuration Bar (Dataset Mode, Row, Column, Value, and Slicers) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Row 1: Dataset Mode + Dimension Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                1. ชุดข้อมูลที่ต้องการ Pivot (Dataset)
              </label>
              <select
                value={datasetMode}
                onChange={(e) => {
                  const nextMode = e.target.value as PivotDatasetMode;
                  setDatasetMode(nextMode);
                  if (nextMode === 'hourly_facts') {
                    setRowField('hourLabel');
                  } else {
                    setRowField('modelName');
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-[#083B66]"
              >
                <option value="model_facts">
                  Pivot รายรุ่น &amp; สายการผลิต (Model × Line × Date)
                </option>
                <option value="hourly_facts">
                  Pivot ติดตามรายชั่วโมง (Hour H1..H10.5 × Line × Date)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                2. แกนแถว (Row Dimension)
              </label>
              <select
                value={pivotResult.activeRowField}
                onChange={(e) => setRowField(e.target.value as PivotRowField)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-900"
              >
                {datasetMode === 'model_facts' && (
                  <option value="modelName">แยกตามรุ่นการผลิต (Model)</option>
                )}
                {datasetMode === 'hourly_facts' && (
                  <option value="hourLabel">แยกตามช่วงเวลาชั่วโมง (Hour Slot)</option>
                )}
                <option value="line">แยกตามสายการผลิต (Line A / Line B)</option>
                <option value="dateDisplay">แยกตามวันที่ผลิต (Date)</option>
                <option value="dateAndShift">แยกตามวันที่ + กะ (Date &amp; Shift)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                3. แกนคอลัมน์ (Column Dimension)
              </label>
              <select
                value={colField}
                onChange={(e) => setColField(e.target.value as PivotColField)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="line">เปรียบเทียบ Line A vs Line B</option>
                <option value="dateDisplay">เปรียบเทียบตามวันที่ (Date Columns)</option>
                <option value="shiftType">เปรียบเทียบกะดึก vs กะเช้า (Shift Columns)</option>
                <option value="none_multi_metric">แสดงเฉพาะผลรวม (Summary Only)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                4. ค่าที่แสดงในช่องตาราง (Values)
              </label>
              <select
                value={valueMetric}
                onChange={(e) => setValueMetric(e.target.value as PivotValueMetric)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-sky-400 rounded-lg text-[#0B4F8A]"
              >
                <option value="actual">ผลรวมยอดผลิตจริง (Actual Q&apos;ty)</option>
                <option value="plan">ผลรวมแผนการผลิต (Plan Q&apos;ty)</option>
                <option value="achvPercent">% บรรลุเป้าหมายเฉลี่ย (% Achievement)</option>
                <option value="gap">ผลรวมส่วนต่าง (Gap = Actual - Plan)</option>
                {datasetMode === 'model_facts' && (
                  <option value="jigs">ผลรวมจำนวน JIG ที่ใช้งาน (JIG Count)</option>
                )}
                <option value="uph">ค่าเฉลี่ย UPH (Units Per Hour)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Slicers / Filters */}
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 inline-flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#0B4F8A]" />
                <span>ตัวกรอง Slicer:</span>
              </span>

              <select
                aria-label="กรองตามวันที่"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md font-semibold"
              >
                <option value="ALL">ทุกวันที่ ({distinctDates.length} วัน)</option>
                {distinctDates.map((d) => (
                  <option key={d} value={d}>
                    วันที่ {d}
                  </option>
                ))}
              </select>

              <select
                aria-label="กรองตามกะ"
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value as 'ALL' | 'night' | 'day')}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md font-semibold"
              >
                <option value="ALL">ทุกกะ (กะดึก + กะเช้า)</option>
                <option value="night">เฉพาะกะกลางคืน (Night Shift)</option>
                <option value="day">เฉพาะกะกลางวัน (Day Shift)</option>
              </select>

              <select
                aria-label="กรองตามสายการผลิต"
                value={filterLine}
                onChange={(e) => setFilterLine(e.target.value as 'ALL' | 'Line A' | 'Line B')}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-md font-semibold"
              >
                <option value="ALL">ทั้ง 2 สายการผลิต (Line A + Line B)</option>
                <option value="Line A">เฉพาะ Line A (JIG A)</option>
                <option value="Line B">เฉพาะ Line B (JIG B)</option>
              </select>

              {datasetMode === 'model_facts' && (
                <input
                  type="text"
                  placeholder="ค้นหาชื่อรุ่น เช่น TM19..."
                  value={filterModelQuery}
                  onChange={(e) => setFilterModelQuery(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-md w-40"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setFilterDate('ALL');
                setFilterShift('ALL');
                setFilterLine('ALL');
                setFilterModelQuery('');
              }}
              className="text-xs font-semibold text-[#0B4F8A] hover:underline"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        </div>

        {/* Summary KPI Strip for Filtered Pivot Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-sky-50/40 text-center">
          <div className="p-3">
            <div className="text-[11px] font-semibold text-slate-500">
              ผลรวมแผนผลิต (Total Plan)
            </div>
            <div className="text-xl font-bold text-[#083B66] font-mono-num mt-0.5">
              {pivotResult.grandTotal.plan.toLocaleString()}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-semibold text-slate-500">
              ผลรวมผลิตจริง (Total Actual)
            </div>
            <div className="text-xl font-bold text-emerald-800 font-mono-num mt-0.5">
              {pivotResult.grandTotal.actual.toLocaleString()}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-semibold text-slate-500">
              ส่วนต่างสะสม (Total Gap)
            </div>
            <div
              className={`text-xl font-bold font-mono-num mt-0.5 ${
                pivotResult.grandTotal.gap < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {pivotResult.grandTotal.gap > 0
                ? `+${pivotResult.grandTotal.gap.toLocaleString()}`
                : pivotResult.grandTotal.gap.toLocaleString()}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-semibold text-slate-500">
              % บรรลุเป้าหมายรวม (%Achv)
            </div>
            <div className="text-xl font-bold text-[#0B4F8A] font-mono-num mt-0.5">
              {pivotResult.grandTotal.plan > 0
                ? `${((pivotResult.grandTotal.actual / pivotResult.grandTotal.plan) * 100).toFixed(1)}%`
                : '100.0%'}
            </div>
          </div>
        </div>

        {/* Pivot Matrix Table + Visual Chart */}
        <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#0F528C] text-white font-semibold">
                  <th className="py-2 px-3 text-left border border-slate-300">
                    {pivotResult.activeRowField === 'modelName'
                      ? 'รุ่นการผลิต (Model)'
                      : pivotResult.activeRowField === 'hourLabel'
                      ? 'ชั่วโมงการผลิต (Hour)'
                      : pivotResult.activeRowField === 'line'
                      ? 'สายการผลิต (Line)'
                      : 'วันที่ / กะการผลิต'}
                  </th>
                  {pivotResult.colKeys.map((cKey) => (
                    <th key={cKey} className="py-2 px-2.5 text-right border border-slate-300">
                      {cKey}
                    </th>
                  ))}
                  <th className="py-2 px-2.5 text-right border border-slate-300 bg-slate-800">
                    รวม Plan
                  </th>
                  <th className="py-2 px-2.5 text-right border border-slate-300 bg-slate-800">
                    รวม Actual
                  </th>
                  <th className="py-2 px-2.5 text-right border border-slate-300 bg-slate-800">
                    Gap
                  </th>
                  <th className="py-2 px-2.5 text-right border border-slate-300 bg-emerald-900">
                    % Achv.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono-num">
                {pivotResult.rows.map((row) => {
                  const rowAchv =
                    row.total.plan > 0 ? (row.total.actual / row.total.plan) * 100 : 100;
                  return (
                    <tr key={row.rowKey} className="even:bg-slate-50/70 hover:bg-sky-50/60">
                      <td className="py-2 px-3 font-sans font-bold text-slate-900 border border-slate-200">
                        {row.rowKey}
                      </td>
                      {pivotResult.colKeys.map((cKey) => {
                        const cellAcc = row.cols.get(cKey);
                        return (
                          <td
                            key={cKey}
                            className="py-2 px-2.5 text-right font-semibold text-slate-800 border border-slate-200"
                          >
                            {formatCellMetric(cellAcc)}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2.5 text-right text-slate-700 border border-slate-200 bg-slate-50">
                        {row.total.plan.toLocaleString()}
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold text-[#083B66] border border-slate-200 bg-slate-50">
                        {row.total.actual.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-bold border border-slate-200 bg-slate-50 ${
                          row.total.gap < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {row.total.gap > 0
                          ? `+${row.total.gap.toLocaleString()}`
                          : row.total.gap.toLocaleString()}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-bold border border-slate-200 bg-emerald-50/40 ${
                          rowAchv < 95
                            ? 'text-red-600'
                            : rowAchv < 100
                            ? 'text-amber-700'
                            : 'text-emerald-800'
                        }`}
                      >
                        {rowAchv.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#0B4F8A] text-white font-bold font-mono-num">
                  <td className="py-2 px-3 font-sans border border-slate-400/30">
                    รวมทั้งหมด (Grand Total)
                  </td>
                  {pivotResult.colKeys.map((cKey) => {
                    // Sum across rows for this column
                    const colAcc = pivotResult.rows.reduce(
                      (acc, r) => {
                        const c = r.cols.get(cKey);
                        if (c) {
                          acc.plan += c.plan;
                          acc.actual += c.actual;
                          acc.gap += c.gap;
                          acc.jigs += c.jigs;
                          acc.uphSum += c.uphSum;
                          acc.count += c.count;
                        }
                        return acc;
                      },
                      { plan: 0, actual: 0, gap: 0, jigs: 0, uphSum: 0, count: 0 }
                    );
                    return (
                      <td
                        key={`tot-${cKey}`}
                        className="py-2 px-2.5 text-right border border-slate-400/30"
                      >
                        {formatCellMetric(colAcc)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2.5 text-right border border-slate-400/30">
                    {pivotResult.grandTotal.plan.toLocaleString()}
                  </td>
                  <td className="py-2 px-2.5 text-right border border-slate-400/30">
                    {pivotResult.grandTotal.actual.toLocaleString()}
                  </td>
                  <td className="py-2 px-2.5 text-right border border-slate-400/30">
                    {pivotResult.grandTotal.gap > 0
                      ? `+${pivotResult.grandTotal.gap.toLocaleString()}`
                      : pivotResult.grandTotal.gap.toLocaleString()}
                  </td>
                  <td className="py-2 px-2.5 text-right border border-slate-400/30">
                    {pivotResult.grandTotal.plan > 0
                      ? `${((pivotResult.grandTotal.actual / pivotResult.grandTotal.plan) * 100).toFixed(1)}%`
                      : '100.0%'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Right 4 Cols: Visual Pivot Comparison Bars */}
          <div className="xl:col-span-4 bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs sm:text-sm font-bold text-[#083B66] flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-[#0B4F8A]" />
                  <span>กราฟเปรียบเทียบ Actual vs Plan จากตาราง Pivot</span>
                </h3>
              </div>

              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {pivotResult.rows.map((r) => {
                  const maxPlan = Math.max(
                    1,
                    ...pivotResult.rows.map((item) => Math.max(item.total.plan, item.total.actual))
                  );
                  const planPct = Math.min(100, (r.total.plan / maxPlan) * 100);
                  const actPct = Math.min(100, (r.total.actual / maxPlan) * 100);
                  const achv = r.total.plan > 0 ? (r.total.actual / r.total.plan) * 100 : 100;

                  return (
                    <div
                      key={`chart-${r.rowKey}`}
                      className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-900">{r.rowKey}</span>
                        <span
                          className={`font-mono-num ${
                            achv < 95 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {r.total.actual.toLocaleString()} / {r.total.plan.toLocaleString()} (
                          {achv.toFixed(1)}%)
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-400 rounded-full"
                            style={{ width: `${planPct}%` }}
                            title={`Plan: ${r.total.plan.toLocaleString()}`}
                          />
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              achv < 95 ? 'bg-red-500' : 'bg-[#0B4F8A]'
                            }`}
                            style={{ width: `${actPct}%` }}
                            title={`Actual: ${r.total.actual.toLocaleString()}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>แถบสีเทา = แผนผลิต (Plan) · แถบสีน้ำเงิน/แดง = ผลิตจริง (Actual)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
