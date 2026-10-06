import React, { useState, useEffect } from 'react';
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Printer,
  Layers,
  ShieldAlert,
  Lightbulb,
  Gauge,
  ArrowRight,
} from 'lucide-react';
import {
  ModelPlanItem,
  ShiftPlanConfig,
  ProductionKpiState,
  AlertSeverity,
} from '../types/production';
import { ComputedHourlyRow, getAlertActionDetails, isModelInLine } from '../data/defaultPlan';

export interface LineSummaryMetrics {
  lineId: 'A' | 'B' | 'TOTAL';
  lineName: string;
  modelsCount: number;
  activeModelsCount: number;
  standbyModelsCount: number;
  totalJigs: number;
  activeJigs: number;
  maxJigUph: number;
  maxJigQty: number;
  qtyPlan: number;
  sharePercent: number;
  targetUph: number;
  exactUph: number;
  taktTimeSec: number;
  jigUtilizationPercent: number;
  totalChangeoverMin: number;
  latestHourLabel: string | null;
  cumPlanAtLatest: number;
  cumActualAtLatest: number | null;
  gapAtLatest: number | null;
  achvPercentAtLatest: number | null;
  remainingHours: number;
  remainingQty: number;
  requiredCatchupUph: number;
  severity: AlertSeverity;
}

interface FactoryManagerReportProps {
  shiftConfig: ShiftPlanConfig;
  models: ModelPlanItem[];
  lineAMetrics: LineSummaryMetrics;
  lineBMetrics: LineSummaryMetrics;
  totalMetrics: LineSummaryMetrics;
  lineAHourlyRows: ComputedHourlyRow[];
  lineBHourlyRows: ComputedHourlyRow[];
  totalHourlyRows: ComputedHourlyRow[];
  kpiState: ProductionKpiState;
  onNavigateSheet: (sheet: 'summary' | 'line_a' | 'line_b' | 'ie_config') => void;
  onUpdateHourLabel?: (slotIndex: number, newLabel: string) => void;
}

export const FactoryManagerReport: React.FC<FactoryManagerReportProps> = ({
  shiftConfig,
  models,
  lineAMetrics,
  lineBMetrics,
  totalMetrics,
  lineAHourlyRows,
  lineBHourlyRows,
  totalHourlyRows,
  kpiState,
  onNavigateSheet,
  onUpdateHourLabel,
}) => {
  const [copied, setCopied] = useState(false);
  const [managerCustomNote, setManagerCustomNote] = useState(() => {
    try {
      const saved = localStorage.getItem('IE_MANAGER_CUSTOM_NOTE_V1');
      if (saved !== null) return saved;
    } catch {
      // ignore storage errors
    }
    return 'อนุมัติแผนการผลิตกะกลางคืน ให้ทีม IE และ Supervisor ควบคุมจุดเปลี่ยนรุ่น T520 -> BM29 บน Line A ไม่ให้เกิน 10 นาที และเตรียม JIG B สำรอง (SBS620) พร้อมเดินเสริมหากยอดสะสมต่ำกว่า 95%';
  });

  useEffect(() => {
    try {
      localStorage.setItem('IE_MANAGER_CUSTOM_NOTE_V1', managerCustomNote);
    } catch {
      // ignore storage errors
    }
  }, [managerCustomNote]);

  const lineAModels = models.filter((m) => isModelInLine(m, 'A'));
  const lineBModels = models.filter((m) => isModelInLine(m, 'B'));

  const lineAAlert = getAlertActionDetails(lineAMetrics.severity);
  const lineBAlert = getAlertActionDetails(lineBMetrics.severity);
  const totalAlert = getAlertActionDetails(totalMetrics.severity);

  // Generate plain-text executive summary for copying to Line / Email / Teams
  const generateExecutiveTextReport = () => {
    const hasTracking = totalMetrics.latestHourLabel !== null;
    const lines = [
      `📊 รายงานสรุปแผนและวิเคราะห์การผลิต (เสนอ ผู้จัดการโรงงาน)`,
      `ประจำ${shiftConfig.planTitle} | วันที่ ${shiftConfig.dateDisplay} | เวลาทำงาน ${shiftConfig.workingHours} ชม.`,
      `==================================================`,
      `1. ภาพรวมเป้าหมายและกำลังการผลิต (Plant Summary)`,
      `• เป้าหมายรวมทั้งโรงงาน (Line A + Line B): ${totalMetrics.qtyPlan.toLocaleString()} เครื่อง (${totalMetrics.targetUph} UPH | Takt Time ${totalMetrics.taktTimeSec.toFixed(1)} วินาที)`,
      `• กำลังการผลิตสูงสุดตาม JIG (${totalMetrics.totalJigs} JIG × ${shiftConfig.standardUphPerJig} UPH): ${totalMetrics.maxJigUph} UPH (${totalMetrics.maxJigQty.toLocaleString()} เครื่อง) | อัตราการใช้ JIG เฉลี่ย ${totalMetrics.jigUtilizationPercent.toFixed(1)}%`,
      ``,
      `2. แยกตามสายการผลิต (Line A vs Line B Breakdown)`,
      `🔹 [Line A - JIG A]: แผนผลิต ${lineAMetrics.qtyPlan.toLocaleString()} เครื่อง (${lineAMetrics.sharePercent.toFixed(1)}%) | เป้า ${lineAMetrics.targetUph} UPH | ใช้ JIG A ${lineAMetrics.totalJigs} ตัว (Max ${lineAMetrics.maxJigUph} UPH, Load ${lineAMetrics.jigUtilizationPercent.toFixed(1)}%)`,
      `   - รุ่นที่ผลิต Line A: ${lineAModels.map((m) => `${m.modelName} (${m.qtyPlan} เครื่อง, ${m.jigA} JIG)`).join(', ')}`,
      `🔹 [Line B - JIG B]: แผนผลิต ${lineBMetrics.qtyPlan.toLocaleString()} เครื่อง (${lineBMetrics.sharePercent.toFixed(1)}%) | เป้า ${lineBMetrics.targetUph} UPH | ใช้ JIG B ${lineBMetrics.totalJigs} ตัว (เดินจริง ${lineBMetrics.activeJigs} ตัว + Standby 1 ตัว, Load ${lineBMetrics.jigUtilizationPercent.toFixed(1)}%)`,
      `   - รุ่นที่ผลิต Line B: ${lineBModels.map((m) => `${m.modelName} (${m.qtyPlan} เครื่อง, ${m.jigB} JIG)`).join(', ')}`,
      ``,
      `3. สถานะผลการผลิตจริงรายชั่วโมง (${hasTracking ? `อัปเดตถึง ${totalMetrics.latestHourLabel}` : 'ก่อนเริ่มบันทึกชั่วโมงแรก'})`,
      hasTracking
        ? `• รวมทั้งโรงงาน: สะสมจริง ${totalMetrics.cumActualAtLatest?.toLocaleString()} / แผน ${totalMetrics.cumPlanAtLatest.toLocaleString()} เครื่อง (Gap: ${totalMetrics.gapAtLatest! > 0 ? `+${totalMetrics.gapAtLatest}` : totalMetrics.gapAtLatest} | %Achv: ${totalMetrics.achvPercentAtLatest?.toFixed(1)}%) -> สถานะ: ${totalAlert.actionInstruction}`
        : `• อยู่ระหว่างเริ่มเดินกะ ติดตามเป้าหมายชั่วโมงละ ${totalMetrics.targetUph} เครื่อง (Line A = ${lineAMetrics.targetUph}/ชม., Line B = ${lineBMetrics.targetUph}/ชม.)`,
      hasTracking
        ? `• Line A (${lineAMetrics.latestHourLabel || '-'}): จริง ${lineAMetrics.cumActualAtLatest ?? 0} / แผน ${lineAMetrics.cumPlanAtLatest} (${lineAMetrics.achvPercentAtLatest?.toFixed(1) ?? '100.0'}%) | ต้องทำต่อ ${lineAMetrics.requiredCatchupUph} UPH`
        : '',
      hasTracking
        ? `• Line B (${lineBMetrics.latestHourLabel || '-'}): จริง ${lineBMetrics.cumActualAtLatest ?? 0} / แผน ${lineBMetrics.cumPlanAtLatest} (${lineBMetrics.achvPercentAtLatest?.toFixed(1) ?? '100.0'}%) | ต้องทำต่อ ${lineBMetrics.requiredCatchupUph} UPH`
        : '',
      ``,
      `4. บทสรุปวิเคราะห์วิศวกร IE และข้อเสนอแนะต่อผู้จัดการโรงงาน`,
      `• การบริหารรุ่นหลัก (Core Volume): รุ่น TM19 (Line A) + TM21 (Line B) รวม 506 เครื่อง (47%) และ BM23 (Line A) 189 เครื่อง (17.5%) คิดเป็น 64.5% ของยอดรวม ต้องล็อคสปีด JIG หลักห้ามเกิด Line Stop เกิน 5 นาที`,
      `• การลดสูญเสียบน Line A: รุ่นล็อตเล็ก T520 (49 เครื่อง) และ BM29 (20 เครื่อง) ใช้ JIG A รวม 2 ตัวแต่เดินไม่เต็มกะ แนะนำจัดเดินต่อเนื่องบน JIG A ตัวเดียวกันเพื่อประหยัดเวลา Changeover 10-12 นาที`,
      `• แผนสำรองบน Line B: มี JIG B ของรุ่น SBS620 สแตนด์บาย 1 ตัว (กำลังผลิตสำรอง +6 UPH หรือ +63 เครื่อง/กะ) สามารถเปิดเดินช่วยรุ่น SBS550 หรือ TM14 ได้ทันทีหากเกิดปัญหาคอขวด`,
      `• ข้อสั่งการผู้บริหาร: ${managerCustomNote}`,
    ]
      .filter(Boolean)
      .join('\n');

    return lines;
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(generateExecutiveTextReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-5">
      {/* Executive Report Header Banner */}
      <section
        className="bg-white rounded-xl border-2 border-[#0B4F8A] overflow-hidden shadow-xs"
        aria-label="รายงานบทสรุปวิเคราะห์สำหรับผู้จัดการโรงงาน"
      >
        <div className="bg-gradient-to-r from-[#083B66] via-[#0B4F8A] to-[#0F528C] text-white px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-white/15 border border-white/25 flex-shrink-0">
              <FileText className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200 font-semibold">
                <span>EXECUTIVE IE REPORT FOR FACTORY MANAGER</span>
                <span aria-hidden="true">·</span>
                <span>เอกสารสรุปวิเคราะห์แผนและผลการผลิต</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                รายงานสรุปเปรียบเทียบ Line A &amp; Line B และบทวิเคราะห์เสนอผู้จัดการโรงงาน
              </h2>
              <p className="text-xs text-sky-100 mt-0.5">
                ประจำ{shiftConfig.planTitle} · วันที่ {shiftConfig.dateDisplay} · เวลาทำงาน{' '}
                {shiftConfig.workingHours} ชม. · มาตรฐาน {shiftConfig.standardUphPerJig} UPH/JIG
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors whitespace-nowrap shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-900" />
                  <span>คัดลอกรายงานแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>คัดลอกบทสรุปส่งผู้จัดการ (Line/Email)</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์รายงานผู้บริหาร</span>
            </button>
          </div>
        </div>

        {/* Section 1: Side-by-Side Line A vs Line B vs Total Plant Executive Cards */}
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card 1: Line A Summary */}
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-sky-200 pb-2.5">
                  <div>
                    <span className="text-xs font-bold text-[#0B4F8A]">
                      สายการผลิตที่ 1 (Sheet: Line A)
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Line A (กลุ่ม JIG A — {lineAMetrics.totalJigs} ตัว)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateSheet('line_a')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0B4F8A] text-white hover:bg-[#083B66] transition-colors no-print whitespace-nowrap"
                  >
                    <span>เปิด Sheet Line A</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 my-3 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-sky-100">
                    <div className="text-[11px] text-slate-500">เป้าหมาย Q&apos;ty</div>
                    <div className="text-lg font-bold text-[#083B66] font-mono-num">
                      {lineAMetrics.qtyPlan.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-sky-700 font-mono-num">
                      ({lineAMetrics.sharePercent.toFixed(1)}% ของโรงงาน)
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-sky-100">
                    <div className="text-[11px] text-slate-500">UPH จริง / Max</div>
                    <div className="text-lg font-bold text-[#0B4F8A] font-mono-num">
                      {lineAMetrics.targetUph}{' '}
                      <span className="text-xs text-slate-400 font-normal">
                        / {lineAMetrics.maxJigUph}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono-num">
                      Load {lineAMetrics.jigUtilizationPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-sky-100">
                    <div className="text-[11px] text-slate-500">Takt Time</div>
                    <div className="text-lg font-bold text-slate-900 font-mono-num">
                      {lineAMetrics.taktTimeSec.toFixed(1)}s
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {lineAMetrics.activeModelsCount} รุ่นเดินผลิต
                    </div>
                  </div>
                </div>

                <div className="text-xs space-y-1 text-slate-700">
                  <div className="font-bold text-slate-900">รุ่นผลิตใน Line A:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lineAModels.map((m) => (
                      <span
                        key={m.id}
                        className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono-num"
                      >
                        <strong className="font-sans text-slate-900">{m.modelName}</strong>:{' '}
                        {m.qtyPlan} เครื่อง ({m.jigA} JIG)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-sky-200/80 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">สถานะติดตามล่าสุด:</span>
                <span className={`font-bold ${lineAAlert.textClass}`}>
                  {lineAMetrics.latestHourLabel
                    ? `${lineAMetrics.latestHourLabel}: ${lineAMetrics.cumActualAtLatest?.toLocaleString()} / ${lineAMetrics.cumPlanAtLatest.toLocaleString()} (${lineAMetrics.achvPercentAtLatest?.toFixed(1)}%)`
                    : `พร้อมเดินผลิต (${lineAMetrics.targetUph} เครื่อง/ชม.)`}
                </span>
              </div>
            </div>

            {/* Card 2: Line B Summary */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-indigo-200 pb-2.5">
                  <div>
                    <span className="text-xs font-bold text-indigo-800">
                      สายการผลิตที่ 2 (Sheet: Line B)
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      Line B (กลุ่ม JIG B — {lineBMetrics.totalJigs} ตัว)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateSheet('line_b')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-700 text-white hover:bg-indigo-800 transition-colors no-print whitespace-nowrap"
                  >
                    <span>เปิด Sheet Line B</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 my-3 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <div className="text-[11px] text-slate-500">เป้าหมาย Q&apos;ty</div>
                    <div className="text-lg font-bold text-indigo-950 font-mono-num">
                      {lineBMetrics.qtyPlan.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-indigo-700 font-mono-num">
                      ({lineBMetrics.sharePercent.toFixed(1)}% ของโรงงาน)
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <div className="text-[11px] text-slate-500">UPH จริง / Max</div>
                    <div className="text-lg font-bold text-indigo-800 font-mono-num">
                      {lineBMetrics.targetUph}{' '}
                      <span className="text-xs text-slate-400 font-normal">
                        / {lineBMetrics.maxJigUph}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono-num">
                      Load {lineBMetrics.jigUtilizationPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100">
                    <div className="text-[11px] text-slate-500">Takt Time</div>
                    <div className="text-lg font-bold text-slate-900 font-mono-num">
                      {lineBMetrics.taktTimeSec.toFixed(1)}s
                    </div>
                    <div className="text-[10px] text-slate-500">
                      เดิน {lineBMetrics.activeModelsCount} รุ่น (+{lineBMetrics.standbyModelsCount}{' '}
                      สำรอง)
                    </div>
                  </div>
                </div>

                <div className="text-xs space-y-1 text-slate-700">
                  <div className="font-bold text-slate-900">รุ่นผลิตใน Line B:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lineBModels.map((m) => (
                      <span
                        key={m.id}
                        className={`px-2 py-0.5 border rounded text-[11px] font-mono-num ${
                          m.qtyPlan === 0
                            ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <strong className="font-sans text-slate-900">{m.modelName}</strong>:{' '}
                        {m.qtyPlan} เครื่อง ({m.jigB} JIG{m.qtyPlan === 0 ? ' สำรอง' : ''})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-indigo-200/80 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">สถานะติดตามล่าสุด:</span>
                <span className={`font-bold ${lineBAlert.textClass}`}>
                  {lineBMetrics.latestHourLabel
                    ? `${lineBMetrics.latestHourLabel}: ${lineBMetrics.cumActualAtLatest?.toLocaleString()} / ${lineBMetrics.cumPlanAtLatest.toLocaleString()} (${lineBMetrics.achvPercentAtLatest?.toFixed(1)}%)`
                    : `พร้อมเดินผลิต (${lineBMetrics.targetUph} เครื่อง/ชม.)`}
                </span>
              </div>
            </div>

            {/* Card 3: Total Plant Combined Summary */}
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2.5">
                  <div>
                    <span className="text-xs font-bold text-emerald-800">
                      ภาพรวมทั้งโรงงาน (Combined Plant A+B)
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      รวม 2 สายการผลิต ({totalMetrics.totalJigs} JIGs)
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-700 text-white font-mono-num">
                    {totalMetrics.qtyPlan.toLocaleString()} เครื่อง
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 my-3 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-[11px] text-slate-500">แผนรวม A+B</div>
                    <div className="text-lg font-bold text-emerald-900 font-mono-num">
                      {totalMetrics.qtyPlan.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-700">100% ของกะ</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-[11px] text-slate-500">UPH รวมจริง</div>
                    <div className="text-lg font-bold text-emerald-800 font-mono-num">
                      {totalMetrics.targetUph}{' '}
                      <span className="text-xs text-slate-400 font-normal">
                        / {totalMetrics.maxJigUph}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono-num">
                      Load {totalMetrics.jigUtilizationPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <div className="text-[11px] text-slate-500">Plant Takt Time</div>
                    <div className="text-lg font-bold text-slate-900 font-mono-num">
                      {totalMetrics.taktTimeSec.toFixed(1)}s
                    </div>
                    <div className="text-[10px] text-slate-500">
                      CT คอขวด {kpiState.bottleneckCtSec.toFixed(1)}s
                    </div>
                  </div>
                </div>

                {/* Proportion Split Bar Line A vs Line B */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#0B4F8A]">
                      Line A: {lineAMetrics.qtyPlan.toLocaleString()} (
                      {lineAMetrics.sharePercent.toFixed(1)}%)
                    </span>
                    <span className="text-indigo-700">
                      Line B: {lineBMetrics.qtyPlan.toLocaleString()} (
                      {lineBMetrics.sharePercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-200">
                    <div
                      className="h-full bg-[#0B4F8A] transition-all duration-200"
                      style={{ width: `${lineAMetrics.sharePercent}%` }}
                      title={`Line A: ${lineAMetrics.sharePercent.toFixed(1)}%`}
                    />
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{ width: `${lineBMetrics.sharePercent}%` }}
                      title={`Line B: ${lineBMetrics.sharePercent.toFixed(1)}%`}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-emerald-200/80 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Action Plan ปัจจุบัน:</span>
                <span className={`font-bold ${totalAlert.textClass}`}>
                  {totalAlert.actionInstruction}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Comprehensive Comparison Table (ตารางเปรียบเทียบพารามิเตอร์ Line A vs Line B vs รวมทั้งโรงงาน) */}
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#083B66] mb-2.5 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0B4F8A]" />
              <span>
                1. ตารางสรุปเปรียบเทียบตัวชี้วัดวิศวกรรมอุตสาหการ (Line A vs Line B Executive Matrix)
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0B4F8A] text-white font-semibold">
                    <th className="py-2 px-3 text-left border border-slate-300">
                      ตัวชี้วัดสำคัญ (Engineering &amp; Production KPI)
                    </th>
                    <th className="py-2 px-3 text-right border border-slate-300 bg-[#0F528C]">
                      Sheet: Line A (JIG A)
                    </th>
                    <th className="py-2 px-3 text-right border border-slate-300 bg-indigo-900">
                      Sheet: Line B (JIG B)
                    </th>
                    <th className="py-2 px-3 text-right border border-slate-300 bg-emerald-800">
                      Summary รวมทั้ง 2 Line (A + B)
                    </th>
                    <th className="py-2 px-3 text-left border border-slate-300">
                      การวิเคราะห์และประเมินผลของวิศวกร IE
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      จำนวน JIG ติดตั้ง (เดินจริง / ทั้งหมด)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-semibold border border-slate-200">
                      {lineAMetrics.activeJigs} / {lineAMetrics.totalJigs} ตัว
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-semibold border border-slate-200">
                      {lineBMetrics.activeJigs} / {lineBMetrics.totalJigs} ตัว (Standby{' '}
                      {lineBMetrics.totalJigs - lineBMetrics.activeJigs})
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-slate-900 border border-slate-200">
                      {totalMetrics.activeJigs} / {totalMetrics.totalJigs} ตัว
                    </td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">
                      Line B มี JIG สำรอง 1 ตัว (รุ่น SBS620) พร้อมเปิดเดินช่วยกรณีฉุกเฉิน
                    </td>
                  </tr>

                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      กำลังการผลิตสูงสุดตาม JIG (Max Capacity)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num border border-slate-200">
                      {lineAMetrics.maxJigUph} UPH ({lineAMetrics.maxJigQty.toLocaleString()} เครื่อง)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num border border-slate-200">
                      {lineBMetrics.maxJigUph} UPH ({lineBMetrics.maxJigQty.toLocaleString()} เครื่อง)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-[#0B4F8A] border border-slate-200">
                      {totalMetrics.maxJigUph} UPH ({totalMetrics.maxJigQty.toLocaleString()} เครื่อง)
                    </td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">
                      คิดที่มาตรฐาน 1 JIG = {shiftConfig.standardUphPerJig} UPH ×{' '}
                      {shiftConfig.workingHours} ชม. (ที่มาของตัวเลข 114 UPH ในตาราง)
                    </td>
                  </tr>

                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      ยอดแผนการผลิตจริง (Q&apos;ty Plan) &amp; สัดส่วน
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-[#083B66] border border-slate-200">
                      {lineAMetrics.qtyPlan.toLocaleString()} เครื่อง (
                      {lineAMetrics.sharePercent.toFixed(1)}%)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-indigo-800 border border-slate-200">
                      {lineBMetrics.qtyPlan.toLocaleString()} เครื่อง (
                      {lineBMetrics.sharePercent.toFixed(1)}%)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-emerald-800 border border-slate-200">
                      {totalMetrics.qtyPlan.toLocaleString()} เครื่อง (100.0%)
                    </td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">
                      Line A รับโหลดสูงกว่า Line B อยู่{' '}
                      <span className="font-mono-num font-semibold">
                        {Math.abs(lineAMetrics.qtyPlan - lineBMetrics.qtyPlan).toLocaleString()}
                      </span>{' '}
                      เครื่อง ({Math.abs(lineAMetrics.sharePercent - lineBMetrics.sharePercent).toFixed(1)}%)
                    </td>
                  </tr>

                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      เป้าหมายการผลิตรายชั่วโมง (Target UPH จริง)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-[#0B4F8A] border border-slate-200">
                      {lineAMetrics.targetUph} UPH ({lineAMetrics.exactUph.toFixed(1)})
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-indigo-700 border border-slate-200">
                      {lineBMetrics.targetUph} UPH ({lineBMetrics.exactUph.toFixed(1)})
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-emerald-800 border border-slate-200">
                      {totalMetrics.targetUph} UPH ({totalMetrics.exactUph.toFixed(1)})
                    </td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">
                      ผลรวมเป้าหมายรายชั่วโมง = {lineAMetrics.targetUph} + {lineBMetrics.targetUph}{' '}
                      = {totalMetrics.targetUph} เครื่อง/ชม.
                    </td>
                  </tr>

                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      อัตราการใช้กำลัง JIG (% JIG Utilization)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-semibold border border-slate-200">
                      {lineAMetrics.jigUtilizationPercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-semibold border border-slate-200">
                      {lineBMetrics.jigUtilizationPercent.toFixed(1)}% (100% ของ Active JIG)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold border border-slate-200">
                      {totalMetrics.jigUtilizationPercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-slate-700 border border-slate-200">
                      Line A มี Buffer กำลังการผลิตเหลือ ~8.9% จากรุ่นล็อตเล็ก T520 และ BM29
                    </td>
                  </tr>

                  <tr className="even:bg-slate-50/70">
                    <td className="py-2 px-3 font-bold text-slate-800 border border-slate-200">
                      ผลงานสะสมจริง / แผนสะสม (ณ ชั่วโมงล่าสุด)
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold border border-slate-200">
                      {lineAMetrics.cumActualAtLatest !== null
                        ? `${lineAMetrics.cumActualAtLatest.toLocaleString()} / ${lineAMetrics.cumPlanAtLatest.toLocaleString()} (${lineAMetrics.achvPercentAtLatest?.toFixed(1)}%)`
                        : 'รอบันทึกผล'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold border border-slate-200">
                      {lineBMetrics.cumActualAtLatest !== null
                        ? `${lineBMetrics.cumActualAtLatest.toLocaleString()} / ${lineBMetrics.cumPlanAtLatest.toLocaleString()} (${lineBMetrics.achvPercentAtLatest?.toFixed(1)}%)`
                        : 'รอบันทึกผล'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-num font-bold text-slate-900 border border-slate-200">
                      {totalMetrics.cumActualAtLatest !== null
                        ? `${totalMetrics.cumActualAtLatest.toLocaleString()} / ${totalMetrics.cumPlanAtLatest.toLocaleString()} (${totalMetrics.achvPercentAtLatest?.toFixed(1)}%)`
                        : 'รอบันทึกผล'}
                    </td>
                    <td className="py-2 px-3 font-semibold border border-slate-200">
                      <span className={totalAlert.textClass}>
                        {totalAlert.badgeText} — {totalAlert.actionInstruction}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Hourly Side-by-Side Comparison (Line A vs Line B vs Combined) */}
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#083B66] mb-2.5 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-700" />
              <span>
                2. ตารางเปรียบเทียบแผนและผลผลิตรายชั่วโมงแยกตามสายการผลิต (Line A vs Line B Hourly Matrix)
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white font-semibold">
                    <th rowSpan={2} className="py-1.5 px-2 text-center border border-slate-600">
                      Hour
                    </th>
                    <th
                      colSpan={4}
                      className="py-1.5 px-2 text-center border border-slate-600 bg-[#0B4F8A]"
                    >
                      Line A (JIG A — เป้า {lineAMetrics.targetUph} UPH)
                    </th>
                    <th
                      colSpan={4}
                      className="py-1.5 px-2 text-center border border-slate-600 bg-indigo-900"
                    >
                      Line B (JIG B — เป้า {lineBMetrics.targetUph} UPH)
                    </th>
                    <th
                      colSpan={4}
                      className="py-1.5 px-2 text-center border border-slate-600 bg-emerald-800"
                    >
                      รวมทั้งโรงงาน (Total A+B — เป้า {totalMetrics.targetUph} UPH)
                    </th>
                  </tr>
                  <tr className="bg-slate-700 text-white font-semibold text-[11px]">
                    <th className="py-1 px-2 text-right border border-slate-600">Plan A</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Act A</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Cum.Act</th>
                    <th className="py-1 px-2 text-right border border-slate-600">%Achv</th>

                    <th className="py-1 px-2 text-right border border-slate-600">Plan B</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Act B</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Cum.Act</th>
                    <th className="py-1 px-2 text-right border border-slate-600">%Achv</th>

                    <th className="py-1 px-2 text-right border border-slate-600">Plan รวม</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Act รวม</th>
                    <th className="py-1 px-2 text-right border border-slate-600">Gap สะสม</th>
                    <th className="py-1 px-2 text-right border border-slate-600">%Achv รวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono-num">
                  {totalHourlyRows.map((totRow, idx) => {
                    const rowA = lineAHourlyRows[idx];
                    const rowB = lineBHourlyRows[idx];
                    return (
                      <tr key={`comp-${totRow.id}`} className="even:bg-slate-50/70 hover:bg-sky-50/50">
                        <td className="py-1 px-1.5 text-center font-bold text-slate-900 border border-slate-200">
                          {onUpdateHourLabel ? (
                            <input
                              type="text"
                              aria-label={`แก้ไขชื่อชั่วโมงที่ ${idx + 1}`}
                              value={totRow.label}
                              onChange={(e) => onUpdateHourLabel(idx, e.target.value)}
                              className="w-24 sm:w-28 px-1 py-0.5 text-center font-mono-num font-bold text-slate-900 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-[#0B4F8A] rounded focus:outline-none"
                            />
                          ) : (
                            totRow.label
                          )}
                        </td>

                        {/* Line A */}
                        <td className="py-1 px-2 text-right text-slate-600 border border-slate-200 bg-sky-50/20">
                          {rowA?.plan ?? 0}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-slate-900 border border-slate-200 bg-sky-50/20">
                          {rowA?.actual ?? '-'}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border border-slate-200 bg-sky-50/20">
                          {rowA?.cumActual ?? '-'}
                        </td>
                        <td
                          className={`py-1 px-2 text-right font-bold border border-slate-200 bg-sky-50/20 ${
                            rowA?.achvPercent != null && rowA.achvPercent < 95
                              ? 'text-red-600'
                              : 'text-[#0B4F8A]'
                          }`}
                        >
                          {rowA?.achvPercent != null ? `${rowA.achvPercent.toFixed(1)}%` : '-'}
                        </td>

                        {/* Line B */}
                        <td className="py-1 px-2 text-right text-slate-600 border border-slate-200 bg-indigo-50/20">
                          {rowB?.plan ?? 0}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-slate-900 border border-slate-200 bg-indigo-50/20">
                          {rowB?.actual ?? '-'}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border border-slate-200 bg-indigo-50/20">
                          {rowB?.cumActual ?? '-'}
                        </td>
                        <td
                          className={`py-1 px-2 text-right font-bold border border-slate-200 bg-indigo-50/20 ${
                            rowB?.achvPercent != null && rowB.achvPercent < 95
                              ? 'text-red-600'
                              : 'text-indigo-700'
                          }`}
                        >
                          {rowB?.achvPercent != null ? `${rowB.achvPercent.toFixed(1)}%` : '-'}
                        </td>

                        {/* Combined Total */}
                        <td className="py-1 px-2 text-right font-semibold text-slate-800 border border-slate-200 bg-emerald-50/20">
                          {totRow.plan}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-slate-900 border border-slate-200 bg-emerald-50/20">
                          {totRow.actual ?? '-'}
                        </td>
                        <td
                          className={`py-1 px-2 text-right font-bold border border-slate-200 bg-emerald-50/20 ${
                            totRow.gap != null && totRow.gap < 0
                              ? 'text-red-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {totRow.gap != null
                            ? totRow.gap > 0
                              ? `+${totRow.gap}`
                              : totRow.gap
                            : '-'}
                        </td>
                        <td
                          className={`py-1 px-2 text-right font-bold border border-slate-200 bg-emerald-50/20 ${
                            totRow.achvPercent != null && totRow.achvPercent < 95
                              ? 'text-red-600'
                              : 'text-emerald-800'
                          }`}
                        >
                          {totRow.achvPercent != null ? `${totRow.achvPercent.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Analytical Executive Insights for Factory Manager (บทสรุปวิเคราะห์ 4 มิติส่งผู้จัดการโรงงาน) */}
          <div className="space-y-3">
            <h3 className="text-sm sm:text-base font-bold text-[#083B66] flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>
                3. บทสรุปวิเคราะห์เชิงลึกและข้อเสนอแนะเชิงกลยุทธ์เสนอผู้จัดการโรงงาน (IE Analytical Summary)
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Analysis 1: Capacity & Discrepancy Analysis */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="font-bold text-sm text-[#083B66] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#0B4F8A]" />
                  <span>
                    3.1 วิเคราะห์สมดุลกำลังการผลิต (Line A vs Line B Capacity Balance)
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>สัดส่วนภาระงาน:</strong> Line A รับแผนผลิต{' '}
                  <strong className="font-mono-num">
                    {lineAMetrics.qtyPlan.toLocaleString()} เครื่อง ({lineAMetrics.sharePercent.toFixed(1)}%)
                  </strong>{' '}
                  จาก JIG A {lineAMetrics.totalJigs} ตัว (5 รุ่น) ในขณะที่ Line B รับแผนผลิต{' '}
                  <strong className="font-mono-num">
                    {lineBMetrics.qtyPlan.toLocaleString()} เครื่อง ({lineBMetrics.sharePercent.toFixed(1)}%)
                  </strong>{' '}
                  จาก JIG B ที่เดินจริง {lineBMetrics.activeJigs} ตัว (3 รุ่น)
                </p>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>ที่มาของส่วนต่าง 114 UPH vs {totalMetrics.targetUph} UPH:</strong>{' '}
                  กำลังการผลิตตามจำนวน JIG รวม {totalMetrics.totalJigs} ตัว คิดเป็น{' '}
                  <strong className="font-mono-num">{totalMetrics.maxJigUph} UPH</strong> แต่แผนผลิตจริงใช้กำลังผลิตที่{' '}
                  <strong className="font-mono-num">
                    {totalMetrics.targetUph} UPH ({totalMetrics.jigUtilizationPercent.toFixed(1)}%)
                  </strong>{' '}
                  เนื่องจาก Line B กัน JIG สำรอง 1 ตัว (SBS620 = 6 UPH) และ Line A มีรุ่นล็อตเล็ก
                  T520 (49 เครื่อง) และ BM29 (20 เครื่อง) ที่เดินไม่เต็มกะ
                </p>
              </div>

              {/* Analysis 2: Core Volume & Bottleneck Risk */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="font-bold text-sm text-red-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>
                    3.2 จุดเสี่ยงวิกฤตที่ต้องควบคุมพิเศษ (Critical Model &amp; Bottleneck Risk)
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>ความเสี่ยงรุ่นหลัก (Main Volume 47%):</strong> รุ่น{' '}
                  <strong>TM19 (Line A: 253 เครื่อง)</strong> และ{' '}
                  <strong>TM21 (Line B: 253 เครื่อง)</strong> รวมกัน 506 เครื่อง คิดเป็นเกือบครึ่งหนึ่งของเป้าหมายทั้งโรงงาน หากเกิด Line Stop บน JIG กลุ่มนี้เกิน 5 นาที จะทำให้ยอดรวมตกทันที 4 UPH ต่อสาย
                </p>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>ความเสี่ยงจากการเปลี่ยนรุ่นบน Line A:</strong> Line A มีจำนวนรุ่นถึง{' '}
                  {lineAMetrics.activeModelsCount} รุ่น (รวมเวลาสูญเสีย Changeover ประมาณ{' '}
                  <strong className="font-mono-num">{lineAMetrics.totalChangeoverMin} นาที</strong>)
                  สูงกว่า Line B ที่เดินเพียง 3 รุ่นหลัก จึงต้องจัดชุด Pre-kitting ชิ้นส่วนรอหน้าไลน์ล่วงหน้า 1 ชั่วโมง
                </p>
              </div>

              {/* Analysis 3: IE Productivity Improvement Proposal */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                <div className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>
                    3.3 ข้อเสนอแนะการเพิ่มผลผลิตและลดสูญเสีย (IE Kaizen &amp; Optimization)
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>รวบคิวผลิตล็อตเล็กบน Line A:</strong> รุ่น T520 (49 เครื่อง) + BM29 (20
                  เครื่อง) รวมกันเพียง 69 เครื่อง (ต้องการเพียง 6.6 UPH) แนะนำให้จัดเดินต่อคิวกันบน
                  JIG A ชุดเดียวกันในช่วงต้นกะ (H1–H3) เพื่อปลด JIG A 1 ตัวมาเสริมรุ่น BM23 หรือ
                  TM19 ได้เพิ่มอีก <strong>+45 ถึง +60 เครื่อง/กะ</strong>
                </p>
                <p className="text-slate-700 leading-relaxed">
                  • <strong>แผนใช้ JIG สำรองบน Line B (Recovery Buffer):</strong> กรณี Line B
                  มียอดสะสมต่ำกว่าแผนเกิน 10% สามารถปรับ JIG B ของรุ่น SBS620 (Standby 1 ตัว)
                  มาช่วยเดินรุ่น SBS550 หรือ TM14 จะช่วยเพิ่มอัตราการผลิตได้ทันที{' '}
                  <strong>+6 UPH (+63 เครื่อง/กะ)</strong> โดยไม่ต้องเปิด OT
                </p>
              </div>

              {/* Analysis 4: Manager Directive & Approval Box */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2">
                <div className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>
                    3.4 ข้อสั่งการและการอนุมัติแผนสำหรับผู้จัดการโรงงาน (Manager Directive)
                  </span>
                </div>
                <label htmlFor="manager-directive-note" className="block text-[11px] text-slate-600">
                  บันทึกข้อสั่งการเพิ่มเติมของผู้จัดการโรงงาน (จะถูกรวมในข้อความรายงานเมื่อกดคัดลอก/พิมพ์):
                </label>
                <textarea
                  id="manager-directive-note"
                  rows={3}
                  value={managerCustomNote}
                  onChange={(e) => setManagerCustomNote(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-amber-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
