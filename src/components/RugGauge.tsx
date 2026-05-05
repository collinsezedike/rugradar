import type { RugScores } from "../types";

interface Props {
  scores: RugScores;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#ff2d2d";
  if (score >= 60) return "#ff6b00";
  if (score >= 40) return "#ffd600";
  if (score >= 20) return "#9be36d";
  return "#2dff8f";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH RISK";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "SAFE";
}

interface GaugeArcProps {
  score: number;
  size?: number;
}

function GaugeArc({ score, size = 180 }: GaugeArcProps) {
  const r = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -210;
  const totalAngle = 240;
  const angle = startAngle + (score / 100) * totalAngle;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(start: number, end: number, radius: number) {
    const s = polarToXY(start, radius);
    const e = polarToXY(end, radius);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const needleTip = polarToXY(angle, r - 8);
  const needleBase1 = polarToXY(angle + 90, 6);
  const needleBase2 = polarToXY(angle - 90, 6);
  const color = scoreColor(score);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <path
        d={describeArc(startAngle, startAngle + totalAngle, r)}
        fill="none"
        stroke="#1e2430"
        strokeWidth={12}
        strokeLinecap="round"
      />
      {/* Fill */}
      {score > 0 && (
        <path
          d={describeArc(startAngle, angle, r)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      )}
      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={5} fill={color} />
      {/* Score text */}
      <text x={cx} y={cy + 28} textAnchor="middle" fill={color} fontSize={28} fontWeight="bold" fontFamily="monospace">
        {score.toFixed(0)}
      </text>
      <text x={cx} y={cy + 44} textAnchor="middle" fill={color} fontSize={10} fontFamily="monospace" letterSpacing="2">
        {scoreLabel(score)}
      </text>
    </svg>
  );
}

export function RugGauge({ scores }: Props) {
  return (
    <div className="rug-gauge">
      <div className="gauge-title">RUG SCORE</div>
      <div className="gauge-arc">
        <GaugeArc score={scores.composite} />
      </div>
      <div className="gauge-breakdown">
        <SubScore label="DEV DUMP" value={scores.devDump} />
        <SubScore label="LIQ PULL" value={scores.liquidityPull} />
        <SubScore label="SELL PRESS" value={scores.sellPressure} />
      </div>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  const pct = `${value.toFixed(0)}%`;
  return (
    <div className="sub-score">
      <div className="sub-score-label">{label}</div>
      <div className="sub-score-bar-track">
        <div
          className="sub-score-bar-fill"
          style={{ width: pct, background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <div className="sub-score-value" style={{ color }}>{value.toFixed(0)}</div>
    </div>
  );
}
