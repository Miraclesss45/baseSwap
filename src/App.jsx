import "./App.css";
import { useState, useEffect } from "react";
import axios from "axios";
import WalletConnect from "./components/WalletConnect";
import TokenInfo from "./components/TokenInfo";
import Swap from "./components/Swap";

export default function App() {
  const [inputAddress, setInputAddress] = useState("");
  const [fetchedTokenAddress, setFetchedTokenAddress] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [message, setMessage] = useState("");
  const [ethPrice, setEthPrice] = useState(null);
  const [loading, setLoading] = useState(false);

  const MORALIS_API_KEY = import.meta.env.VITE_MORALIS_API_KEY;
  const BASE_CHAIN = "0x2105";

  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        setEthPrice(res.data?.ethereum?.usd ?? null);
      } catch {
        setEthPrice(null);
      }
    };
    fetchEthPrice();
    const t = setInterval(fetchEthPrice, 20000);
    return () => clearInterval(t);
  }, []);

  const convertSupply = (raw, decimals) => {
    if (!raw || raw === "0") return 0;
    try {
      const divisor = BigInt(10) ** BigInt(decimals - 6);
      const reduced = BigInt(raw) / divisor;
      return Number(reduced) / 1e6;
    } catch {
      return 0;
    }
  };

  const fetchToken = async () => {
    try {
      setMessage("");
      setTokenData(null);
      setFetchedTokenAddress(null);
      const address = inputAddress.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) { setMessage("Invalid token address."); return; }
      if (!MORALIS_API_KEY) { setMessage("Moralis API key missing."); return; }
      setLoading(true);

      const metadataRes = await axios.get(
        "https://deep-index.moralis.io/api/v2.2/erc20/metadata",
        { params: { chain: BASE_CHAIN, addresses: [address] }, headers: { "X-API-Key": MORALIS_API_KEY } }
      );
      const metadata = metadataRes.data?.[0];
      if (!metadata) throw new Error("Token not found");

      const decimals = Number(metadata.decimals) || 18;
      const totalSupply = convertSupply(metadata.total_supply, decimals);
      const circulatingSupply = convertSupply(metadata.circulating_supply || metadata.total_supply, decimals);

      const priceRes = await axios.get(
        `https://deep-index.moralis.io/api/v2.2/erc20/${address}/price`,
        { params: { chain: BASE_CHAIN }, headers: { "X-API-Key": MORALIS_API_KEY } }
      );
      const price = priceRes.data?.usdPrice || 0;

      const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      const pairs = dexRes.data?.pairs || [];
      const basePairs = pairs.filter((p) => p.chainId === "base");
      const bestPair = basePairs.length > 0
        ? basePairs.reduce((prev, cur) => (prev.liquidity?.usd || 0) > (cur.liquidity?.usd || 0) ? prev : cur)
        : null;

      const liquidityUsd = Number(bestPair?.liquidity?.usd || 0);
      const priceChange = bestPair?.priceChange || {};
      const fdv = totalSupply * price;
      const marketCap = circulatingSupply > 0 ? circulatingSupply * price : fdv;

      setTokenData({
        name: metadata.name, symbol: metadata.symbol, address, priceUsd: price,
        liquidityUsd, totalSupply, circulatingSupply, marketCap, fdv,
        change5m: Number(priceChange.m5 || 0), change1h: Number(priceChange.h1 || 0),
        change6h: Number(priceChange.h6 || 0), change24h: Number(priceChange.h24 || 0),
      });
      setFetchedTokenAddress(address);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setMessage("Failed to fetch token data.");
      setLoading(false);
    }
  };

  const isError = message.includes("Invalid") || message.includes("Failed") || message.includes("missing");

  return (
    <div className="font-sans min-h-screen bg-[#080b11] text-white overflow-x-hidden relative">

      {/* ── Ambient background glow ── */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Top-left orb */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }} />
        {/* Bottom-right orb */}
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        {/* Scanline texture */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
          }} />
      </div>

      {/* ════════════════════════════════════════
          HEADER
      ════════════════════════════════════════ */}
      <header className="relative z-50 sticky top-0">
        {/* Glassmorphism bar */}
        <div className="absolute inset-0 bg-[#080b11]/80 backdrop-blur-2xl border-b border-white/[0.04]" />
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, #22d3ee40, #3b82f660, #22d3ee40, transparent)" }} />

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between h-14 sm:h-16 lg:h-[68px]">

            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-8 lg:gap-10">
              {/* Logo */}
              <div className="flex items-center gap-2.5 cursor-pointer group select-none shrink-0">
                <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 shrink-0">
                  <div className="absolute inset-0 rounded-lg bg-cyan-500/20 blur-md group-hover:bg-cyan-500/40 transition-all duration-300" />
                  <div className="relative w-full h-full rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <span className="font-display text-lg sm:text-xl font-800 tracking-tight"
                  style={{ background: "linear-gradient(90deg, #22d3ee, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  baseSwap
                </span>
              </div>

              {/* Nav — desktop only */}
              <nav className="hidden lg:flex items-center">
                {[
                  { label: "Swap", href: "#swap", active: true },
                  { label: "Pools", href: "#pools" },
                  { label: "Analytics", href: "#analytics" },
                ].map(({ label, href, active }) => (
                  <a key={label} href={href}
                    className={`relative px-4 py-2 text-[11px] font-mono font-600 tracking-[0.15em] uppercase transition-colors duration-200 ${active ? "text-cyan-400" : "text-slate-500 hover:text-slate-200"}`}>
                    {active && (
                      <span className="absolute bottom-0 left-3 right-3 h-px"
                        style={{ background: "linear-gradient(90deg, transparent, #22d3ee, transparent)" }} />
                    )}
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Right: ETH price + Wallet */}
            <div className="flex items-center gap-2 sm:gap-3">
              {ethPrice && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:border-cyan-500/20 transition-all duration-200 cursor-default">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase">ETH</span>
                  <span className="font-mono text-xs sm:text-sm font-600 text-cyan-300 tabular-nums">
                    ${ethPrice.toLocaleString()}
                  </span>
                </div>
              )}
              <WalletConnect setMessage={setMessage} />
            </div>

          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════
          MAIN
      ════════════════════════════════════════ */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 lg:py-14">

        {/* ── Status Banner ── */}
        {message && (
          <div className={`mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-mono backdrop-blur-sm ${
            isError
              ? "bg-red-950/30 border-red-500/20 text-red-300"
              : "bg-cyan-950/30 border-cyan-500/20 text-cyan-300"
          }`}>
            <svg className={`w-4 h-4 shrink-0 mt-0.5 ${isError ? "text-red-400" : "text-cyan-400"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d={isError ? "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"} />
            </svg>
            <p className="flex-1 leading-relaxed">{message}</p>
            <button onClick={() => setMessage("")} className="text-slate-500 hover:text-white transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════
            TWO-PANEL LAYOUT — pure flex
            Mobile: column (stacked)
            Desktop: row (explorer | swap)
        ════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row items-start gap-5 lg:gap-7">

          {/* ──────────────────────────────────────
              LEFT PANEL — Token Explorer + Info
          ────────────────────────────────────── */}
          <div className="flex flex-col gap-5 w-full lg:flex-1 min-w-0">

            {/* Token Search Card */}
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
              {/* Card top accent */}
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, #22d3ee30, #3b82f650, #22d3ee30, transparent)" }} />

              <div className="p-5 sm:p-6 lg:p-7">
                {/* Card Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #06b6d420, #3b82f620)", border: "1px solid #22d3ee20" }}>
                      <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display text-base sm:text-lg font-700 text-white tracking-tight truncate">
                        Token Explorer
                      </h2>
                      <p className="font-mono text-[10px] text-slate-500 tracking-wider uppercase mt-0.5">
                        Base Network · ERC-20
                      </p>
                    </div>
                  </div>

                  {/* Base badge */}
                  <div className="hidden sm:flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-lg ml-3"
                    style={{ background: "#1d4ed815", border: "1px solid #3b82f625" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="font-mono text-[9px] text-blue-400 font-600 tracking-[0.2em] uppercase">Base</span>
                  </div>
                </div>

                {/* Input */}
                <div className="relative mb-3">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={inputAddress}
                    onChange={(e) => setInputAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !loading && fetchToken()}
                    placeholder="0x… token address"
                    className="font-mono w-full pl-10 pr-10 py-3 text-sm text-slate-200 placeholder-slate-600 rounded-xl transition-all duration-300 outline-none"
                    style={{
                      background: "#0d1117",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                    onFocus={(e) => { e.target.style.border = "1px solid rgba(34,211,238,0.35)"; e.target.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.06)"; }}
                    onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.07)"; e.target.style.boxShadow = "none"; }}
                  />
                  {inputAddress && (
                    <button onClick={() => setInputAddress("")}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-600 hover:text-slate-300 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  onClick={fetchToken}
                  disabled={loading || !inputAddress}
                  className={`relative w-full py-3 rounded-xl font-mono text-xs font-600 tracking-[0.15em] uppercase transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2.5 select-none overflow-hidden ${
                    loading || !inputAddress
                      ? "bg-white/[0.03] text-slate-600 cursor-not-allowed border border-white/[0.04]"
                      : "text-white border-0"
                  }`}
                  style={!loading && inputAddress ? {
                    background: "linear-gradient(135deg, #0891b2, #2563eb)",
                    boxShadow: "0 0 20px rgba(6,182,212,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                  } : {}}
                  onMouseEnter={(e) => {
                    if (!loading && inputAddress) e.currentTarget.style.boxShadow = "0 0 30px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && inputAddress) e.currentTarget.style.boxShadow = "0 0 20px rgba(6,182,212,0.2), inset 0 1px 0 rgba(255,255,255,0.1)";
                  }}
                >
                  {/* Shimmer overlay */}
                  {!loading && inputAddress && (
                    <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
                      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08), transparent)" }} />
                  )}
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Analyzing Token…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>Fetch Token Data</span>
                    </>
                  )}
                </button>

                {/* Helper */}
                <div className="mt-4 pt-4 flex items-start gap-2 text-slate-600"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <svg className="w-3 h-3 shrink-0 mt-0.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-mono text-[10px] leading-relaxed tracking-wide">
                    Paste a valid Base ERC-20 address. Data sourced live from Moralis + DexScreener.
                  </p>
                </div>
              </div>
            </div>
            {/* END Search Card */}

            {/* Token Info */}
            {tokenData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                <TokenInfo tokenData={tokenData} />
              </div>
            )}

            {/* Empty State */}
            {!tokenData && !loading && (
              <div className="flex flex-col items-center justify-center px-6 py-16 sm:py-20 rounded-2xl text-center"
                style={{ background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.06)" }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p className="font-display text-sm font-600 text-slate-600 mb-1">No Token Selected</p>
                <p className="font-mono text-[11px] text-slate-700 leading-relaxed max-w-[220px]">
                  Enter a contract address above to begin
                </p>
              </div>
            )}

          </div>
          {/* END Left Panel */}

          {/* ──────────────────────────────────────
              RIGHT PANEL — Swap (sticky on desktop)
          ────────────────────────────────────── */}
          <div className="w-full lg:w-[380px] xl:w-[400px] shrink-0 lg:sticky lg:top-[84px]">
            <Swap
              tokenAddress={fetchedTokenAddress}
              tokenData={tokenData}
              ethPrice={ethPrice}
            />
          </div>
          {/* END Right Panel */}

        </div>
        {/* END Two-Panel Layout */}

        {/* ════════════════════════════════════════
            FEATURE CARDS — pure flex wrap
        ════════════════════════════════════════ */}
        <div className="flex flex-wrap gap-4 mt-14 sm:mt-16 lg:mt-20">
          {[
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              ),
              color: "#22d3ee",
              colorBg: "#22d3ee10",
              label: "Lightning Fast",
              desc: "Execute swaps on Base L2 instantly — near-zero latency, minimal gas.",
            },
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              ),
              color: "#60a5fa",
              colorBg: "#3b82f610",
              label: "Non-Custodial",
              desc: "Your keys, your tokens. We never hold your assets — ever.",
            },
            {
              icon: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              ),
              color: "#a78bfa",
              colorBg: "#7c3aed10",
              label: "Live Analytics",
              desc: "Real-time prices, liquidity depth, and 24h metrics pulled from DexScreener.",
            },
          ].map(({ icon, color, colorBg, label, desc }) => (
            <div key={label}
              className="group relative flex-1 min-w-[260px] rounded-2xl p-5 sm:p-6 cursor-default transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
              onMouseEnter={(e) => { e.currentTarget.style.border = `1px solid ${color}25`; }}
              onMouseLeave={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.05)"; }}
            >
              {/* top shimmer */}
              <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />

              {/* Icon */}
              <div className="flex items-center justify-center w-10 h-10 rounded-xl mb-4 transition-all duration-300 group-hover:scale-110"
                style={{ background: colorBg, border: `1px solid ${color}20` }}>
                <svg className="w-5 h-5" fill="none" stroke={color} viewBox="0 0 24 24">
                  {icon}
                </svg>
              </div>

              <h3 className="font-display text-sm font-700 text-white mb-2 tracking-tight">{label}</h3>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed tracking-wide">{desc}</p>
            </div>
          ))}
        </div>
        {/* END Feature Cards */}

      </main>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer className="relative z-10 mt-16 lg:mt-20"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-7">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">

            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #06b6d4, #2563eb)" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] text-slate-600 tracking-wider">baseSwap © 2024</span>
            </div>

            {/* Footer links */}
            <div className="flex flex-wrap justify-center items-center gap-5 sm:gap-6">
              {["Documentation", "GitHub", "Discord", "Twitter"].map((link) => (
                <a key={link} href="#"
                  className="font-mono text-[11px] text-slate-600 hover:text-cyan-400 transition-colors duration-200 tracking-wider uppercase">
                  {link}
                </a>
              ))}
            </div>

          </div>
        </div>
      </footer>

    </div>
  );
}