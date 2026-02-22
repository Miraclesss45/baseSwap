// src/components/TokenInfo.jsx
import { useState } from "react";

// ─── Formatters ───────────────────────────────────────────────────────────────

const format = (num) => {
  if (!num || isNaN(num)) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
  if (num >= 1_000_000)     return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000)         return (num / 1_000).toFixed(2) + "K";
  return Number(num).toFixed(4);
};

const percentColor = (v) => (v >= 0 ? "text-emerald-400" : "text-red-400");
const getChangeBg  = (v) =>
  v > 0 ? "bg-emerald-500/[0.08] border-emerald-500/25"
  : v < 0 ? "bg-red-500/[0.08] border-red-500/25"
  : "bg-slate-500/[0.08] border-slate-500/20";

function ChangeArrow({ value, size = 3 }) {
  if (value === 0) return null;
  return (
    <svg className={`w-${size} h-${size} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {value > 0
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      }
    </svg>
  );
}

// Inline SVG fallback when token logo fails to load
function TokenLogoFallback({ symbol }) {
  const initials = (symbol || "?").slice(0, 2).toUpperCase();
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-600 to-blue-600 text-white font-mono font-bold text-xl select-none">
      {initials}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TokenInfo({ tokenData }) {
  const [imgError, setImgError] = useState(false);
  const [copied,   setCopied]   = useState(false);

  if (!tokenData) return null;

  const logoUrl = !imgError && (tokenData.logo || tokenData.dexLogo)
    ? (tokenData.logo || tokenData.dexLogo)
    : null;

  const copyAddress = () => {
    navigator.clipboard.writeText(tokenData.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const priceFormatted = Number(tokenData.priceUsd).toFixed(
    tokenData.priceUsd < 0.01 ? 8 : tokenData.priceUsd < 1 ? 6 : 2
  );

  return (
    <div className="space-y-4">

      {/* ── Token Header Card ───────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-[#0a0f1a] border border-white/[0.06] rounded-2xl shadow-xl group transition-all duration-300 hover:border-cyan-500/20 hover:shadow-cyan-500/[0.08]">
        {/* Accent line top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        {/* Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-20 rounded-full pointer-events-none blur-3xl opacity-0 group-hover:opacity-[0.07] transition-opacity duration-500 bg-cyan-400" />

        <div className="relative p-5 sm:p-6">

          {/* Identity row */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Logo */}
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 blur-md opacity-40 group-hover:opacity-60 transition-opacity duration-300" />
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-cyan-500/25 bg-slate-800 ring-4 ring-[#0a0f1a]">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${tokenData.name} logo`}
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <TokenLogoFallback symbol={tokenData.symbol} />
                  )}
                </div>
              </div>

              {/* Name + symbol */}
              <div className="min-w-0">
                {/* BUG FIX: was `text-sm md:text-2xl` — skipped sm breakpoint, fixed below */}
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight truncate">
                  {tokenData.name}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono font-bold text-base text-cyan-400">
                    {tokenData.symbol}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/25 rounded-md font-mono text-[10px] text-blue-400 font-semibold uppercase tracking-widest">
                    BASE
                  </span>
                </div>
              </div>
            </div>

            {/* Price */}
            <div className="text-right shrink-0">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">
                ${priceFormatted}
              </div>
              {tokenData.change24h !== undefined && (
                <div className={`flex items-center justify-end gap-1 mt-1 ${percentColor(tokenData.change24h)}`}>
                  <ChangeArrow value={tokenData.change24h} size={3} />
                  <span className="font-mono font-bold text-sm tabular-nums">
                    {Math.abs(tokenData.change24h).toFixed(2)}%
                  </span>
                  <span className="font-mono text-xs text-slate-500">24h</span>
                </div>
              )}
            </div>
          </div>

          {/* Contract address row */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-cyan-500/20 transition-all duration-200 group/addr">
            <svg className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest shrink-0">Contract</span>
            <span className="font-mono text-xs text-cyan-400/80 truncate flex-1">
              {tokenData.address}
            </span>

            {/* Copy */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={copyAddress}
                title="Copy address"
                className="relative p-1.5 hover:bg-cyan-500/15 rounded-lg transition-all group/copy"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-emerald-600 text-white font-mono text-[10px] rounded-md whitespace-nowrap shadow-lg">
                      Copied!
                    </span>
                  </>
                ) : (
                  <svg className="w-3.5 h-3.5 text-slate-500 group-hover/copy:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              {/* BaseScan link */}
              <a
                href={`https://basescan.org/token/${tokenData.address}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on BaseScan"
                className="p-1.5 hover:bg-cyan-500/15 rounded-lg transition-all group/link"
              >
                <svg className="w-3.5 h-3.5 text-slate-500 group-hover/link:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Price Change Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "5M",  value: tokenData.change5m  ?? 0 },
          { label: "1H",  value: tokenData.change1h  ?? 0 },
          { label: "6H",  value: tokenData.change6h  ?? 0 },
          { label: "24H", value: tokenData.change24h ?? 0 },
        ].map(({ label, value }) => (
          <div
            key={label}
            className={`relative overflow-hidden border rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] ${getChangeBg(value)}`}
          >
            {/* Progress bar at bottom */}
            <div
              className={`absolute bottom-0 left-0 h-[2px] transition-all duration-500 ${
                value > 0 ? "bg-emerald-400/40" : value < 0 ? "bg-red-400/40" : "bg-slate-400/20"
              }`}
              style={{ width: `${Math.min(Math.abs(value) * 10, 100)}%` }}
            />

            <div className="font-mono text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-2">
              {label}
            </div>
            <div className={`flex items-center gap-1.5 ${percentColor(value)}`}>
              <ChangeArrow value={value} size={3} />
              <span className="font-mono text-xl font-bold tabular-nums">
                {value > 0 && "+"}{value.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Market Data Card ─────────────────────────────────────────── */}
      <div className="bg-[#0a0f1a] border border-white/[0.06] rounded-2xl overflow-hidden transition-all duration-300 hover:border-blue-500/20">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-white/[0.04] bg-gradient-to-r from-blue-500/[0.04] to-cyan-500/[0.04]">
          <h3 className="font-mono text-xs font-bold text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Market Data
          </h3>
        </div>

        <div className="p-4 space-y-2">
          {[
            {
              icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
              label: "Market Cap",
              value: format(tokenData.marketCap),
              accent: "cyan",
            },
            {
              icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
              label: "Fully Diluted Val.",
              value: format(tokenData.fdv),
              accent: "blue",
            },
            {
              icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z",
              label: "Liquidity",
              value: format(tokenData.liquidityUsd),
              accent: "violet",
              highlight: true,
            },
            {
              icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
              label: "Total Supply",
              value: format(tokenData.totalSupply),
              accent: "slate",
            },
          ].map(({ icon, label, value, accent, highlight }) => {
            const colorMap = {
              cyan:   { bg: "bg-cyan-500/[0.08]",   text: "text-cyan-400",   val: "text-cyan-400"   },
              blue:   { bg: "bg-blue-500/[0.08]",   text: "text-blue-400",   val: "text-white"      },
              violet: { bg: "bg-violet-500/[0.08]", text: "text-violet-400", val: "text-violet-400" },
              slate:  { bg: "bg-slate-500/[0.08]",  text: "text-slate-400",  val: "text-white"      },
            };
            const c = colorMap[accent] ?? colorMap.slate;
            return (
              <div
                key={label}
                className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.01] ${
                  highlight
                    ? "bg-violet-500/[0.07] border border-violet-500/20 hover:bg-violet-500/10"
                    : "bg-white/[0.02] hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${c.bg}`}>
                    <svg className={`w-4 h-4 ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                    </svg>
                  </div>
                  <span className="font-mono text-xs text-slate-400 tracking-wide">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {highlight && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />}
                  <span className={`font-mono font-bold tabular-nums ${c.val} ${highlight ? "text-base" : "text-sm"}`}>
                    ${value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`https://basescan.org/token/${tokenData.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 p-4 rounded-xl
                     bg-white/[0.02] border border-white/[0.06]
                     hover:bg-cyan-500/10 hover:border-cyan-500/30
                     transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/10"
        >
          <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-cyan-400 transition-colors uppercase tracking-wider">
            BaseScan
          </span>
        </a>

        <a
          href={`https://dexscreener.com/base/${tokenData.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 p-4 rounded-xl
                     bg-white/[0.02] border border-white/[0.06]
                     hover:bg-blue-500/10 hover:border-blue-500/30
                     transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/10"
        >
          <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-blue-400 transition-colors uppercase tracking-wider">
            Chart
          </span>
        </a>
      </div>

      {/* ── Data notice ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/[0.04] border border-blue-500/15 rounded-xl">
        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-mono text-[11px] text-blue-400/70 leading-relaxed">
          Prices and metrics from Moralis + DexScreener. May vary across platforms.
        </p>
      </div>

    </div>
  );
}