import type { Invoice } from "@/lib/types";
import { riskLevelCounts } from "@/lib/crystal";
import { Panel } from "./ui/primitives";

export function RiskLevelChart({ invoices }: { invoices: Invoice[] }) {
  const levels = riskLevelCounts(invoices);
  return <Panel className="risk-level-panel"><div className="section-head"><div><h2>Review priority levels</h2><p>Distribution of levels returned by the TypeScript server.</p></div></div>
    {levels.length ? <div className="risk-level-bars" role="img" aria-label={levels.map(item => `${item.level}: ${item.count} invoices`).join(", ")}>
      {levels.map(item => <div key={item.level} className="risk-level-row"><span>{item.level}</span><div className="bar-track"><i className={`bar-fill level-${item.level}`} style={{ width: `${item.count / invoices.length * 100}%` }}/></div><strong>{item.count}</strong></div>)}
    </div> : <p className="muted">No assessed invoices are available.</p>}
    <p className="chart-note">These are current sample records, not a historical trend or fraud probability.</p>
  </Panel>;
}
