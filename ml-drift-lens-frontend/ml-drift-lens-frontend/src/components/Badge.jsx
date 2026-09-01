import { statusTone } from "../utils/format";

export default function Badge({ status, children }) {
  const tone = statusTone(status);
  return (
    <span className={`badge ${tone}`}>
      <span className="pulse-dot" />
      {children || status || "unknown"}
    </span>
  );
}
