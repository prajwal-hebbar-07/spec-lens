"use client";

import { cn } from "@/lib/utils";

/**
 * A circular progress gauge (SVG donut). Fills clockwise from the top and turns
 * red at >= 90% to mirror the Claude/Codex statusline threshold. `pct` is 0-100;
 * pass `null` when the value is unknown to render an empty, dimmed ring.
 */
export function RingGauge({
  pct,
  label,
  sublabel,
  color,
  size = 96,
  stroke = 8,
}: {
  pct: number | null;
  label: string;
  sublabel?: string;
  /** Track/fill hue. Ignored (forced red) once pct >= 90. */
  color: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const danger = pct !== null && clamped >= 90;
  const fill = danger ? "var(--destructive)" : color;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          {pct !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={fill}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              className="transition-[stroke-dasharray] duration-500"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              danger && "text-destructive",
            )}
          >
            {pct === null ? "—" : `${Math.round(clamped)}%`}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
      </div>
    </div>
  );
}
