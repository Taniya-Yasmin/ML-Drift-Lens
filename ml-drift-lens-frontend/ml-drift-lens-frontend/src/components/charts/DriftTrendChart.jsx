import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime } from "../../utils/format";

/**
 * Drift trend with a threshold line AND a shaded "breach zone" above it
 * (project plan: "drift score chart with threshold line, red zone when
 * crossed"). The red zone is drawn from the threshold up to the highest
 * score actually seen, so it always covers whatever the data reaches.
 */
export default function DriftTrendChart({ data, dataKey = "score", thresholdKey = "threshold" }) {
  const avgThreshold =
    data.length && data.some((d) => d[thresholdKey] !== undefined)
      ? data.reduce((sum, d) => sum + (Number(d[thresholdKey]) || 0), 0) / data.length
      : null;

  const maxScore = data.length ? Math.max(...data.map((d) => Number(d[dataKey]) || 0)) : 0;
  const yMax = Math.max(maxScore, avgThreshold || 0) * 1.15 || 1;

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
          domain={[0, yMax]}
          tick={{ fill: "#4d5a68", fontSize: 10.5 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#17202b",
            border: "1px solid #212b38",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelFormatter={(v) => formatDateTime(v)}
        />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
        {avgThreshold !== null && (
          <ReferenceArea
            y1={avgThreshold}
            y2={yMax}
            fill="#f0553f"
            fillOpacity={0.08}
            ifOverflow="extendDomain"
          />
        )}
        {avgThreshold !== null && (
          <ReferenceLine
            y={avgThreshold}
            stroke="#f5b942"
            strokeDasharray="4 4"
            label={{ value: "threshold", fill: "#f5b942", fontSize: 10.5, position: "right" }}
          />
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          name="score"
          stroke="#5b8def"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
