"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Validated categorical order (see dataviz check): grape, tangerine, sky. Max 3 series per chart. */
export const SERIES = ["#7C5CFF", "#FF6B35", "#1FA2E0"];
const GRID = "#E9DCC4";
const AXIS = { fontSize: 11, fill: "#7A7061" };

const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : `${v}`);
const fmtRM = (v: number) => `RM${Number(v).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

function TooltipBox({ active, payload, label, money }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border-2 border-ink bg-card px-3 py-2 text-xs shadow-brutal-sm">
      <p className="mb-1 font-bold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="ml-auto font-mono font-semibold">{money ? fmtRM(p.value) : p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series horizontal bars with value labels at the tip. */
export function HBarChart({ data, height = 260, money }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money ? fmtK : undefined} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "#16140F" }} width={130} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(124,92,255,0.08)" }} content={<TooltipBox money={money} />} />
        <Bar dataKey="value" name={money ? "Amount" : "Count"} fill={SERIES[0]} barSize={16} radius={[0, 4, 4, 0]}>
          <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#3B362C", fontWeight: 600 }} formatter={(v: unknown) => (money ? fmtK(Number(v)) : String(v))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Column chart, 1–3 stacked series. */
export function ColumnChart({
  data,
  series,
  height = 260,
  money,
  stacked = true,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  height?: number;
  money?: boolean;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money ? fmtK : undefined} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(124,92,255,0.08)" }} content={<TooltipBox money={money} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#3B362C" }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? "a" : undefined}
            fill={SERIES[i]}
            barSize={22}
            stroke="#FFFFFF"
            strokeWidth={stacked ? 1 : 0}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Area/line trend for 1–3 series, 2px lines, 10% wash. */
export function TrendChart({
  data,
  series,
  height = 260,
  money,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  height?: number;
  money?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={money ? fmtK : undefined} width={44} />
        <Tooltip content={<TooltipBox money={money} />} cursor={{ stroke: "#16140F", strokeWidth: 1 }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#3B362C" }} />}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES[i]}
            strokeWidth={2}
            fill={SERIES[i]}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 5, stroke: "#FFFFFF", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Distribution as a single-series column chart with per-category tint allowed only for status. */
export function DistributionChart({ data, height = 220 }: { data: { name: string; value: number; highlight?: boolean }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(124,92,255,0.08)" }} content={<TooltipBox />} />
        <Bar dataKey="value" name="Count" barSize={22} radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.highlight ? SERIES[1] : SERIES[0]} />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "#3B362C", fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
