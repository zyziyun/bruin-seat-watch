"use client";

// A client component, because Recharts measures the DOM. Everything else in
// this app is a Server Component and never ships to the browser. Keep the
// client boundary as small as possible: this file takes plain numbers, it does
// not talk to the database.

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Point = {
  t: string;
  seatsTaken: number;
  seatsTotal: number;
  waitlistTaken: number;
};

// Recharts animates a series in by growing a clipPath from width 0. If that
// animation does not run, and it does not run reliably on first paint here, the
// paths are drawn correctly and then clipped away, so you get axes and no data.
// Turning the animation off is also the honest choice for a chart people read
// numbers off. Do not spend an hour on this like I nearly did.
const NO_ANIMATION = { isAnimationActive: false } as const;

export function EnrollmentChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
          <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            labelStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="seatsTaken"
            name="Enrolled"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
            {...NO_ANIMATION}
          />
          <Line
            type="monotone"
            dataKey="seatsTotal"
            name="Capacity"
            stroke="#737373"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            {...NO_ANIMATION}
          />
          <Area
            type="monotone"
            dataKey="waitlistTaken"
            name="Waitlisted"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
            {...NO_ANIMATION}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
