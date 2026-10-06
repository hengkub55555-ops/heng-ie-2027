import React from 'react';
import { GroupedModelFocus } from '../data/defaultPlan';

interface ModelDonutChartProps {
  groups: GroupedModelFocus[];
  totalQty: number;
  selectedGroupKey: string | null;
  onSelectGroup: (key: string | null) => void;
}

export const ModelDonutChart: React.FC<ModelDonutChartProps> = ({
  groups,
  totalQty,
  selectedGroupKey,
  onSelectGroup,
}) => {
  const activeGroups = groups.filter((g) => g.qtyPlan > 0);
  const radius = 64;
  const strokeWidth = 28;
  const center = 110;
  const circumference = 2 * Math.PI * radius;

  let cumulativeAngle = -90; // Start at top (-90 deg)

  const segments = activeGroups.map((group) => {
    const fraction = totalQty > 0 ? group.qtyPlan / totalQty : 0;
    const strokeDasharray = `${Math.max(0, fraction * circumference - 1.5)} ${circumference}`;
    const strokeDashoffset = 0;
    const startAngle = cumulativeAngle;
    const sweepAngle = fraction * 360;
    const midAngle = startAngle + sweepAngle / 2;
    cumulativeAngle += sweepAngle;

    return {
      group,
      fraction,
      strokeDasharray,
      strokeDashoffset,
      startAngle,
      midAngle,
    };
  });

  return (
    <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
      {/* SVG Donut */}
      <div className="relative flex-shrink-0">
        <svg
          width="220"
          height="220"
          viewBox="0 0 220 220"
          className="overflow-visible select-none"
          role="img"
          aria-label="กราฟโดนัทแสดงสัดส่วนยอดผลิตแต่ละรุ่น"
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />

          {segments.map(({ group, strokeDasharray, startAngle }) => {
            const isSelected = selectedGroupKey === group.key;
            const isDimmed = selectedGroupKey !== null && !isSelected;
            return (
              <circle
                key={group.key}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={group.color}
                strokeWidth={isSelected ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={strokeDasharray}
                transform={`rotate(${startAngle} ${center} ${center})`}
                className="cursor-pointer transition-opacity duration-150"
                style={{ opacity: isDimmed ? 0.35 : 1 }}
                onClick={() =>
                  onSelectGroup(selectedGroupKey === group.key ? null : group.key)
                }
              >
                <title>
                  {group.label}: {group.qtyPlan.toLocaleString()} เครื่อง ({group.percent.toFixed(1)}%)
                </title>
              </circle>
            );
          })}

          {/* Inner White Circle */}
          <circle cx={center} cy={center} r={radius - strokeWidth / 2 - 2} fill="#ffffff" />
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-2xl font-bold text-slate-900 font-mono-num leading-none">
            {totalQty.toLocaleString()}
          </span>
          <span className="text-xs font-semibold text-slate-600 mt-1">เครื่อง</span>
        </div>
      </div>

      {/* Callout Legend List matching reference image proportions */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5 text-xs">
        {activeGroups.map((g) => {
          const isSelected = selectedGroupKey === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onSelectGroup(isSelected ? null : g.key)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                isSelected
                  ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-500'
                  : 'bg-slate-50/80 border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: g.color }}
                />
                <span className="font-bold text-slate-800 truncate">{g.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 font-mono-num">
                <span className="font-bold" style={{ color: g.color }}>
                  {g.percent.toFixed(1)}%
                </span>
                <span className="text-slate-600">
                  ({g.qtyPlan.toLocaleString()} เครื่อง)
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
