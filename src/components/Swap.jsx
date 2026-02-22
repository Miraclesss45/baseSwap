// src/components/Swap.jsx
//
// ⚠️  RPC — set a dedicated provider in your wagmi config (see main.jsx).
//     The public Base RPC is heavily rate-limited. Use Alchemy/QuickNode/Infura.
//
// ⚠️  1INCH API KEY — add to .env:
//     VITE_ONEINCH_API_KEY=your_key_here
//     Get a free key at https://portal.1inch.dev
//
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LuArrowUpDown, LuSettings2, LuZap, LuTriangleAlert as LuAlertTriangle, LuClock } from "react-icons/lu";
import {
  useAccount,
  useBalance,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import { parseEther, parseUnits, formatEther, formatUnits, getAddress } from "viem";
import ERC20ABI from "../abis/ERC20.json";

// ─── 1inch Constants ──────────────────────────────────────────────────────────
const ONEINCH_ROUTER           = getAddress("0x111111125421cA6dc452d289314280a0f8842A65");
const ONEINCH_API              = "https://api.1inch.dev/swap/v6.0/8453"; // Base chain id = 8453
const ONEINCH_API_KEY          = import.meta.env.VITE_ONEINCH_API_KEY;
const NATIVE_ETH               = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const DEFAULT_GAS_EST          = "0.005";
const GAS_ESTIMATE_DEBOUNCE_MS = 600;
const GAS_BUFFER_MULTIPLIER    = 1.5;

// ETH logo data URI
const ETH_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23627EEA'/%3E%3Cg fill='%23FFF' fill-rule='nonzero'%3E%3Cpath fill-opacity='.602' d='M16.498 4v8.87l7.497 3.35z'/%3E%3Cpath d='M16.498 4L9 16.22l7.498-3.35z'/%3E%3Cpath fill-opacity='.602' d='M16.498 21.968v6.027L24 17.616z'/%3E%3Cpath d='M16.498 27.995v-6.028L9 17.616z'/%3E%3Cpath fill-opacity='.2' d='M16.498 20.573l7.497-4.353-7.497-3.348z'/%3E%3Cpath fill-opacity='.602' d='M9 16.22l7.498 4.353v-7.701z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

// ─── Utilities ────────────────────────────────────────────────────────────────

const formatMaxBalance = (balance) => {
  try {
    const str = balance.toString();
    return str.includes('.') ? str.replace(/\.?0+$/, '') : str;
  } catch { return "0"; }
};

const toSafeDecimalString = (num, maxDecimals = 20) => {
  if (!isFinite(num) || num === 0) return "0";
  return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
};

const truncateDecimals = (str, maxDecimals) => {
  if (!str || !str.includes('.')) return str || "0";
  const [whole, frac = ""] = str.split('.');
  return frac.length > maxDecimals ? `${whole}.${frac.slice(0, maxDecimals)}` : str;
};

// ─── 1inch API ────────────────────────────────────────────────────────────────

const oneinchHeaders = () => ({
  "Content-Type": "application/json",
  ...(ONEINCH_API_KEY ? { Authorization: `Bearer ${ONEINCH_API_KEY}` } : {}),
});

/**
 * Fetch a quote from 1inch v6.
 * Returns { dstAmount: string (wei), estimatedGas: number } or null on error.
 */
const fetchOneinchQuote = async ({ srcToken, dstToken, amount }) => {
  try {
    const params = new URLSearchParams({
      src:        srcToken,
      dst:        dstToken,
      amount:     amount.toString(),
      includeGas: "true",
    });
    const res  = await fetch(`${ONEINCH_API}/quote?${params}`, { headers: oneinchHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { dstAmount: data.dstAmount, estimatedGas: data.gas ?? 250000 };
  } catch {
    return null;
  }
};

/**
 * Fetch the executable swap transaction from 1inch v6.
 * Returns the tx object or throws a descriptive error.
 */
const fetchOneinchSwap = async ({ srcToken, dstToken, amount, fromAddress, slippage }) => {
  const params = new URLSearchParams({
    src:      srcToken,
    dst:      dstToken,
    amount:   amount.toString(),
    from:     fromAddress,
    slippage: slippage.toString(),
    origin:   fromAddress,
  });
  const res  = await fetch(`${ONEINCH_API}/swap?${params}`, { headers: oneinchHeaders() });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.description || data.error || "1inch swap request failed");
  }
  return data.tx; // { to, data, value, gasPrice, gas }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TokenPill({ isEth, symbol, logoUrl }) {
  const [imgError, setImgError] = useState(false);
  const label      = isEth ? "ETH" : symbol || "TOKEN";
  const initials   = isEth ? "Ξ" : label.slice(0, 2).toUpperCase();
  const bgGradient = isEth ? "from-[#627eea] to-[#8fa4f2]" : "from-cyan-500 to-blue-500";
  const displayLogo = isEth ? ETH_LOGO : logoUrl;
  const showImage   = displayLogo && !imgError;

  return (
    <div className="flex items-center gap-2 shrink-0 px-3 py-2 sm:py-1.5 rounded-full border border-white/[0.07] bg-white/[0.04]">
      {showImage ? (
        <img src={displayLogo} alt={label}
          className="w-6 h-6 rounded-full shrink-0 object-cover"
          onError={() => setImgError(true)} />
      ) : (
        <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold font-mono shrink-0 bg-gradient-to-br ${bgGradient} text-white`}>
          {initials}
        </span>
      )}
      <span className="font-mono text-sm sm:text-xs font-semibold text-white tracking-wide">{label}</span>
    </div>
  );
}

function StatRow({ label, value, accent = "cyan", shortLabel }) {
  const colorMap = {
    cyan:   "text-cyan-400",
    green:  "text-emerald-400",
    orange: "text-amber-400",
    red:    "text-red-400",
    muted:  "text-slate-500",
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[11px] sm:text-[10px] text-slate-500 tracking-widest uppercase">
        <span className="sm:hidden">{shortLabel || label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={`font-mono text-xs sm:text-[11px] font-semibold tabular-nums ${colorMap[accent] ?? colorMap.cyan}`}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ type, children }) {
  const map = {
    success: "bg-emerald-950/60 border-emerald-500/25 text-emerald-300",
    error:   "bg-red-950/60 border-red-500/25 text-red-300",
    warn:    "bg-amber-950/60 border-amber-500/25 text-amber-300",
    info:    "bg-blue-950/60 border-blue-500/25 text-blue-300",
  };
  const icon = { success: "✓", error: "⚠", warn: "⚠", info: "ℹ" };
  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-[11px] font-mono leading-relaxed ${map[type]}`}>
      <span className="shrink-0 mt-px">{icon[type]}</span>
      <span className="break-words">{children}</span>
    </div>
  );
}

function InputBox({ label, value, onChange, readOnly, isEth, symbol, usd, balance,
                    showBalance, dimmed, logoUrl, onMaxClick, showMax, quoteLoading }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`px-5 py-4 sm:px-4 sm:py-3.5 rounded-xl transition-all duration-200 bg-white/[0.025] border ${
      focused && !readOnly ? "border-cyan-400/35 ring-2 ring-cyan-400/[0.06]" : "border-white/[0.06]"
    }`}>
      <span className="font-mono text-[11px] sm:text-[10px] text-slate-600 tracking-[0.15em] uppercase mb-2 block">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          min="0"
          value={value}
          placeholder={quoteLoading ? "…" : "0.0"}
          readOnly={readOnly}
          onFocus={() => !readOnly && setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={onChange ? (e) => {
            const val = e.target.value;
            if (val === "" || parseFloat(val) >= 0) onChange(val);
          } : undefined}
          onKeyDown={(e) => {
            if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
          }}
          className={`flex-1 min-w-0 bg-transparent outline-none border-none font-mono
            text-lg sm:text-xl md:text-2xl font-bold tabular-nums leading-none
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            ${dimmed ? "text-slate-400" : "text-white"} placeholder-slate-700`}
        />
        {quoteLoading && readOnly && (
          <div className="w-3.5 h-3.5 rounded-full border border-white/10 border-t-cyan-400 animate-spin shrink-0 mr-2" />
        )}
        <TokenPill isEth={isEth} symbol={symbol} logoUrl={logoUrl} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="font-mono text-[11px] sm:text-[10px] text-slate-600">{usd}</span>
        {showBalance && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] sm:text-[10px] text-slate-600 tabular-nums">
              Bal: <span className="text-cyan-400 font-semibold">{balance}</span>
            </span>
            {showMax && onMaxClick && (
              <button
                onClick={onMaxClick}
                className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold tracking-wider uppercase transition-all duration-150 bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-400/20 active:scale-95"
              >
                MAX
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SwapButton({ btnStyle, label, disabled, onClick }) {
  const [hovered, setHovered] = useState(false);
  const variants = {
    ready: {
      base:      "text-[#001f14] bg-gradient-to-br from-[#00c98a] to-[#00e5a0]",
      shadow:    hovered ? "shadow-[0_6px_32px_rgba(0,229,160,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]"
                         : "shadow-[0_4px_24px_rgba(0,229,160,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]",
      transform: hovered ? "-translate-y-px" : "",
    },
    disabled: { base: "text-slate-600 cursor-not-allowed bg-white/[0.03] border border-white/[0.05]", shadow: "", transform: "" },
    danger:   { base: "text-red-400 cursor-not-allowed bg-red-500/[0.08] border border-red-500/20",   shadow: "", transform: "" },
    loading:  { base: "text-slate-500 cursor-not-allowed bg-white/[0.03] border border-white/[0.05]", shadow: "", transform: "" },
  };
  const v = variants[btnStyle] ?? variants.disabled;
  return (
    <button
      className={`relative w-full py-4 sm:py-3.5 rounded-xl font-mono text-sm sm:text-xs font-bold
        tracking-wider sm:tracking-[0.1em] uppercase transition-all duration-200
        flex items-center justify-center gap-2.5 select-none overflow-hidden active:scale-[0.98]
        ${v.base} ${v.shadow} ${v.transform}`}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => btnStyle === "ready" && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {btnStyle === "ready" && <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.06] to-transparent" />}
      {btnStyle === "loading" && <div className="w-3.5 h-3.5 rounded-full border border-white/10 border-t-slate-400 animate-spin shrink-0" />}
      {btnStyle === "ready" && <LuZap size={14} className="shrink-0 relative" />}
      <span className="relative">{label}</span>
    </button>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, swapDetails }) {
  if (!isOpen) return null;
  const { fromAmount, fromSymbol, toAmount, toSymbol, priceImpact, gasEstimate } = swapDetails;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0a0f1a] border border-white/[0.06] p-6 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl font-bold text-white">Confirm Swap</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 mb-6">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="font-mono text-xs text-slate-500 mb-2">You Pay</p>
            <p className="font-mono text-2xl font-bold text-white">{fromAmount} {fromSymbol}</p>
          </div>
          <div className="flex justify-center">
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <LuArrowUpDown className="text-slate-500" size={16} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <p className="font-mono text-xs text-slate-500 mb-2">You Receive (estimated)</p>
            <p className="font-mono text-2xl font-bold text-cyan-400">≈ {toAmount} {toSymbol}</p>
          </div>
          <div className="space-y-2 p-4 rounded-xl bg-white/[0.015] border border-white/[0.04]">
            <div className="flex justify-between">
              <span className="font-mono text-xs text-slate-500">Price Impact</span>
              <span className={`font-mono text-xs font-bold ${priceImpact > 5 ? 'text-red-400' : priceImpact > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {priceImpact.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-xs text-slate-500">Network Fee</span>
              <span className="font-mono text-xs text-slate-400">~{gasEstimate} ETH</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-xs text-slate-500">Routed via</span>
              <span className="font-mono text-xs text-indigo-400 font-semibold">1inch</span>
            </div>
          </div>
          {priceImpact > 5 && (
            <StatusBadge type="warn">
              <LuAlertTriangle className="inline w-4 h-4 mr-1" />
              High price impact! You may receive significantly less.
            </StatusBadge>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-mono text-sm font-bold text-slate-400 border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-mono text-sm font-bold text-[#001f14] bg-gradient-to-br from-[#00c98a] to-[#00e5a0] hover:from-[#00b87d] hover:to-[#00d393] shadow-lg shadow-emerald-500/20 transition-all"
          >
            Confirm Swap
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ isOpen, onClose, slippage, setSlippage, deadline, setDeadline }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0a0f1a] border border-white/[0.06] p-6 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl font-bold text-white">Settings</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-6">
          {/* Slippage */}
          <div>
            <label className="font-mono text-sm text-slate-400 mb-3 block">Slippage Tolerance</label>
            <div className="flex items-center gap-2 mb-3">
              {[0.1, 0.5, 1].map((p) => (
                <button
                  key={p}
                  onClick={() => setSlippage(p)}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-mono text-sm font-semibold transition-all duration-150 ${
                    slippage === p
                      ? "bg-cyan-400/10 border border-cyan-400/30 text-cyan-400"
                      : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:border-white/[0.12]"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <input
                type="number" min="0" max="50" step="0.1" value={slippage}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setSlippage(v); }}
                onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }}
                className="flex-1 bg-transparent outline-none font-mono text-sm font-bold text-white"
              />
              <span className="font-mono text-sm text-amber-400 font-bold">%</span>
            </div>
            {slippage > 5 && (
              <p className="mt-2 font-mono text-xs text-amber-400">⚠️ High slippage increases MEV risk</p>
            )}
          </div>

          {/* Deadline (informational — 1inch manages its own deadline internally) */}
          <div>
            <label className="font-mono text-sm text-slate-400 mb-3 flex items-center gap-2">
              <LuClock size={14} />
              Transaction Deadline
            </label>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <input
                type="number" min="5" max="60" value={deadline}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 5 && v <= 60) setDeadline(v); }}
                className="flex-1 bg-transparent outline-none font-mono text-sm font-bold text-white"
              />
              <span className="font-mono text-sm text-slate-400">minutes</span>
            </div>
            <p className="mt-2 font-mono text-xs text-slate-500">
              For reference — 1inch manages the deadline in the generated calldata.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl font-mono text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-500 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Swap({ tokenAddress, tokenData, ethPrice: appEthPrice }) {
  const { address, isConnected, chain } = useAccount();

  let checksummed = null;
  try { checksummed = tokenAddress ? getAddress(tokenAddress) : null; } catch { checksummed = null; }

  // ── Balances ────────────────────────────────────────────────────────────────
  const { data: ethBalData, refetch: refetchEth, isError: ethBalError } = useBalance({
    address,
    chainId: base.id,
    query: { enabled: !!address && isConnected, refetchInterval: 30_000, staleTime: 15_000, gcTime: 60_000 },
  });

  const { data: tokBalData, refetch: refetchTok, isError: tokBalError } = useBalance({
    address,
    token: checksummed ?? undefined,
    chainId: base.id,
    query: { enabled: !!address && isConnected && !!checksummed, refetchInterval: 30_000, staleTime: 15_000, gcTime: 60_000 },
  });

  const userEthBalance   = Number(ethBalData?.formatted ?? 0);
  const userTokenBalance = Number(tokBalData?.formatted ?? 0);

  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient           = usePublicClient({ chainId: base.id });
  const { switchChain }        = useSwitchChain();

  // ── State ───────────────────────────────────────────────────────────────────
  const [ethAmount,         setEthAmount]         = useState("");
  const [tokenAmount,       setTokenAmount]       = useState("");
  const [reversed,          setReversed]          = useState(false);
  const [slippage,          setSlippage]          = useState(0.5);
  const [deadline,          setDeadline]          = useState(20);
  const [loading,           setLoading]           = useState(false);
  const [quoteLoading,      setQuoteLoading]      = useState(false);
  const [estimatedGas,      setEstimatedGas]      = useState("0");
  const [ethPrice,          setEthPrice]          = useState(appEthPrice || null);
  const [insufficientToken, setInsufficientToken] = useState(false);
  const [successMsg,        setSuccessMsg]        = useState("");
  const [errorMsg,          setErrorMsg]          = useState("");
  const [tokenLogo,         setTokenLogo]         = useState(null);
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // FIX: suppressNextQuoteRef prevents the quote effect from re-triggering when
  // WE set the output field (e.g. setTokenAmount from quote result), as opposed
  // to when the USER edits the input. Without this, every quote fires twice.
  const suppressNextQuoteRef = useRef(false);

  const tokenSymbol    = tokenData?.symbol   ?? "TOKEN";
  const tokenName      = tokenData?.name     ?? "Token";
  const actualDecimals = tokBalData?.decimals ?? tokenData?.decimals ?? 18;
  const tokenPriceUsd  = Number(tokenData?.priceUsd) || null;
  const isCorrectNetwork = chain?.id === base.id;

  // ── Side effects ────────────────────────────────────────────────────────────

  // Token logo
  useEffect(() => {
    setTokenLogo(tokenData?.logo || tokenData?.dexLogo || null);
  }, [checksummed, tokenData]);

  // ETH price from parent
  useEffect(() => {
    if (appEthPrice) setEthPrice(appEthPrice);
  }, [appEthPrice]);

  // Insufficient token balance check
  useEffect(() => {
    setInsufficientToken(reversed && !!tokenAmount && Number(tokenAmount) > userTokenBalance);
  }, [reversed, tokenAmount, userTokenBalance]);

  // ── 1inch Quote (debounced) ─────────────────────────────────────────────────
  //
  // BUG FIX: The original code depended on both ethAmount and tokenAmount.
  // When the quote set the output field (e.g. setTokenAmount), it triggered
  // this effect AGAIN, causing a second API call per keystroke.
  //
  // Fix: suppressNextQuoteRef acts as a one-shot gate.
  //   • When WE set the output → suppressNextQuoteRef = true
  //   • On next effect run (from that state change) → we see true, set false, return early
  //   • No double-fetch.
  //
  useEffect(() => {
    // Gate: if WE just set the output, skip this run
    if (suppressNextQuoteRef.current) {
      suppressNextQuoteRef.current = false;
      return;
    }

    const inputAmt = reversed ? tokenAmount : ethAmount;

    // FIX: moved validity check BEFORE setQuoteLoading(true) to avoid
    // briefly showing "Fetching Quote..." when input is empty/invalid
    if (!checksummed || !isConnected || !isCorrectNetwork || !inputAmt || Number(inputAmt) <= 0) {
      // Clear output when input is cleared
      suppressNextQuoteRef.current = true;
      if (reversed) setEthAmount("");
      else          setTokenAmount("");
      setEstimatedGas("0");
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);

    const timer = setTimeout(async () => {
      try {
        const srcToken  = reversed ? checksummed : NATIVE_ETH;
        const dstToken  = reversed ? NATIVE_ETH   : checksummed;
        const amountWei = reversed
          ? parseUnits(truncateDecimals(inputAmt, actualDecimals), actualDecimals).toString()
          : parseEther(inputAmt).toString();

        const quote = await fetchOneinchQuote({ srcToken, dstToken, amount: amountWei });

        if (cancelled) return;

        if (!quote) {
          setEstimatedGas(DEFAULT_GAS_EST);
          setQuoteLoading(false);
          return;
        }

        // Set output — arm the suppress gate BEFORE calling setState so the
        // subsequent effect re-run is a no-op
        suppressNextQuoteRef.current = true;
        if (reversed) {
          setEthAmount(formatEther(BigInt(quote.dstAmount)).replace(/\.?0+$/, ''));
        } else {
          setTokenAmount(formatUnits(BigInt(quote.dstAmount), actualDecimals).replace(/\.?0+$/, ''));
        }

        // Estimate gas cost in ETH
        try {
          const gasPrice = await publicClient.getGasPrice();
          setEstimatedGas(Number(formatEther(BigInt(quote.estimatedGas) * gasPrice)).toFixed(6));
        } catch {
          setEstimatedGas(DEFAULT_GAS_EST);
        }
      } catch {
        if (!cancelled) setEstimatedGas(DEFAULT_GAS_EST);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, GAS_ESTIMATE_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [
    ethAmount,
    tokenAmount,
    reversed,
    checksummed,
    isConnected,
    isCorrectNetwork,
    actualDecimals,
    publicClient,
  ]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const outputAmount = reversed ? ethAmount   : tokenAmount;
  const outputSymbol = reversed ? "ETH"       : tokenSymbol;

  const minReceived = useMemo(() => {
    if (!outputAmount || Number(outputAmount) <= 0) return "0";
    return toSafeDecimalString(Number(outputAmount) * (1 - slippage / 100), 18);
  }, [outputAmount, slippage]);

  const minReceivedDisplay = minReceived !== "0" ? minReceived.replace(/\.?0+$/, '') : "0";

  const priceImpact = useMemo(() => {
    if (!outputAmount || !tokenPriceUsd || !ethPrice) return 0;
    try {
      const inputUsd  = reversed ? Number(tokenAmount) * tokenPriceUsd : Number(ethAmount) * ethPrice;
      const outputUsd = reversed ? Number(ethAmount) * ethPrice         : Number(tokenAmount) * tokenPriceUsd;
      if (inputUsd === 0) return 0;
      return Math.abs(((inputUsd - outputUsd) / inputUsd) * 100);
    } catch { return 0; }
  }, [ethAmount, tokenAmount, ethPrice, tokenPriceUsd, reversed]);

  const totalEthNeeded = reversed
    ? Number(estimatedGas) * GAS_BUFFER_MULTIPLIER
    : Number(ethAmount || 0) + Number(estimatedGas) * GAS_BUFFER_MULTIPLIER;

  const insufficientEth = isConnected && totalEthNeeded > userEthBalance && totalEthNeeded > 0;

  const ethUsdVal   = ethAmount && ethPrice
    ? `≈ $${(Number(ethAmount) * ethPrice).toFixed(2)}` : "";
  const tokenUsdVal = tokenAmount && tokenPriceUsd
    ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toFixed(2)}` : "";

  // ── Transaction history ──────────────────────────────────────────────────────
  const saveTxToHistory = useCallback((hash, type) => {
    try {
      const tx = { hash, timestamp: Date.now(), type, tokenAddress: checksummed, tokenSymbol,
                   amountIn: reversed ? tokenAmount : ethAmount,
                   amountOut: reversed ? ethAmount : tokenAmount, status: 'success' };
      const prev = (() => { try { return JSON.parse(localStorage.getItem('swap_history') || '[]'); } catch { return []; } })();
      localStorage.setItem('swap_history', JSON.stringify([tx, ...prev].slice(0, 20)));
    } catch {}
  }, [checksummed, tokenSymbol, reversed, tokenAmount, ethAmount]);

  // ── ERC-20 Approve ───────────────────────────────────────────────────────────
  // FIX: Removed setLoading calls from approveToken. This function is called
  // from inside executeSwap's try block — if approveToken called setLoading(false)
  // on success, the loading indicator disappeared mid-swap (while the actual swap
  // tx was still being submitted). Now executeSwap's finally block handles it.
  const approveToken = async (amount) => {
    setSuccessMsg("Requesting token approval…");
    const hash = await walletClient.writeContract({
      address: checksummed,
      abi: ERC20ABI,
      functionName: "approve",
      args: [ONEINCH_ROUTER, amount],
    });
    setSuccessMsg(`Approval pending · ${hash.slice(0, 10)}…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error("Approval transaction reverted");
    setSuccessMsg("Token approved ✓");
    // Brief pause so user can read "approved" before it's replaced by swap status
    await new Promise((r) => setTimeout(r, 800));
  };

  // ── Execute Swap via 1inch ───────────────────────────────────────────────────
  const executeSwap = async () => {
    setErrorMsg("");

    // Guard checks
    if (!isConnected)                { setErrorMsg("Connect wallet first"); return; }
    if (!isCorrectNetwork)           { await switchChain({ chainId: base.id }); return; }
    if (!ethAmount && !tokenAmount)  { setErrorMsg("Enter an amount"); return; }
    if (!walletClient || !publicClient) { setErrorMsg("Wallet not ready"); return; }
    if ((reversed ? Number(tokenAmount) : Number(ethAmount)) <= 0) { setErrorMsg("Amount must be > 0"); return; }
    if (insufficientEth)             { setErrorMsg(`Need ${totalEthNeeded.toFixed(6)} ETH (including gas)`); return; }
    if (insufficientToken)           { setErrorMsg(`Insufficient ${tokenSymbol}`); return; }

    try {
      setLoading(true);
      setSuccessMsg("");
      setErrorMsg("");

      const srcToken  = reversed ? checksummed : NATIVE_ETH;
      const dstToken  = reversed ? NATIVE_ETH   : checksummed;
      const amountWei = reversed
        ? parseUnits(truncateDecimals(tokenAmount, actualDecimals), actualDecimals).toString()
        : parseEther(ethAmount).toString();

      // For token→ETH: check allowance and approve if needed
      if (reversed) {
        const allowance = await publicClient.readContract({
          address: checksummed,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address, ONEINCH_ROUTER],
        });
        if (BigInt(allowance) < BigInt(amountWei)) {
          await approveToken(BigInt(amountWei)); // throws on failure, loading state managed by finally
        }
      }

      // Fetch swap tx from 1inch
      const swapTx = await fetchOneinchSwap({ srcToken, dstToken, amount: amountWei, fromAddress: address, slippage });

      // Broadcast transaction
      const hash = await walletClient.sendTransaction({
        to:       swapTx.to,
        data:     swapTx.data,
        value:    BigInt(swapTx.value ?? "0"),
        gas:      BigInt(Math.ceil(Number(swapTx.gas) * 1.25)), // 25% buffer
        gasPrice: BigInt(swapTx.gasPrice),
      });

      setSuccessMsg(`Submitted · ${hash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

      if (receipt.status === "success") {
        setSuccessMsg("Swap successful ✓");
        saveTxToHistory(hash, reversed ? 'TOKEN_TO_ETH' : 'ETH_TO_TOKEN');
        // Clear inputs — arm suppress so clearing doesn't trigger a quote
        suppressNextQuoteRef.current = true;
        setEthAmount("");
        setTokenAmount("");
        refetchEth();
        if (checksummed) refetchTok();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        throw new Error("Transaction reverted on-chain");
      }
    } catch (err) {
      let msg = "Swap failed";
      if      (err?.message?.includes("rejected"))                                     msg = "Transaction rejected";
      else if (err?.message?.includes("slippage") || err?.message?.includes("INSUFFICIENT_OUTPUT")) msg = "Price moved — try higher slippage";
      else if (err?.message?.includes("timeout"))                                      msg = "Transaction timed out";
      else if (err?.message?.includes("Approval"))                                     msg = "Approval failed or rejected";
      else if (err?.message)                                                            msg = err.message.slice(0, 80);
      setErrorMsg(msg);
      setSuccessMsg("");
    } finally {
      // FIX: single setLoading(false) here, not scattered across approveToken too
      setLoading(false);
      setShowConfirmModal(false);
    }
  };

  const handleSwapClick = () => {
    if (Number(ethAmount) > 0.5 || Number(tokenAmount) > 1000 || priceImpact > 3) {
      setShowConfirmModal(true);
    } else {
      executeSwap();
    }
  };

  const formatBalance = (bal) => bal.toFixed(6);

  const handleMaxClick = (boxType) => {
    suppressNextQuoteRef.current = false; // user is editing — allow quote
    if (boxType === 'top') {
      if (reversed) {
        setTokenAmount(formatMaxBalance(userTokenBalance));
        setEthAmount("");
      } else {
        const gasBuffer = Math.max(Number(estimatedGas) * GAS_BUFFER_MULTIPLIER, 0.005);
        setEthAmount(formatMaxBalance(Math.max(0, userEthBalance - gasBuffer)));
        setTokenAmount("");
      }
    } else {
      if (reversed) {
        const gasBuffer = Math.max(Number(estimatedGas) * GAS_BUFFER_MULTIPLIER, 0.005);
        setEthAmount(formatMaxBalance(Math.max(0, userEthBalance - gasBuffer)));
        setTokenAmount("");
      } else {
        setTokenAmount(formatMaxBalance(userTokenBalance));
        setEthAmount("");
      }
    }
  };

  // ── Input box configs ────────────────────────────────────────────────────────
  const top = {
    isEth:    !reversed,
    symbol:   reversed ? tokenSymbol : "ETH",
    logoUrl:  reversed ? tokenLogo : null,
    value:    reversed ? tokenAmount : ethAmount,
    usd:      reversed ? tokenUsdVal : ethUsdVal,
    balance:  reversed ? `${formatBalance(userTokenBalance)} ${tokenSymbol}` : `${formatBalance(userEthBalance)} ETH`,
    onChange: (v) => {
      suppressNextQuoteRef.current = false; // user is typing
      if (reversed) { setTokenAmount(v); setEthAmount(""); }
      else          { setEthAmount(v); setTokenAmount(""); }
    },
    onMaxClick: () => handleMaxClick('top'),
    showMax: true,
  };

  const bot = {
    isEth:    reversed,
    symbol:   reversed ? "ETH" : tokenSymbol,
    logoUrl:  reversed ? null : tokenLogo,
    value:    reversed ? ethAmount : tokenAmount,
    usd:      reversed ? ethUsdVal : tokenUsdVal,
    balance:  reversed ? `${formatBalance(userEthBalance)} ETH` : `${formatBalance(userTokenBalance)} ${tokenSymbol}`,
    onMaxClick: () => handleMaxClick('bottom'),
    showMax: true,
  };

  // ── Button state ─────────────────────────────────────────────────────────────
  let btnStyle = "disabled", btnLabel = "Enter Amount";

  if      (loading)                                    { btnStyle = "loading";  btnLabel = "Processing…"; }
  else if (quoteLoading)                               { btnStyle = "loading";  btnLabel = "Fetching Quote…"; }
  else if (!isConnected)                               { btnStyle = "disabled"; btnLabel = "Connect Wallet"; }
  else if (!isCorrectNetwork)                          { btnStyle = "danger";   btnLabel = "Switch to Base"; }
  else if (!outputAmount || Number(outputAmount) <= 0) { btnStyle = "disabled"; btnLabel = "Enter Amount"; }
  else if (priceImpact > 15)                           { btnStyle = "danger";   btnLabel = `Price Impact Too High (${priceImpact.toFixed(1)}%)`; }
  else if (insufficientEth)                            { btnStyle = "danger";   btnLabel = "Insufficient ETH (including gas)"; }
  else if (insufficientToken)                          { btnStyle = "danger";   btnLabel = `Insufficient ${tokenSymbol}`; }
  else                                                 { btnStyle = "ready";    btnLabel = `Swap ${reversed ? tokenSymbol : "ETH"} → ${reversed ? "ETH" : tokenSymbol}`; }

  const btnDisabled =
    loading || quoteLoading || !isConnected || !isCorrectNetwork ||
    !outputAmount || Number(outputAmount) <= 0 ||
    insufficientEth || insufficientToken || priceImpact > 15;

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!checksummed) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:py-16 rounded-2xl text-center bg-white/[0.01] border border-dashed border-white/[0.06]">
        <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-3 bg-white/[0.03] border border-white/[0.06]">
          <LuArrowUpDown className="text-slate-700" size={20} />
        </div>
        <p className="font-display text-sm font-semibold text-slate-600 mb-1">Swap Interface</p>
        <p className="font-mono text-xs sm:text-[10px] text-slate-700 leading-relaxed max-w-[200px]">
          Fetch a token above to enable swapping
        </p>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative rounded-2xl overflow-hidden w-full bg-[#0a0f1a] border border-white/[0.06]">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 via-blue-500/50 via-cyan-500/30 to-transparent" />
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full pointer-events-none blur-3xl opacity-[0.06] bg-[radial-gradient(ellipse,#22d3ee,transparent)]" />

        <div className="relative p-6 sm:p-5 md:p-6 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg sm:text-base font-bold text-white tracking-tight">Swap</h2>
              <p className="font-mono text-[11px] sm:text-[10px] text-slate-600 tracking-widest uppercase mt-0.5">
                {tokenData ? `${tokenName} / ETH · Base` : "Base Network"}
              </p>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
              className="flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg text-slate-600 hover:text-cyan-400 transition-colors duration-200 border border-white/[0.06] bg-white/[0.02]"
            >
              <LuSettings2 size={16} className="sm:w-[15px] sm:h-[15px]" />
            </button>
          </div>

          {/* Wrong network alert */}
          {isConnected && !isCorrectNetwork && (
            <div className="flex flex-col items-center gap-3 px-4 py-3 rounded-xl text-center bg-red-500/[0.08] border border-red-500/20">
              <p className="font-mono text-xs sm:text-[11px] text-red-400 tracking-wide">
                Connected to <strong>{chain?.name || "wrong network"}</strong>
              </p>
              <button
                onClick={() => switchChain({ chainId: base.id })}
                className="px-5 py-2 sm:px-4 sm:py-1.5 rounded-lg font-mono text-xs sm:text-[11px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] bg-gradient-to-br from-red-600 to-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.25)]"
              >
                Switch to Base
              </button>
            </div>
          )}

          {(ethBalError || tokBalError) && (
            <StatusBadge type="warn">Balance fetch failed — displayed values may be stale</StatusBadge>
          )}

          {/* Input boxes */}
          <div className="flex flex-col gap-1 relative">
            <InputBox
              label="You Pay"
              value={top.value}
              onChange={top.onChange}
              isEth={top.isEth}
              symbol={top.symbol}
              logoUrl={top.logoUrl}
              usd={top.usd}
              balance={top.balance}
              showBalance={isConnected}
              onMaxClick={top.onMaxClick}
              showMax={top.showMax}
            />

            {/* Flip button */}
            <div className="relative flex items-center justify-center h-0 z-10">
              <button
                onClick={() => {
                  setReversed((r) => !r);
                  suppressNextQuoteRef.current = false;
                  setEthAmount("");
                  setTokenAmount("");
                }}
                className="absolute flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-slate-500 transition-all duration-300 hover:text-cyan-400 hover:rotate-180 active:scale-90 bg-[#0a0f1a] border-2 border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:border-cyan-400/30 hover:shadow-[0_0_12px_rgba(34,211,238,0.15)]"
              >
                <LuArrowUpDown size={16} className="sm:w-[15px] sm:h-[15px]" />
              </button>
            </div>

            <InputBox
              label="You Receive"
              value={bot.value}
              readOnly
              isEth={bot.isEth}
              symbol={bot.symbol}
              logoUrl={bot.logoUrl}
              usd={bot.usd}
              balance={bot.balance}
              showBalance={isConnected}
              dimmed
              onMaxClick={bot.onMaxClick}
              showMax={bot.showMax}
              quoteLoading={quoteLoading}
            />
          </div>

          {/* Route badge */}
          {outputAmount && Number(outputAmount) > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg overflow-hidden bg-indigo-500/[0.05] border border-indigo-500/[0.12]">
              <span className="font-mono text-[11px] sm:text-[10px] font-bold tracking-[0.15em] uppercase text-indigo-400 shrink-0">
                Route
              </span>
              <div className="w-1 h-1 rounded-full bg-slate-700 shrink-0" />
              <span className="font-mono text-xs sm:text-[11px] text-slate-600 truncate">
                {reversed ? tokenSymbol : "ETH"} → {reversed ? "ETH" : tokenSymbol} via 1inch
              </span>
            </div>
          )}

          {/* Stats panel */}
          <div className="flex flex-col gap-2.5 px-5 py-4 sm:px-4 sm:py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <StatRow label="ETH Price" shortLabel="ETH"
              value={ethPrice ? `$${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              accent="green" />
            <StatRow label={`${tokenSymbol} Price`} shortLabel={tokenSymbol}
              value={tokenPriceUsd ? `$${tokenPriceUsd.toFixed(8)}` : "—"}
              accent="green" />

            <div className="h-px bg-white/[0.04]" />

            {priceImpact > 0 && (
              <StatRow label="Price Impact" shortLabel="Impact"
                value={`${priceImpact.toFixed(2)}%`}
                accent={priceImpact > 5 ? "red" : priceImpact > 1 ? "orange" : "green"} />
            )}
            <StatRow label="Min Received" shortLabel="Min"
              value={`${minReceivedDisplay} ${outputSymbol}`} accent="cyan" />
            <StatRow label="Network Fee" shortLabel="Fee"
              value={estimatedGas !== "0" ? `~${estimatedGas} ETH` : "—"} accent="orange" />

            <div className="h-px bg-white/[0.04]" />

            {/* Slippage row */}
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] sm:text-[10px] text-slate-500 tracking-widest uppercase">Slippage</span>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-cyan-400/30 transition-all"
              >
                <span className="font-mono text-xs font-bold text-cyan-400">{slippage}%</span>
                <LuSettings2 size={12} className="text-slate-500" />
              </button>
            </div>

            {/* Wallet balances */}
            {isConnected && (
              <>
                <div className="h-px bg-white/[0.04]" />
                {/* FIX: replaced xs: (not default Tailwind) with flex-row and gap handling */}
                <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <span className="font-mono text-[11px] sm:text-[10px] text-slate-600 tracking-widest uppercase flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Wallet
                  </span>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="font-mono text-xs sm:text-[11px] tabular-nums">
                      <span className="text-slate-600">ETH </span>
                      <span className="text-cyan-400 font-semibold">{userEthBalance.toFixed(6)}</span>
                    </span>
                    {checksummed && (
                      <span className="font-mono text-xs sm:text-[11px] tabular-nums">
                        <span className="text-slate-600">{tokenSymbol} </span>
                        <span className="text-cyan-400 font-semibold">{userTokenBalance.toFixed(6)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Status badges */}
          {successMsg && <StatusBadge type="success">{successMsg}</StatusBadge>}
          {errorMsg   && <StatusBadge type="error">{errorMsg}</StatusBadge>}

          {priceImpact > 5 && priceImpact <= 15 && !errorMsg && (
            <StatusBadge type="warn">
              <LuAlertTriangle className="inline w-4 h-4 mr-1" />
              High price impact ({priceImpact.toFixed(2)}%) — You may get a worse rate
            </StatusBadge>
          )}
          {insufficientEth && !errorMsg && (
            <StatusBadge type="warn">
              Need {totalEthNeeded.toFixed(6)} ETH (including gas) · have {userEthBalance.toFixed(6)} ETH
            </StatusBadge>
          )}
          {insufficientToken && !errorMsg && (
            <StatusBadge type="warn">
              Need {tokenAmount} {tokenSymbol} · have {userTokenBalance.toFixed(6)}
            </StatusBadge>
          )}

          <SwapButton btnStyle={btnStyle} label={btnLabel} disabled={btnDisabled} onClick={handleSwapClick} />
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeSwap}
        swapDetails={{
          fromAmount:  reversed ? tokenAmount : ethAmount,
          fromSymbol:  reversed ? tokenSymbol : 'ETH',
          toAmount:    reversed ? ethAmount   : tokenAmount,
          toSymbol:    reversed ? 'ETH'       : tokenSymbol,
          priceImpact,
          gasEstimate: estimatedGas,
        }}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        slippage={slippage}
        setSlippage={setSlippage}
        deadline={deadline}
        setDeadline={setDeadline}
      />
    </>
  );
}