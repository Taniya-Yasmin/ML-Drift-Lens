import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime, formatPercent } from "../../utils/format";

/**
 * Plots accuracy/precision/recall/F1 as a TIME SERIES — one point per
 * model_versions row, ordered oldest -> newest. This is what the project
 * plan calls for ("live accuracy/performance chart over time"), as
 * opposed to a same-instant bar comparison across models.
 *
 * `data` must already be filtered to a single model_id and sorted
 * ascending by timestamp (see Models.jsx for how it's built).
 */
export default function PerformanceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="#1a222d" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatDateTime(v)}
          tick={{ fill: "#4d5a68", fontSize: 10.5 }}
          axisLine={{ stroke: "#212b38" }}
          tickLine={false}
          minTickGap={30}
        />
        <YAxis
          tickFormatter={(v) => formatPercent(v, 0)}
          domain={[0, 1]}
          tick={{ fill: "#4d5a68", fontSize: 10.5 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v) => formatPercent(v)}
          labelFormatter={(v) => formatDateTime(v)}
          contentStyle={{
            background: "#17202b",
            border: "1px solid #212b38",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
        <Line
          type="monotone"
          dataKey="accuracy"
          name="Accuracy"
          stroke="#5b8def"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="f1_score"
          name="F1"
          stroke="#4ade80"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
