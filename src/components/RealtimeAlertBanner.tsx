import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ActionLogEntry, AlertSeverity } from '../types/production';
import { getAlertActionDetails } from '../data/defaultPlan';

interface RealtimeAlertBannerProps {
  currentSeverity: AlertSeverity;
  latestRecordedHourLabel: string | null;
  cumPlanAtLatest: number;
  cumActualAtLatest: number;
  achvPercentAtLatest: number | null;
  remainingQty: number;
  remainingHours: number;
  baseUph: number;
  requiredCatchupUph: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  actionLogs: ActionLogEntry[];
  onAddActionLog: (entry: Omit<ActionLogEntry, 'id' | 'timestamp'>) => void;
  onToggleResolveLog: (id: string) => void;
}

export const RealtimeAlertBanner: React.FC<RealtimeAlertBannerProps> = ({
  currentSeverity,
  latestRecordedHourLabel,
  cumPlanAtLatest,
  cumActualAtLatest,
  achvPercentAtLatest,
  remainingQty,
  remainingHours,
  baseUph,
  requiredCatchupUph,
  soundEnabled,
  onToggleSound,
  actionLogs,
  onAddActionLog,
  onToggleResolveLog,
}) => {
  const [actionNote, setActionNote] = useState('');
  const [showLogHistory, setShowLogHistory] = useState(false);

  const details = getAlertActionDetails(currentSeverity);
  const gapUnits = cumActualAtLatest - cumPlanAtLatest;
  const shortfallPercent =
    achvPercentAtLatest !== null ? Math.max(0, 100 - achvPercentAtLatest) : 0;
  const extraUphNeeded = Math.max(0, requiredCatchupUph - baseUph);
  const hasRecordedHours = latestRecordedHourLabel !== null && achvPercentAtLatest !== null;
  const isAlertActive =
    hasRecordedHours &&
    (currentSeverity === 'level1_5pct' ||
      currentSeverity === 'level2_10pct' ||
      currentSeverity === 'level3_15pct' ||
      currentSeverity === 'level4_20pct');

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text =
      actionNote.trim() ||
      `${details.actionInstruction} (แก้ไขที่ ${latestRecordedHourLabel || 'หน้างาน'})`;
    onAddActionLog({
      hourLabel: latestRecordedHourLabel || 'Current',
      severity: currentSeverity,
      shortfallPercent: Number(shortfallPercent.toFixed(1)),
      ownerRole: details.roleOwner,
      actionTaken: text,
      resolved: false,
    });
    setActionNote('');
    setShowLogHistory(true);
  };

  return (
    <div
      className={`rounded-xl border-2 transition-colors duration-200 ${
        !hasRecordedHours
          ? 'bg-white border-slate-200'
          : isAlertActive
          ? `${details.bgClass} ${details.borderClass}`
          : 'bg-emerald-50/70 border-emerald-500'
      }`}
      role="region"
      aria-label="ระบบแจ้งเตือนสถานะการผลิตเรียลไทม์"
    >
      <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Status & Real-Time Escalation Instruction */}
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-lg flex-shrink-0 ${
              !hasRecordedHours
                ? 'bg-slate-100 text-slate-700'
                : isAlertActive
                ? 'bg-white text-red-600 shadow-xs'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {!hasRecordedHours ? (
              <Bell className="w-5 h-5" />
            ) : isAlertActive ? (
              <BellRing className="w-5 h-5 animate-bounce" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-900">
                {!hasRecordedHours
                  ? 'ระบบเฝ้าระวังยอดผลิตรายชั่วโมง (Real-Time Andon & IE Alert Ready)'
                  : details.badgeText}
              </span>
              {hasRecordedHours && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-semibold text-slate-700">
                    บันทึกแก้ไขล่าสุดถึง {latestRecordedHourLabel}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-bold text-[#0B4F8A]">
                    ผู้รับผิดชอบ: {details.roleOwner}
                  </span>
                </>
              )}
            </div>

            <p className="text-xs sm:text-sm font-semibold text-slate-900 mt-1">
              {!hasRecordedHours
                ? 'กรอกยอดผลิตจริง (Actual) ในตารางรายชั่วโมงด้านล่าง หรือกดปุ่มจำลองสถานการณ์เพื่อทดสอบระบบแจ้งเตือนอัตโนมัติ (5% / 10% / 15% / 20%)'
                : `Action Plan: ${details.actionInstruction} — ${details.ieRecommendation}`}
            </p>
          </div>
        </div>

        {/* Right: Live Catch-up UPH Telemetry & Controls */}
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap flex-shrink-0">
          {hasRecordedHours && (
            <div className="flex items-center gap-4 px-3.5 py-2 rounded-lg bg-white/90 border border-slate-200/90 text-xs">
              <div>
                <div className="text-slate-500">สะสมจริง / แผน ({latestRecordedHourLabel})</div>
                <div className="font-mono-num font-bold text-sm text-slate-900">
                  {cumActualAtLatest.toLocaleString()} / {cumPlanAtLatest.toLocaleString()}{' '}
                  <span
                    className={
                      gapUnits < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'
                    }
                  >
                    ({gapUnits > 0 ? `+${gapUnits}` : gapUnits})
                  </span>
                </div>
              </div>

              <div className="h-7 w-px bg-slate-200" />

              <div>
                <div className="text-slate-500">% บรรลุเป้าสะสม</div>
                <div
                  className={`font-mono-num font-bold text-sm ${
                    (achvPercentAtLatest ?? 100) < 95
                      ? 'text-red-600'
                      : (achvPercentAtLatest ?? 100) < 100
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {achvPercentAtLatest?.toFixed(1)}%
                  {shortfallPercent > 0 && ` (ขาด ${shortfallPercent.toFixed(1)}%)`}
                </div>
              </div>

              {remainingHours > 0 && (
                <>
                  <div className="h-7 w-px bg-slate-200" />
                  <div>
                    <div className="text-slate-500 flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-[#0B4F8A]" />
                      <span>UPH ที่ต้องทำใน {remainingHours} ชม. ที่เหลือ</span>
                    </div>
                    <div className="font-mono-num font-bold text-sm text-[#0B4F8A]">
                      {requiredCatchupUph} UPH{' '}
                      {extraUphNeeded > 0 && (
                        <span className="text-red-600 text-xs">
                          (ต้องเร่ง +{extraUphNeeded} เครื่อง/ชม.)
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                soundEnabled
                  ? 'bg-[#0B4F8A] text-white border-[#0B4F8A]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>เสียงเตือน: เปิด</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>เสียงเตือน: ปิด</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowLogHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-[#0B4F8A]" />
              <span>บันทึกแก้ไข ({actionLogs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Action Logger & Log Drawer when alert is active or user opens logs */}
      {(isAlertActive || showLogHistory) && (
        <div className="px-4 py-3 bg-white/90 border-t border-slate-200/80 rounded-b-xl space-y-3 no-print">
          <form onSubmit={handleLogSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <input
                type="text"
                aria-label="ระบุการแก้ไขปัญหาหน้างาน (Action Taken)"
                placeholder={`บันทึกการแก้ไขของ ${details.roleOwner}: เช่น เสริมคนจุดคอขวด JIG A, ปรับสมดุลงานรุ่น TM19+TM21...`}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0B4F8A] hover:bg-[#083B66] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              บันทึก Action Plan
            </button>
          </form>

          {showLogHistory && actionLogs.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-600">
                ประวัติการแจ้งเตือนและการแก้ไขหน้างานในกะนี้:
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50">
                {actionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-num text-slate-500">{log.timestamp}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-[#0B4F8A]">{log.hourLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-800">{log.ownerRole}:</span>
                      <span
                        className={`truncate ${
                          log.resolved ? 'line-through text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {log.actionTaken}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleResolveLog(log.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
                        log.resolved
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {log.resolved ? 'แก้ไขแล้ว' : 'ทำเครื่องหมายว่าแก้แล้ว'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
