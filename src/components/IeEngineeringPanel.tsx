import React, { useState } from 'react';
import {
  Calculator,
  Clock,
  Layers,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  Wrench,
  Cpu,
} from 'lucide-react';
import {
  FormulaCalculationMode,
  ModelPlanItem,
  ProductionKpiState,
} from '../types/production';
import { calculateModelFormulaBreakdown, isModelInLine } from '../data/defaultPlan';

interface IeEngineeringPanelProps {
  models: ModelPlanItem[];
  workingHours: number;
  standardUphPerJig: number;
  formulaMode: FormulaCalculationMode;
  totalQty: number;
  actualUph: number;
  kpiState: ProductionKpiState;
  onUpdateWorkingHours: (hours: number) => void;
  onUpdateStandardUphPerJig: (uphPerJig: number) => void;
  onUpdateFormulaMode: (mode: FormulaCalculationMode) => void;
  onChangeModelJig: (id: string, jigA: number, jigB: number) => void;
  onChangeModelQty: (id: string, qtyPlan: number) => void;
  onChangeModelUph: (id: string, uph: number) => void;
  onUpdateModel: (id: string, patch: Partial<ModelPlanItem>) => void;
  onAddModel: (item: Omit<ModelPlanItem, 'id'>) => void;
  onDeleteModel: (id: string) => void;
  onUpdateKpi: (patch: Partial<ProductionKpiState>) => void;
  onRecalculateAllFromJig: () => void;
  onAutoAssignJigsFromQty: () => void;
}

const PRESET_COLORS = [
  '#1D63D8',
  '#16A34A',
  '#F59E0B',
  '#9333EA',
  '#14B8A6',
  '#EF4444',
  '#0EA5E9',
  '#64748B',
];

export const IeEngineeringPanel: React.FC<IeEngineeringPanelProps> = ({
  models,
  workingHours,
  standardUphPerJig,
  formulaMode,
  totalQty,
  actualUph,
  kpiState,
  onUpdateWorkingHours,
  onUpdateStandardUphPerJig,
  onUpdateFormulaMode,
  onChangeModelJig,
  onChangeModelQty,
  onChangeModelUph,
  onUpdateModel,
  onAddModel,
  onDeleteModel,
  onUpdateKpi,
  onRecalculateAllFromJig,
  onAutoAssignJigsFromQty,
}) => {
  const [lineFilter, setLineFilter] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [newModelName, setNewModelName] = useState('');
  const [newLineTarget, setNewLineTarget] = useState<'A' | 'B'>('A');
  const [newGroupKey, setNewGroupKey] = useState('');
  const [newJigA, setNewJigA] = useState(1);
  const [newJigB, setNewJigB] = useState(0);
  const [newQtyPlan, setNewQtyPlan] = useState(63);
  const [newCycleTime, setNewCycleTime] = useState(34.5);
  const [newChangeover, setNewChangeover] = useState(10);
  const [newFocusNote, setNewFocusNote] = useState('ควบคุม Takt Time และตรวจสอบชิ้นส่วนก่อนเข้า JIG');
  const [newDefectWatch, setNewDefectWatch] = useState('ตรวจสอบการประกอบและแรงบิดสกรูมาตรฐาน');

  const filteredModels = models.filter((m) => {
    if (lineFilter === 'A') return isModelInLine(m, 'A');
    if (lineFilter === 'B') return isModelInLine(m, 'B');
    return true;
  });

  const taktTimeSec = totalQty > 0 ? (workingHours * 3600) / totalQty : 0;
  const totalJigA = models.reduce((s, m) => s + (Number(m.jigA) || 0), 0);
  const totalJigB = models.reduce((s, m) => s + (Number(m.jigB) || 0), 0);
  const totalAllJigs = totalJigA + totalJigB;
  const maxLineUphByJig = totalAllJigs * standardUphPerJig;
  const maxLineQtyByJig = Math.round(maxLineUphByJig * workingHours);

  const totalChangeoverMin = models
    .filter((m) => m.qtyPlan > 0)
    .reduce((acc, m) => acc + m.changeoverMin, 0);
  const netOperatingHours = Math.max(0.5, workingHours - totalChangeoverMin / 60);
  const effectiveUphNeeded = totalQty > 0 ? Math.ceil(totalQty / netOperatingHours) : 0;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newModelName.trim();
    if (!trimmed) return;
    const jA = Math.max(0, Number(newJigA) || 0);
    const jB = Math.max(0, Number(newJigB) || 0);
    const totalJig = jA + jB;
    const computedUph =
      formulaMode === 'jig_drives_qty'
        ? Math.round(totalJig * standardUphPerJig)
        : workingHours > 0
        ? Math.round((Number(newQtyPlan) || 0) / workingHours)
        : 0;
    const computedQty =
      formulaMode === 'jig_drives_qty'
        ? Math.round(computedUph * workingHours)
        : Number(newQtyPlan) || 0;

    const lineAssign: 'A' | 'B' | 'BOTH' =
      jA > 0 && jB > 0 ? 'BOTH' : jB > 0 ? 'B' : 'A';

    onAddModel({
      modelName: trimmed,
      lineAssignment: lineAssign,
      groupKey: newGroupKey.trim() || undefined,
      jigA: jA,
      jigB: jB,
      qtyPlan: computedQty,
      uph: computedUph,
      utilizationPercent: computedQty > 0 ? 100 : 0,
      cycleTimeSec: Number(newCycleTime) || 34.0,
      changeoverMin: Number(newChangeover) || 10,
      processFocusNote: newFocusNote.trim() || 'ควบคุมมาตรฐานการทำงานหน้าไลน์',
      defectWatch: newDefectWatch.trim() || 'ตรวจสอบคุณภาพชิ้นงาน 100%',
      color: PRESET_COLORS[models.length % PRESET_COLORS.length],
      highlightZero: computedQty === 0,
    });
    setNewModelName('');
    setNewGroupKey('');
  };

  return (
    <div className="space-y-5">
      {/* Formula Master Control Card */}
      <div className="bg-white rounded-xl border border-slate-300 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#083B66] flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#0B4F8A]" />
              <span>
                ระบบผูกสูตรคำนวณ JIG · Q&apos;ty Plan · UPH · ชั่วโมงการผลิต (IE Formula Engine)
              </span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              เลือกสมการหลักในการคำนวณ เมื่อปรับค่าพารามิเตอร์ตัวใดตัวหนึ่ง ระบบจะคำนวณค่าที่เหลือและปรับตารางรายชั่วโมงให้อัตโนมัติ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRecalculateAllFromJig}
              className="px-3 py-2 text-xs font-semibold text-white bg-[#0B4F8A] hover:bg-[#083B66] rounded-lg transition-colors whitespace-nowrap"
            >
              คำนวณ Q&apos;ty &amp; UPH จากจำนวน JIG ทั้งหมด
            </button>
            <button
              type="button"
              onClick={onAutoAssignJigsFromQty}
              className="px-3 py-2 text-xs font-semibold text-[#0B4F8A] bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-lg transition-colors whitespace-nowrap"
            >
              คำนวณจำนวน JIG แนะนำจาก Q&apos;ty Plan
            </button>
          </div>
        </div>

        {/* 3 Formula Mode Selector Buttons + Global Parameters */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onUpdateFormulaMode('qty_drives_uph')}
              className={`p-3 rounded-xl border text-left transition-all ${
                formulaMode === 'qty_drives_uph'
                  ? 'bg-sky-50 border-[#0B4F8A] ring-2 ring-[#0B4F8A]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="text-xs font-bold text-[#083B66]">
                สูตรที่ 1: ยึด Q&apos;ty Plan เป็นหลัก
              </div>
              <div className="mt-1 font-mono-num text-xs font-semibold text-[#0B4F8A]">
                UPH = Q&apos;ty Plan ÷ ชม.ผลิต
              </div>
              <div className="mt-0.5 font-mono-num text-[11px] text-slate-600">
                JIG แนะนำ = ceil(UPH ÷ {standardUphPerJig})
              </div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateFormulaMode('jig_drives_qty')}
              className={`p-3 rounded-xl border text-left transition-all ${
                formulaMode === 'jig_drives_qty'
                  ? 'bg-sky-50 border-[#0B4F8A] ring-2 ring-[#0B4F8A]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="text-xs font-bold text-[#083B66]">
                สูตรที่ 2: ยึดจำนวน JIG เป็นหลัก
              </div>
              <div className="mt-1 font-mono-num text-xs font-semibold text-emerald-700">
                UPH = (JIG A+B) × {standardUphPerJig} × %Load
              </div>
              <div className="mt-0.5 font-mono-num text-[11px] text-slate-600">
                Q&apos;ty Plan = UPH × {workingHours} ชม.
              </div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateFormulaMode('uph_drives_qty')}
              className={`p-3 rounded-xl border text-left transition-all ${
                formulaMode === 'uph_drives_qty'
                  ? 'bg-sky-50 border-[#0B4F8A] ring-2 ring-[#0B4F8A]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="text-xs font-bold text-[#083B66]">
                สูตรที่ 3: ยึดเป้าหมาย UPH เป็นหลัก
              </div>
              <div className="mt-1 font-mono-num text-xs font-semibold text-purple-700">
                Q&apos;ty Plan = UPH × {workingHours} ชม.
              </div>
              <div className="mt-0.5 font-mono-num text-[11px] text-slate-600">
                JIG ที่ต้องใช้ = ceil(UPH ÷ {standardUphPerJig})
              </div>
            </button>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label
                htmlFor="matrix-working-hours"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                ชั่วโมงการผลิต (ชม./กะ)
              </label>
              <input
                id="matrix-working-hours"
                type="number"
                step="0.5"
                min="1"
                max="24"
                value={workingHours}
                onChange={(e) =>
                  onUpdateWorkingHours(Math.max(1, Math.min(24, Number(e.target.value))))
                }
                className="w-full px-2.5 py-1.5 text-sm font-bold font-mono-num bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                ปรับชั่วโมงแล้วตาราง H1..Hn อัปเดตทันที
              </span>
            </div>

            <div>
              <label
                htmlFor="matrix-uph-per-jig"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Capacity ต่อ 1 JIG (UPH)
              </label>
              <input
                id="matrix-uph-per-jig"
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={standardUphPerJig}
                onChange={(e) =>
                  onUpdateStandardUphPerJig(Math.max(0.5, Number(e.target.value)))
                }
                className="w-full px-2.5 py-1.5 text-sm font-bold font-mono-num bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                มาตรฐาน: 1 JIG = {standardUphPerJig} เครื่อง/ชม.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top IE Engineering Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>กำลังการผลิตสูงสุดตาม JIG</span>
            <Layers className="w-4 h-4 text-[#0B4F8A]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#0B4F8A] font-mono-num">
              {maxLineUphByJig} UPH
            </span>
            <span className="text-xs text-slate-600 font-mono-num">
              ({totalAllJigs} JIG × {standardUphPerJig})
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ผลิตเต็ม 100% ได้สูงสุด {maxLineQtyByJig.toLocaleString()} เครื่อง / {workingHours} ชม.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Takt Time เป้าหมาย (ทั้งไลน์)</span>
            <Clock className="w-4 h-4 text-[#0B4F8A]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#0B4F8A] font-mono-num">
              {taktTimeSec.toFixed(2)}
            </span>
            <span className="text-xs text-slate-600">วินาที / เครื่อง</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            คำนวณจาก ({workingHours} ชม. × 3,600) ÷ {totalQty.toLocaleString()} เครื่อง
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Bottleneck CT เทียบ Takt Time</span>
            <Sliders className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono-num ${
                kpiState.bottleneckCtSec <= taktTimeSec ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {kpiState.bottleneckCtSec.toFixed(1)}
            </span>
            <span className="text-xs text-slate-600">วินาที (CT คอขวด)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {kpiState.bottleneckCtSec <= taktTimeSec
              ? 'ผ่านเกณฑ์ (≤ Takt Time ไม่เกิดงานค้างสะสม)'
              : `เกิน Takt Time อยู่ ${(kpiState.bottleneckCtSec - taktTimeSec).toFixed(2)} วินาที!`}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>สูญเสียเวลาเปลี่ยนรุ่น (Changeover)</span>
            <Calculator className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-700 font-mono-num">
              {totalChangeoverMin}
            </span>
            <span className="text-xs text-slate-600">
              นาที ({models.filter((m) => m.qtyPlan > 0).length} รุ่นที่เดินผลิต)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            เวลาเดินเครื่องสุทธิ {netOperatingHours.toFixed(2)} ชม. (ต้องเร่งสปีดจริง {effectiveUphNeeded} UPH)
          </p>
        </div>
      </div>

      {/* Detailed Model Table with Linked JIG, Q'ty Plan, UPH, and Working Hours */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              ตารางผูกสูตรคำนวณรายรุ่น (แก้ไข / เพิ่ม / ลบ Model ได้ทั้ง Line A และ Line B)
            </h3>
            <p className="text-xs text-slate-600">
              แก้ไขชื่อ Model, สายการผลิต (Line A / Line B), JIG A, JIG B, Q&apos;ty Plan หรือ UPH ได้ทันที ระบบจะคำนวณตัวแปรที่เกี่ยวข้องตามชั่วโมงการผลิต ({workingHours} ชม.)
            </p>
          </div>

          <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start">
            <button
              type="button"
              onClick={() => setLineFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                lineFilter === 'ALL'
                  ? 'bg-[#0B4F8A] text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              ทั้งหมด A+B ({models.length} รุ่น)
            </button>
            <button
              type="button"
              onClick={() => {
                setLineFilter('A');
                setNewLineTarget('A');
                setNewJigA(1);
                setNewJigB(0);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                lineFilter === 'A'
                  ? 'bg-[#0B4F8A] text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              เฉพาะ Line A ({models.filter((m) => isModelInLine(m, 'A')).length} รุ่น)
            </button>
            <button
              type="button"
              onClick={() => {
                setLineFilter('B');
                setNewLineTarget('B');
                setNewJigA(0);
                setNewJigB(1);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                lineFilter === 'B'
                  ? 'bg-indigo-700 text-white'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              เฉพาะ Line B ({models.filter((m) => isModelInLine(m, 'B')).length} รุ่น)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[#0B4F8A] text-white font-semibold">
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-2 text-center">Line</th>
                <th className="py-2.5 px-2 text-center">JIG A</th>
                <th className="py-2.5 px-2 text-center">JIG B</th>
                <th className="py-2.5 px-2 text-center">รวม JIG (แนะนำ)</th>
                <th className="py-2.5 px-2 text-right">
                  Max Cap ({standardUphPerJig}/JIG)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Q&apos;ty Plan ({workingHours} ชม.)
                </th>
                <th className="py-2.5 px-2 text-right">UPH (ปัดเศษ / จริง)</th>
                <th className="py-2.5 px-2 text-right">% JIG Load</th>
                <th className="py-2.5 px-2 text-right">CT (วินาที)</th>
                <th className="py-2.5 px-3">จุดโฟกัสกระบวนการ / จุดเสี่ยงคุณภาพ</th>
                <th className="py-2.5 px-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredModels.map((m) => {
                const f = calculateModelFormulaBreakdown(m, workingHours, standardUphPerJig);
                const isCtWarning = m.cycleTimeSec > taktTimeSec && m.qtyPlan > 0;
                const currentLineBadge =
                  m.jigA > 0 && m.jigB > 0
                    ? 'BOTH'
                    : isModelInLine(m, 'B') && !isModelInLine(m, 'A')
                    ? 'B'
                    : 'A';

                return (
                  <tr
                    key={m.id}
                    className={`${
                      m.qtyPlan === 0 ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                    } transition-colors`}
                  >
                    <td className="py-2 px-3 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: m.color }}
                        />
                        <input
                          type="text"
                          aria-label={`ชื่อรุ่น ${m.modelName}`}
                          value={m.modelName}
                          onChange={(e) => onUpdateModel(m.id, { modelName: e.target.value })}
                          className="w-24 px-1.5 py-1 border border-slate-300 rounded font-bold text-slate-900 bg-white focus:border-[#0B4F8A] focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <select
                        aria-label={`สายการผลิตของรุ่น ${m.modelName}`}
                        value={currentLineBadge}
                        onChange={(e) => {
                          const target = e.target.value as 'A' | 'B' | 'BOTH';
                          const totalJ = Math.max(1, m.jigA + m.jigB);
                          if (target === 'A') {
                            onUpdateModel(m.id, {
                              lineAssignment: 'A',
                              jigA: m.jigA > 0 ? m.jigA : totalJ,
                              jigB: 0,
                            });
                          } else if (target === 'B') {
                            onUpdateModel(m.id, {
                              lineAssignment: 'B',
                              jigA: 0,
                              jigB: m.jigB > 0 ? m.jigB : totalJ,
                            });
                          } else {
                            onUpdateModel(m.id, {
                              lineAssignment: 'BOTH',
                              jigA: Math.max(1, m.jigA),
                              jigB: Math.max(1, m.jigB),
                            });
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs font-bold border ${
                          currentLineBadge === 'B'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : currentLineBadge === 'BOTH'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-sky-50 text-[#0B4F8A] border-sky-200'
                        }`}
                      >
                        <option value="A">Line A</option>
                        <option value="B">Line B</option>
                        <option value="BOTH">A + B</option>
                      </select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        aria-label={`JIG A ของรุ่น ${m.modelName}`}
                        min="0"
                        value={m.jigA}
                        onChange={(e) =>
                          onChangeModelJig(m.id, Math.max(0, Number(e.target.value)), m.jigB)
                        }
                        className="w-14 px-1.5 py-1 text-center border border-slate-300 rounded font-mono-num font-bold bg-white"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        aria-label={`JIG B ของรุ่น ${m.modelName}`}
                        min="0"
                        value={m.jigB}
                        onChange={(e) =>
                          onChangeModelJig(m.id, m.jigA, Math.max(0, Number(e.target.value)))
                        }
                        className="w-14 px-1.5 py-1 text-center border border-slate-300 rounded font-mono-num font-bold bg-white"
                      />
                    </td>
                    <td className="py-2 px-2 text-center font-mono-num">
                      <span className="font-bold text-slate-900">{f.totalJig}</span>{' '}
                      <span className="text-slate-500 text-[11px]">
                        (แนะนำ {f.recommendedJigCount})
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono-num text-slate-600">
                      <div>{f.maxJigUphCapacity} UPH</div>
                      <div className="text-[10px] text-slate-400">
                        ({Math.round(f.maxJigShiftQty)} เครื่อง)
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        aria-label={`ยอดแผนผลิต Q'ty Plan ของรุ่น ${m.modelName}`}
                        min="0"
                        value={m.qtyPlan}
                        onChange={(e) =>
                          onChangeModelQty(m.id, Math.max(0, Number(e.target.value)))
                        }
                        className="w-20 px-2 py-1 text-right border border-sky-400 rounded font-bold font-mono-num bg-white text-[#083B66]"
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-mono-num">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          aria-label={`UPH ของรุ่น ${m.modelName}`}
                          min="0"
                          value={m.uph}
                          onChange={(e) =>
                            onChangeModelUph(m.id, Math.max(0, Number(e.target.value)))
                          }
                          className="w-14 px-1.5 py-1 text-right border border-slate-300 rounded font-bold text-[#0B4F8A] bg-white"
                        />
                        <span className="text-[11px] text-slate-500">
                          ({f.exactUphFromQty.toFixed(1)})
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono-num">
                      <span
                        className={`font-bold ${
                          f.isOverCapacity
                            ? 'text-red-600'
                            : f.actualJigUtilizationPercent === 0
                            ? 'text-slate-400'
                            : 'text-emerald-700'
                        }`}
                      >
                        {f.actualJigUtilizationPercent.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          aria-label={`Cycle Time ของรุ่น ${m.modelName}`}
                          step="0.1"
                          min="1"
                          value={m.cycleTimeSec}
                          onChange={(e) =>
                            onUpdateModel(m.id, {
                              cycleTimeSec: Math.max(1, Number(e.target.value)),
                            })
                          }
                          className={`w-14 px-1.5 py-1 text-right border rounded font-mono-num bg-white ${
                            isCtWarning
                              ? 'border-amber-500 text-amber-800 font-bold'
                              : 'border-slate-200'
                          }`}
                        />
                        {isCtWarning && (
                          <span title="Cycle Time สูงกว่า Takt Time เฉลี่ย">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 min-w-[230px]">
                      <input
                        type="text"
                        aria-label={`จุดโฟกัสกระบวนการของรุ่น ${m.modelName}`}
                        value={m.processFocusNote}
                        onChange={(e) =>
                          onUpdateModel(m.id, { processFocusNote: e.target.value })
                        }
                        className="w-full px-2 py-1 border border-slate-200 rounded text-slate-800 bg-white mb-1"
                        placeholder="จุดโฟกัสกระบวนการ..."
                      />
                      <input
                        type="text"
                        aria-label={`จุดเฝ้าระวังคุณภาพของรุ่น ${m.modelName}`}
                        value={m.defectWatch}
                        onChange={(e) => onUpdateModel(m.id, { defectWatch: e.target.value })}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-slate-500 bg-slate-50 text-[11px]"
                        placeholder="จุดเฝ้าระวังคุณภาพ..."
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteModel(m.id)}
                        disabled={models.length <= 1}
                        aria-label={`ลบรุ่น ${m.modelName}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Model Form */}
        <form
          onSubmit={handleAddSubmit}
          className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="new-model-name" className="block text-xs font-semibold text-slate-700 mb-1">
              เพิ่มรุ่นใหม่ (Model)
            </label>
            <input
              id="new-model-name"
              type="text"
              placeholder="เช่น TM25"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold"
            />
          </div>
          <div>
            <label htmlFor="new-line-target" className="block text-xs font-semibold text-slate-700 mb-1">
              เลือก Line
            </label>
            <select
              id="new-line-target"
              value={newLineTarget}
              onChange={(e) => {
                const target = e.target.value as 'A' | 'B';
                setNewLineTarget(target);
                const totalJ = Math.max(1, newJigA + newJigB);
                if (target === 'A') {
                  setNewJigA(totalJ);
                  setNewJigB(0);
                } else {
                  setNewJigA(0);
                  setNewJigB(totalJ);
                }
              }}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-[#083B66]"
            >
              <option value="A">Line A (JIG A)</option>
              <option value="B">Line B (JIG B)</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-group-key" className="block text-xs font-semibold text-slate-700 mb-1">
              กลุ่มร่วม (ถ้ามี)
            </label>
            <input
              id="new-group-key"
              type="text"
              placeholder="เช่น TM19 + TM21"
              value={newGroupKey}
              onChange={(e) => setNewGroupKey(e.target.value)}
              className="w-32 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="new-jig-a" className="block text-xs font-semibold text-slate-700 mb-1">
              JIG A
            </label>
            <input
              id="new-jig-a"
              type="number"
              min="0"
              value={newJigA}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                setNewJigA(v);
                if (v > 0 && newJigB === 0) setNewLineTarget('A');
                setNewQtyPlan(Math.round((v + newJigB) * standardUphPerJig * workingHours));
              }}
              className="w-16 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="new-jig-b" className="block text-xs font-semibold text-slate-700 mb-1">
              JIG B
            </label>
            <input
              id="new-jig-b"
              type="number"
              min="0"
              value={newJigB}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                setNewJigB(v);
                if (v > 0 && newJigA === 0) setNewLineTarget('B');
                setNewQtyPlan(Math.round((newJigA + v) * standardUphPerJig * workingHours));
              }}
              className="w-16 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="new-qty-plan" className="block text-xs font-semibold text-slate-700 mb-1">
              Q&apos;ty Plan (ผูกสูตรอัตโนมัติ)
            </label>
            <input
              id="new-qty-plan"
              type="number"
              min="0"
              value={newQtyPlan}
              onChange={(e) => setNewQtyPlan(Number(e.target.value))}
              className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-num font-bold"
            />
          </div>
          <div>
            <label htmlFor="new-ct" className="block text-xs font-semibold text-slate-700 mb-1">
              CT (วินาที)
            </label>
            <input
              id="new-ct"
              type="number"
              step="0.1"
              min="1"
              value={newCycleTime}
              onChange={(e) => setNewCycleTime(Number(e.target.value))}
              className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="new-focus-note" className="block text-xs font-semibold text-slate-700 mb-1">
              จุดโฟกัสกระบวนการ (IE Focus)
            </label>
            <input
              id="new-focus-note"
              type="text"
              value={newFocusNote}
              onChange={(e) => setNewFocusNote(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0B4F8A] hover:bg-[#083B66] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มรุ่นในแผน</span>
          </button>
        </form>
      </div>

      {/* Live KPI Parameter Adjuster for Production Meeting */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#0B4F8A]" />
          <span>ปรับค่าพารามิเตอร์หน้างานจริง (Live Shopfloor KPI Inputs)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div>
            <label
              htmlFor="kpi-linestop"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Line Stop &gt; 5 min (%) — เป้า &lt; 5%
            </label>
            <input
              id="kpi-linestop"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={kpiState.lineStopPercent}
              onChange={(e) =>
                onUpdateKpi({ lineStopPercent: Math.max(0, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
            />
          </div>

          <div>
            <label
              htmlFor="kpi-attendance"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Manpower Attendance (%) — เป้า 100%
            </label>
            <input
              id="kpi-attendance"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={kpiState.manpowerAttendancePercent}
              onChange={(e) =>
                onUpdateKpi({
                  manpowerAttendancePercent: Math.min(100, Math.max(0, Number(e.target.value))),
                })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
            />
          </div>

          <div>
            <label
              htmlFor="kpi-bottleneck"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Bottleneck Cycle Time (วินาที) — เป้า ≤ {taktTimeSec.toFixed(1)}s
            </label>
            <input
              id="kpi-bottleneck"
              type="number"
              step="0.1"
              min="1"
              value={kpiState.bottleneckCtSec}
              onChange={(e) =>
                onUpdateKpi({ bottleneckCtSec: Math.max(1, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
            />
          </div>

          <div>
            <label
              htmlFor="kpi-wip"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              WIP Before Bottleneck (เครื่อง) — เป้า ≥ {actualUph}
            </label>
            <input
              id="kpi-wip"
              type="number"
              step="1"
              min="0"
              value={kpiState.wipBufferUnits}
              onChange={(e) =>
                onUpdateKpi({ wipBufferUnits: Math.max(0, Number(e.target.value)) })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
            />
          </div>
        </div>
      </div>

      {/* IE Line Balancing & Sequence Recommendations */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>คำแนะนำการจัดลำดับการผลิตและบาลานซ์ไลน์ (IE Sequence &amp; Line Balancing Advisor)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-xs">
          <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200">
            <div className="font-bold text-[#0B4F8A]">
              1. ล็อคสปีดรุ่นหลัก (Main Volume Lock)
            </div>
            <p className="text-slate-700 mt-1 leading-relaxed">
              รุ่นหลักที่มีสัดส่วนสูงสุด (เช่น TM19 + TM21 คิดเป็น 47% หรือ 506 เครื่อง) ต้องจัดเดินคู่ขนานทั้ง JIG A (4 ตัว) และ JIG B (4 ตัว) ต่อเนื่องตลอดกะ ห้ามสลับ JIG เพื่อลด Setup Loss
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="font-bold text-emerald-900">
              2. การจัดตารางรุ่นรอง (Secondary Base Load)
            </div>
            <p className="text-slate-700 mt-1 leading-relaxed">
              รุ่นอันดับ 2 (BM23 = 189 เครื่อง, 17.5%) และรุ่นขนาดกลาง (SBS550, TM14 = 126 เครื่อง) ให้จัดเตรียมชุด Kit ชิ้นส่วนล่วงหน้า 1 ชั่วโมง ({actualUph} ชิ้น) หน้าสถานีคอขวดเสมอ
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200">
            <div className="font-bold text-amber-900">
              3. การจัดการล็อตเล็ก (Small-Lot Changeover)
            </div>
            <p className="text-slate-700 mt-1 leading-relaxed">
              รุ่นล็อตเล็ก เช่น T520 (49 เครื่อง, 4.5%) และ BM29 (20 เครื่อง, 1.9%) ควรจัดผลิตในช่วงต้นกะ (H1–H2) หรือช่วงรอยต่อพักเบรก เพื่อใช้เวลาเตรียมเปลี่ยน JIG โดยไม่เสียชั่วโมงทำงานหลัก
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
