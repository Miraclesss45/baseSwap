// src/components/TokenInfo.jsx - PROFESSIONAL DEX DESIGN
import React, { useState } from "react";

const format = (num) => {
  if (!num || isNaN(num)) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
  return Number(num).toFixed(4);
};

const percentColor = (value) => (value >= 0 ? "text-green-400" : "text-red-400");

const getChangeBg = (value) => {
  if (value > 0) return "bg-green-500/10 border-green-500/30";
  if (value < 0) return "bg-red-500/10 border-red-500/30";
  return "bg-slate-500/10 border-slate-500/30";
};

const getChangeIcon = (value) => {
  if (value > 0) {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    );
  }
  if (value < 0) {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    );
  }
  return null;
};

export default function TokenInfo({ tokenData }) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!tokenData) return null;

  const logoUrl =
    !imgError && tokenData.logo
      ? tokenData.logo
      : tokenData.dexLogo || "https://via.placeholder.com/64?text=Token";

  const copyAddress = () => {
    navigator.clipboard.writeText(tokenData.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const priceFormatted = Number(tokenData.priceUsd).toFixed(
    tokenData.priceUsd < 0.01 ? 8 : tokenData.priceUsd < 1 ? 6 : 2
  );

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-5 duration-700">
      {/* Token Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-slate-900/40 to-slate-800/40 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-500 group">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        
        <div className="relative p-6">
          {/* Token Identity Section */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* Token Logo with Ring */}
              <div className="relative group/logo">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full blur-md opacity-50 group-hover/logo:opacity-75 transition-opacity"></div>
                <div className="relative w-16 h-16 rounded-full bg-slate-800 border-2 border-cyan-500/30 overflow-hidden ring-4 ring-slate-900/50 transform group-hover/logo:scale-110 transition-transform duration-300">
                  <img
                    src={logoUrl}
                    alt={`${tokenData.name} logo`}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Token Name & Symbol */}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">
                  {tokenData.name}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cyan-400 font-bold text-lg">{tokenData.symbol}</span>
                  <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded-md text-cyan-400 text-xs font-bold uppercase tracking-wide">
                    BASE
                  </span>
                </div>
              </div>
            </div>

            {/* Price Badge */}
            <div className="text-right">
              <div className="text-3xl font-bold text-white mb-1 tabular-nums">
                ${priceFormatted}
              </div>
              {tokenData.change24h !== undefined && (
                <div className={`flex items-center justify-end gap-1 ${percentColor(tokenData.change24h)}`}>
                  {getChangeIcon(tokenData.change24h)}
                  <span className="font-bold text-sm tabular-nums">
                    {Math.abs(tokenData.change24h).toFixed(2)}%
                  </span>
                  <span className="text-xs text-slate-400">24h</span>
                </div>
              )}
            </div>
          </div>

          {/* Contract Address */}
          <div className="flex items-center gap-2 p-3 bg-slate-950/50 border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-all group/address">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-slate-400 text-xs font-medium flex-shrink-0">CONTRACT</span>
              <span className="text-cyan-400 font-mono text-sm truncate">
                {tokenData.address}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={copyAddress}
                className="p-2 hover:bg-cyan-500/20 rounded-lg transition-all group/copy relative"
                title="Copy address"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-slate-400 group-hover/copy:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {copied && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-green-500 text-white text-xs rounded whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200">
                    Copied!
                  </span>
                )}
              </button>

              <a
                href={`https://basescan.org/token/${tokenData.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-cyan-500/20 rounded-lg transition-all group/link"
                title="View on BaseScan"
              >
                <svg className="w-4 h-4 text-slate-400 group-hover/link:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Price Change Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "5M", value: tokenData.change5m },
          { label: "1H", value: tokenData.change1h },
          { label: "6H", value: tokenData.change6h },
          { label: "24H", value: tokenData.change24h },
        ].map(({ label, value }, index) => (
          <div
            key={label}
            className={`relative overflow-hidden backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 hover:scale-105 group/change ${getChangeBg(
              value
            )}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Background percentage bar */}
            <div
              className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${
                value > 0 ? "bg-green-400/30" : value < 0 ? "bg-red-400/30" : "bg-slate-400/30"
              }`}
              style={{ width: `${Math.min(Math.abs(value) * 10, 100)}%` }}
            ></div>

            <div className="relative">
              <div className="text-slate-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                {label}
              </div>
              <div className={`flex items-center gap-1.5 ${percentColor(value)}`}>
                {getChangeIcon(value)}
                <span className="text-2xl font-bold tabular-nums">
                  {value > 0 && "+"}
                  {value.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Market Data Card */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-blue-500/20 rounded-2xl overflow-hidden shadow-xl hover:border-blue-500/40 transition-all duration-300">
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-slate-800/50 bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            MARKET DATA
          </h3>
        </div>

        {/* Market Stats Grid */}
        <div className="p-6 space-y-3">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              label: "Market Cap",
              value: format(tokenData.marketCap),
              color: "cyan",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              ),
              label: "Fully Diluted Value",
              value: format(tokenData.fdv),
              color: "blue",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              ),
              label: "Liquidity",
              value: format(tokenData.liquidityUsd),
              color: "purple",
              highlight: true,
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              ),
              label: "Total Supply",
              value: format(tokenData.totalSupply),
              color: "slate",
            },
            // {
            //   icon: (
            //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            //     </svg>
            //   ),
            //   label: "Circulating Supply",
            //   value: format(tokenData.circulatingSupply),
            //   color: "slate",
            // },
          ].map((stat, index) => (
            <div
              key={stat.label}
              className={`flex items-center justify-between p-4 rounded-xl transition-all duration-300 hover:scale-[1.02] ${
                stat.highlight
                  ? "bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/15"
                  : "bg-slate-950/30 hover:bg-slate-950/50"
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    stat.color === "cyan"
                      ? "bg-cyan-500/10 text-cyan-400"
                      : stat.color === "blue"
                      ? "bg-blue-500/10 text-blue-400"
                      : stat.color === "purple"
                      ? "bg-purple-500/10 text-purple-400"
                      : "bg-slate-500/10 text-slate-400"
                  }`}
                >
                  {stat.icon}
                </div>
                <span className="text-slate-300 font-medium text-sm">{stat.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {stat.label === "Liquidity" && (
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
                )}
                <span
                  className={`font-bold tabular-nums ${
                    stat.highlight ? "text-purple-400 text-lg" : "text-white"
                  }`}
                >
                  ${stat.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`https://basescan.org/token/${tokenData.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 p-4 bg-slate-900/40 hover:bg-cyan-500/20 border border-slate-700/50 hover:border-cyan-500/50 rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20"
        >
          <svg className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="font-bold text-sm text-slate-300 group-hover:text-cyan-400 transition-colors">
            VIEW ON BASESCAN
          </span>
        </a>

        <a
          href={`https://dexscreener.com/base/${tokenData.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 p-4 bg-slate-900/40 hover:bg-blue-500/20 border border-slate-700/50 hover:border-blue-500/50 rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
        >
          <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <span className="font-bold text-sm text-slate-300 group-hover:text-blue-400 transition-colors">
            VIEW CHART
          </span>
        </a>
      </div>

      {/* Info Notice */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-blue-300 text-xs leading-relaxed">
          Data is fetched from Moralis and DexScreener. Price changes are calculated from DEX pair data and may vary across different platforms.
        </p>
      </div>
    </div>
  );
}