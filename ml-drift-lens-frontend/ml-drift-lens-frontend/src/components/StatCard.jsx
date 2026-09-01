import { Area, AreaChart, ReferenceLine, ResponsiveContainer } from "recharts";

/**
 * Signature element: a mini sparkline with an optional dashed threshold
 * line overlaid — echoing the PSI/Z-score "control limit" concept the
 * whole product is built around, right down at the KPI-card level.
 */
export default function StatCard({
  label,
  value,
  trend,
  trendTone = "neutral",
  spark,
  threshold,
  sparkColor = "#5b8def",
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value-row">
        <span className="stat-value">{value}</span>
        {trend && <span className={`stat-trend ${trendTone}`}>{trend}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="stat-spark">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              {threshold !== undefined && threshold !== null && (
                <ReferenceLine
                  y={threshold}
                  stroke="#f5b942"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                strokeWidth={1.6}
                fill={`url(#spark-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
