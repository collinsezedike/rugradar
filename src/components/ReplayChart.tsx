import { useMemo } from "react";
import type { ReplayEvent, Alert } from "../types";

interface Props {
  events: ReplayEvent[];
  cursor: number;
}

const W = 600;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 48 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

interface Series {
  price: number[];
  liquidity: number[];
}

function deriveSeries(events: ReplayEvent[]): Series {
  // Simulate price and liquidity curves from event sequence
  let price     = 100;
  let liquidity = 100;
  const prices:      number[] = [];
  const liquidities: number[] = [];

  for (const e of events) {
    // Price impact per event type
    if (e.type === "buy")              price = clamp(price + (e.valueUsd ?? 0) / 400, 0, 999);
    if (e.type === "sell")             price = clamp(price - (e.valueUsd ?? 0) / 200, 0, 999);
    if (e.type === "remove_liquidity") { price = clamp(price * 0.55, 0, 999); liquidity = clamp(liquidity - (e.valueUsd ?? 0) / 500, 0, 100); }
    if (e.type === "add_liquidity")    liquidity = clamp(liquidity + (e.valueUsd ?? 0) / 500, 0, 100);
    prices.push(price);
    liquidities.push(liquidity);
  }

  // Normalise both to 0-100 range
  const maxP = Math.max(...prices, 1);
  const maxL = Math.max(...liquidities, 1);
  return {
    price:     prices.map((p) => (p / maxP) * 100),
    liquidity: liquidities.map((l) => (l / maxL) * 100),
  };
}

function toSvgPoints(values: number[], total: number): string {
  return values
    .map((v, i) => {
      const x = PAD.left + (i / Math.max(total - 1, 1)) * INNER_W;
      const y = PAD.top  + (1 - v / 100) * INNER_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function collectAlerts(events: ReplayEvent[]): Array<{ idx: number; severity: Alert["severity"] }> {
  const seen = new Set<string>();
  const out: Array<{ idx: number; severity: Alert["severity"] }> = [];
  for (let i = 0; i < events.length; i++) {
    for (const a of events[i].alertsTriggered) {
      if (!seen.has(a.type)) {
        seen.add(a.type);
        out.push({ idx: i, severity: a.severity });
      }
    }
  }
  return out;
}

const SEVERITY_COLOR: Record<Alert["severity"], string> = {
  critical: "#ff2d2d",
  high:     "#ff6b00",
  medium:   "#ffd600",
  low:      "#5c7a99",
};

function fmtUsd(v?: number) {
  if (!v) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function ReplayChart({ events, cursor }: Props) {
  const series = useMemo(() => deriveSeries(events), [events]);
  const alertMarkers = useMemo(() => collectAlerts(events), [events]);
  const total = events.length;

  if (total < 2) return null;

  // Visible up to cursor
  const visiblePrice     = series.price.slice(0, cursor + 1);
  const visibleLiquidity = series.liquidity.slice(0, cursor + 1);

  // Cursor position
  const cursorX = PAD.left + (cursor / Math.max(total - 1, 1)) * INNER_W;
  const cursorPriceY = PAD.top + (1 - (series.price[cursor] ?? 0) / 100) * INNER_H;

  // Y-axis labels (price)
  const curEvent = events[cursor];
  const peakLiq  = Math.max(...events.filter((e) => e.poolSnapshot?.liquidityUsd).map((e) => e.poolSnapshot!.liquidityUsd!), 1);

  return (
    <div className="bg-[#0d1420] border border-[#1e2d42] rounded-lg p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.6rem] font-bold tracking-[3px] text-white/30 uppercase">Price & Liquidity</span>
        <div className="flex items-center gap-3 text-[0.62rem] text-white/40">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-cyan-400" /> Price</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-orange-400 border-dashed" style={{borderTop:"1px dashed #fb923c"}} /> Liquidity</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: H }}
        overflow="visible"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = PAD.top + (1 - pct / 100) * INNER_H;
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#1e2d42" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill="#3a5070" fontSize={9} fontFamily="monospace">
                {pct}
              </text>
            </g>
          );
        })}

        {/* Alert vertical markers */}
        {alertMarkers.map(({ idx, severity }) => {
          const x = PAD.left + (idx / Math.max(total - 1, 1)) * INNER_W;
          const color = SEVERITY_COLOR[severity];
          return (
            <g key={idx}>
              <line
                x1={x} y1={PAD.top} x2={x} y2={PAD.top + INNER_H}
                stroke={color} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.7}
              />
              <polygon
                points={`${x},${PAD.top - 2} ${x - 5},${PAD.top - 10} ${x + 5},${PAD.top - 10}`}
                fill={color}
              />
            </g>
          );
        })}

        {/* Liquidity area (dashed, behind price) */}
        {visibleLiquidity.length > 1 && (
          <polyline
            points={toSvgPoints(visibleLiquidity, total)}
            fill="none"
            stroke="#fb923c"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.6}
          />
        )}

        {/* Price area fill */}
        {visiblePrice.length > 1 && (() => {
          const pts = toSvgPoints(visiblePrice, total);
          const firstX = PAD.left;
          const lastX  = PAD.left + (visiblePrice.length - 1) / Math.max(total - 1, 1) * INNER_W;
          const baseY  = PAD.top + INNER_H;
          return (
            <>
              <polygon
                points={`${firstX},${baseY} ${pts} ${lastX},${baseY}`}
                fill="url(#priceGrad)"
                opacity={0.25}
              />
              <polyline
                points={pts}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={2}
              />
            </>
          );
        })()}

        {/* Cursor dot + crosshair */}
        {cursor > 0 && (
          <>
            <line
              x1={cursorX} y1={PAD.top} x2={cursorX} y2={PAD.top + INNER_H}
              stroke="#ffffff" strokeWidth={1} opacity={0.15}
            />
            <circle cx={cursorX} cy={cursorPriceY} r={4} fill="#22d3ee" />
            <circle cx={cursorX} cy={cursorPriceY} r={8} fill="#22d3ee" opacity={0.2} />
          </>
        )}

        {/* Tooltip at cursor */}
        {curEvent && cursor > 0 && (() => {
          const tipX = cursorX > W / 2 ? cursorX - 6 : cursorX + 6;
          const anchor = cursorX > W / 2 ? "end" : "start";
          const liq = curEvent.poolSnapshot?.liquidityUsd;
          return (
            <g>
              <text x={tipX} y={cursorPriceY - 10} textAnchor={anchor} fill="#22d3ee" fontSize={9} fontFamily="monospace">
                {fmtUsd(liq)}
              </text>
            </g>
          );
        })()}

        {/* Gradient def */}
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0}   />
          </linearGradient>
        </defs>

        {/* X-axis baseline */}
        <line
          x1={PAD.left} y1={PAD.top + INNER_H}
          x2={W - PAD.right} y2={PAD.top + INNER_H}
          stroke="#1e2d42" strokeWidth={1}
        />

        {/* Peak liq label */}
        <text x={W - PAD.right + 4} y={PAD.top + 4} fill="#fb923c" fontSize={8} fontFamily="monospace" opacity={0.6}>
          {fmtUsd(peakLiq)}
        </text>
      </svg>

      {/* Alert legend */}
      {alertMarkers.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-1.5">
          {alertMarkers.map(({ idx, severity }) => {
            const a = events[idx].alertsTriggered[0];
            return (
              <span key={idx} className="text-[0.58rem] px-1.5 py-0.5 rounded font-bold tracking-wide"
                style={{ background: SEVERITY_COLOR[severity] + "22", color: SEVERITY_COLOR[severity], border: `1px solid ${SEVERITY_COLOR[severity]}44` }}>
                ⚠ {a?.type.replace(/_/g, " ").toUpperCase()}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
