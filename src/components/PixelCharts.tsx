import React from 'react';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export const PixelDonutChart: React.FC<{
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}> = ({ slices, centerValue, centerLabel, size = 160 }) => {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  let cumulativePct = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 160 160" className="-rotate-90">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#e5cfa2"
            strokeWidth="22"
          />
          {total > 0 &&
            slices.map((slice) => {
              if (slice.value <= 0) return null;
              const pct = slice.value / total;
              const dash = pct * circumference;
              const offset = -cumulativePct * circumference;
              cumulativePct += pct;
              return (
                <circle
                  key={slice.label}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="22"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={offset}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="font-mono-num text-xl font-bold text-[#3a1f0f] leading-tight">
            {centerValue}
          </span>
          <span className="text-[11px] font-medium text-[#723b18]">{centerLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        {slices.map((slice) => {
          const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={slice.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3.5 shrink-0 border-2 border-[#4a2612]"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-[#4a2612] font-medium truncate">{slice.label}</span>
              </div>
              <div className="font-mono-num text-xs font-semibold text-[#3a1f0f] shrink-0">
                {slice.value.toLocaleString()} ({pct}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface BarItem {
  label: string;
  value: number;
  secondaryValue?: number;
  color: string;
  secondaryColor?: string;
}

export const PixelBarChart: React.FC<{
  items: BarItem[];
  unit?: string;
  height?: number;
}> = ({ items, unit = '', height = 150 }) => {
  const maxVal = Math.max(
    1,
    ...items.map((item) => Math.max(item.value, item.secondaryValue ?? 0))
  );

  return (
    <div className="w-full">
      <div
        className="flex items-end gap-3 border-b-2 border-[#8e4c1d] pb-2 pt-4 px-2"
        style={{ height }}
      >
        {items.map((item) => {
          const h1 = Math.max(6, Math.round((item.value / maxVal) * (height - 46)));
          const h2 =
            item.secondaryValue !== undefined
              ? Math.max(4, Math.round((item.secondaryValue / maxVal) * (height - 46)))
              : 0;
          return (
            <div key={item.label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
              <span className="font-mono-num text-[11px] font-bold text-[#4a2612] truncate">
                {item.value.toLocaleString()}
                {unit}
              </span>
              <div className="flex items-end gap-1 w-full justify-center">
                <div
                  className="w-5 sm:w-7 border-2 border-[#4a2612] transition-all duration-300"
                  style={{ height: h1, backgroundColor: item.color }}
                  title={`${item.label}: ${item.value.toLocaleString()}${unit}`}
                />
                {item.secondaryValue !== undefined && (
                  <div
                    className="w-4 sm:w-5 border-2 border-[#4a2612] transition-all duration-300"
                    style={{
                      height: h2,
                      backgroundColor: item.secondaryColor || '#d97706',
                    }}
                    title={`ต้นทุน: ${item.secondaryValue.toLocaleString()}${unit}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 px-2 pt-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex-1 text-center text-[11px] font-semibold text-[#5c2e14] truncate"
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
};
