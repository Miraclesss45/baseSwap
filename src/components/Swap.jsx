// src/components/Swap.jsx
//
// ⚠️  RPC — set a dedicated provider in your wagmi config (see main.jsx).
//     The public Base RPC is heavily rate-limited. Use Alchemy/QuickNode/Infura.
//
// ⚠️  1INCH API KEY — add to .env:
//     VITE_ONEINCH_API_KEY=your_key_here
//     Get a free key at https://portal.1inch.dev
//
// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTED IMPROVEMENTS (functionality, not touched here):
//
//  1. TOKEN SELECTOR MODAL — TokenBadge currently shows a static pill.
//     Adding an onClick that opens a searchable token list (like Uniswap's)
//     would let users swap any token pair, not just ETH↔the prop token.
//
//  2. TRANSACTION HISTORY PANEL — the history is saved to localStorage
//     but never shown. A small "Recent" section below the swap card would
//     surface it nicely.
//
//  3. PRICE CHART — embedding a 24h sparkline from DexScreener/GeckoTerminal
//     above the card would give users context before they swap.
//
//  4. PERMIT2 APPROVAL — instead of infinite ERC-20 approve, integrate
//     Uniswap's Permit2 so approvals are gasless signed messages.
//
//  5. BETTER ERROR RECOVERY — auto-retry the quote once after a CORS/network
//     failure instead of immediately showing the warning notice.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LuArrowUpDown, LuSettings2, LuClock, LuZap, LuChevronDown } from "react-icons/lu";
import {
  useAccount,
  useBalance,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  parseEther, parseUnits, formatEther, formatUnits, getAddress,
} from "viem";

// ─── ERC-20 ABI ───────────────────────────────────────────────────────────────
const ERC20ABI = [
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs:  [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const ONEINCH_ROUTER        = getAddress("0x111111125421cA6dc452d289314280a0f8842A65");
const ONEINCH_API = import.meta.env.DEV
  ? "/api/1inch/swap/v6.0/8453"
  : "https://api.1inch.dev/swap/v6.0/8453";
const ONEINCH_API_KEY       = import.meta.env.VITE_ONEINCH_API_KEY;
const NATIVE_ETH            = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DEFAULT_GAS_EST       = "0.00005";
const GAS_ESTIMATE_DEBOUNCE = 600;
const GAS_BUFFER_MULTIPLIER = 1.2;
const MAX_UINT256           = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const ETH_LOGO              = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23627EEA'/%3E%3Cg fill='%23FFF' fill-rule='nonzero'%3E%3Cpath fill-opacity='.602' d='M16.498 4v8.87l7.497 3.35z'/%3E%3Cpath d='M16.498 4L9 16.22l7.498-3.35z'/%3E%3Cpath fill-opacity='.602' d='M16.498 21.968v6.027L24 17.616z'/%3E%3Cpath d='M16.498 27.995v-6.028L9 17.616z'/%3E%3Cpath fill-opacity='.2' d='M16.498 20.573l7.497-4.353-7.497-3.348z'/%3E%3Cpath fill-opacity='.602' d='M9 16.22l7.498 4.353v-7.701z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

// ─── Utilities ────────────────────────────────────────────────────────────────
const formatMaxBalance = (balance) => {
  try {
    const num = Number(balance);
    if (!isFinite(num) || isNaN(num) || num === 0) return "0";
    const str = num.toString();
    if (!str.includes("e")) return str;
    const exp = Math.abs(Math.floor(Math.log10(Math.abs(num))));
    return num.toFixed(Math.min(exp + 6, 18)).replace(/0+$/, "").replace(/\.$/, "");
  } catch { return "0"; }
};
const toSafeDecimalString = (num, maxDecimals = 20) => {
  if (!isFinite(num) || num === 0) return "0";
  return num.toFixed(maxDecimals).replace(/\.?0+$/, "");
};
const truncateDecimals = (str, maxDecimals) => {
  if (!str || !str.includes(".")) return str || "0";
  const [whole, frac = ""] = str.split(".");
  return frac.length > maxDecimals ? `${whole}.${frac.slice(0, maxDecimals)}` : str;
};

// ─── 1inch helpers ────────────────────────────────────────────────────────────
const oneinchHeaders = () => ({
  "Content-Type": "application/json",
  ...(ONEINCH_API_KEY ? { Authorization: `Bearer ${ONEINCH_API_KEY}` } : {}),
});
const fetchOneinchQuote = async ({ srcToken, dstToken, amount }) => {
  try {
    const params = new URLSearchParams({ src: srcToken, dst: dstToken, amount: amount.toString(), includeGas: "true" });
    const res  = await fetch(`${ONEINCH_API}/quote?${params}`, { headers: oneinchHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { dstAmount: data.dstAmount, estimatedGas: data.gas ?? 250000 };
  } catch { return null; }
};
const fetchOneinchSwap = async ({ srcToken, dstToken, amount, fromAddress, slippage }) => {
  const clampedSlippage = Math.min(50, Math.max(0.01, slippage));
  const params = new URLSearchParams({
    src: srcToken, dst: dstToken, amount: amount.toString(),
    from: fromAddress, slippage: clampedSlippage.toString(), origin: fromAddress,
  });
  const res  = await fetch(`${ONEINCH_API}/swap?${params}`, { headers: oneinchHeaders() });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.description || data.error || "1inch swap request failed");
  return data.tx;
};

// ─── Style injection ──────────────────────────────────────────────────────────
const injectStyles = () => {
  if (document.getElementById("sw3-styles")) return;
  const el = document.createElement("style");
  el.id = "sw3-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');

    .sw { box-sizing: border-box; }
    .sw *, .sw *::before, .sw *::after { box-sizing: border-box; }

    .sw {
      /* ── Palette ── */
      --bg0:     #080D1A;          /* deepest background       */
      --bg1:     #0E1627;          /* card surface             */
      --bg2:     #131D2E;          /* input panel              */
      --bg3:     #172034;          /* passive/receive panel    */
      --bg4:     #1C2740;          /* raised elements          */
      --bg5:     #223050;          /* hover states             */

      --blue:    #3B82F6;          /* primary accent           */
      --blue-lt: #60A5FA;          /* light blue               */
      --blue-dk: #1D4ED8;          /* dark blue                */
      --blue-gl: rgba(59,130,246,0.15);  /* glow/fill         */
      --blue-bd: rgba(59,130,246,0.22);  /* border             */
      --blue-hv: rgba(59,130,246,0.08);  /* subtle hover       */

      --green:   #34D399;
      --amber:   #FBBF24;
      --red:     #F87171;

      --t1:      #F0F4FF;          /* primary text             */
      --t2:      #64748B;          /* secondary text           */
      --t3:      #2A3A52;          /* placeholder / muted      */

      --bd:      rgba(255,255,255,0.06);
      --bd-blue: var(--blue-bd);
      --radius:  20px;
      --radius-sm: 12px;

      font-family: 'Plus Jakarta Sans', sans-serif;
      color: var(--t1);
      -webkit-font-smoothing: antialiased;
    }

    /* ── Animations ── */
    @keyframes sw-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes sw-spin    { to { transform: rotate(360deg); } }
    @keyframes sw-fadein  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes sw-slideup { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
    @keyframes sw-popin   { from { opacity:0; transform:scale(.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes sw-pulse-ring {
      0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
      70%  { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
      100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
    }

    /* ── Input ── */
    .sw-amount-input {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 34px;
      font-weight: 400;
      letter-spacing: -0.02em;
      background: transparent;
      border: none; outline: none;
      color: var(--t1);
      width: 100%;
      appearance: textfield;
      -moz-appearance: textfield;
      line-height: 1.1;
    }
    .sw-amount-input::-webkit-outer-spin-button,
    .sw-amount-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .sw-amount-input::placeholder { color: var(--t3); }

    /* ── Skeleton ── */
    .sw-skel {
      background: linear-gradient(90deg, var(--bg4) 25%, var(--bg5) 50%, var(--bg4) 75%);
      background-size: 300% 100%;
      animation: sw-shimmer 1.6s ease-in-out infinite;
      border-radius: 8px;
    }

    /* ── Token badge ── */
    .sw-token-btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--bg4);
      border: 1px solid var(--bd);
      border-radius: 999px;
      padding: 7px 12px 7px 7px;
      cursor: default; user-select: none; white-space: nowrap;
      transition: background .15s, border-color .15s;
    }
    .sw-token-btn:hover { background: var(--bg5); border-color: var(--blue-bd); }

    /* ── Panels ── */
    .sw-panel {
      border-radius: var(--radius);
      padding: 16px 20px 14px;
      transition: border-color .15s, box-shadow .15s;
      animation: sw-fadein .18s ease both;
    }
    .sw-panel-pay     { background: var(--bg2); border: 1.5px solid var(--bd); }
    .sw-panel-receive { background: var(--bg3); border: 1.5px solid var(--bd); }
    .sw-panel-focused { border-color: var(--blue-bd) !important; box-shadow: 0 0 0 3px var(--blue-gl); }

    /* ── Flip btn ── */
    .sw-flip {
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 12px;
      background: var(--bg1);
      border: 2px solid var(--bd);
      color: var(--t2);
      cursor: pointer;
      transition: background .15s, border-color .15s, color .15s, transform .15s;
      box-shadow: 0 0 0 5px var(--bg1);
    }
    .sw-flip:hover {
      background: var(--bg4);
      border-color: var(--blue-bd);
      color: var(--blue-lt);
      transform: scale(1.06);
    }
    .sw-flip:active { transform: scale(0.94); }

    /* ── CTA button ── */
    .sw-cta {
      width: 100%; padding: 17px 0;
      border-radius: var(--radius);
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 16px; font-weight: 700;
      letter-spacing: 0.01em;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: all .18s ease;
    }
    .sw-cta-ready {
      background: linear-gradient(135deg, var(--blue) 0%, var(--blue-dk) 100%);
      color: #fff;
      box-shadow: 0 4px 24px rgba(59,130,246,.35), 0 1px 3px rgba(0,0,0,.4);
    }
    .sw-cta-ready:hover {
      background: linear-gradient(135deg, var(--blue-lt) 0%, var(--blue) 100%);
      box-shadow: 0 6px 32px rgba(59,130,246,.5), 0 1px 3px rgba(0,0,0,.4);
      transform: translateY(-1px);
    }
    .sw-cta-ready:active { transform: translateY(0); box-shadow: 0 2px 12px rgba(59,130,246,.3); }
    .sw-cta-loading  { background: var(--bg4); color: var(--t2); cursor: not-allowed; border: 1.5px solid var(--bd); }
    .sw-cta-danger   { background: rgba(248,113,113,.08); color: var(--red); cursor: not-allowed; border: 1.5px solid rgba(248,113,113,.25); }
    .sw-cta-disabled { background: var(--bg4); color: var(--t3); cursor: not-allowed; border: 1.5px solid var(--bd); }

    /* ── Notice ── */
    .sw-notice {
      display: flex; align-items: flex-start; gap: 9px;
      padding: 11px 14px; border-radius: var(--radius-sm);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px; line-height: 1.55;
    }
    .sw-notice-error   { background: rgba(248,113,113,.07); color: #FCA5A5; border: 1px solid rgba(248,113,113,.2); }
    .sw-notice-warn    { background: rgba(251,191,36,.07);  color: #FCD34D; border: 1px solid rgba(251,191,36,.2); }
    .sw-notice-success { background: rgba(52,211,153,.07);  color: #6EE7B7; border: 1px solid rgba(52,211,153,.2); }

    /* ── Details card ── */
    .sw-details {
      background: var(--bg2);
      border: 1.5px solid var(--bd);
      border-radius: var(--radius-sm);
      padding: 4px 16px;
    }
    .sw-detail-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--bd);
      font-size: 13px;
    }
    .sw-detail-row:last-child { border-bottom: none; }

    /* ── Settings / Confirm modals ── */
    .sw-overlay {
      position: fixed; inset: 0; z-index: 100;
      display: flex; align-items: flex-end; justify-content: center;
      background: rgba(5,10,22,.85); backdrop-filter: blur(12px);
    }
    @media (min-width: 640px) { .sw-overlay { align-items: center; padding: 16px; } }

    .sw-modal {
      width: 100%; max-width: 430px;
      background: var(--bg1);
      border: 1.5px solid var(--blue-bd);
      border-radius: 24px 24px 0 0;
      overflow: hidden;
      box-shadow: 0 -8px 60px rgba(59,130,246,.1), 0 0 120px rgba(0,0,0,.7);
      animation: sw-slideup .22s cubic-bezier(.32,1.1,.64,1) both;
    }
    @media (min-width: 640px) {
      .sw-modal { border-radius: 24px; animation: sw-popin .2s ease both; }
    }

    /* ── Max btn ── */
    .sw-max {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px; font-weight: 600;
      letter-spacing: .04em; text-transform: uppercase;
      color: var(--blue-lt);
      background: var(--blue-hv);
      border: 1px solid var(--blue-bd);
      border-radius: 6px;
      padding: 2px 8px;
      cursor: pointer;
      transition: all .14s;
    }
    .sw-max:hover { background: var(--blue-gl); }
    .sw-max:active { transform: scale(.94); }

    /* ── Close btn ── */
    .sw-close {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px;
      background: var(--bg4); border: 1px solid var(--bd);
      color: var(--t2); cursor: pointer; transition: all .14s;
    }
    .sw-close:hover { background: var(--bg5); color: var(--t1); }

    /* ── Slippage preset ── */
    .sw-preset {
      flex: 1; padding: 9px 0; border-radius: 10px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px; font-weight: 500;
      cursor: pointer; transition: all .14s;
      border: 1.5px solid transparent;
    }

    /* ── Settings / confirm modal inner input ── */
    .sw-field-input {
      flex: 1; background: transparent; border: none; outline: none;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 14px; font-weight: 500; color: var(--t1);
      appearance: textfield; -moz-appearance: textfield;
    }
    .sw-field-input::-webkit-outer-spin-button,
    .sw-field-input::-webkit-inner-spin-button { -webkit-appearance: none; }

    /* ── Rate row link ── */
    .sw-rate-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 2px;
      font-size: 13px;
    }

    /* ── Badge for "Base" network chip ── */
    .sw-chip {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px; font-weight: 500; letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--blue-lt);
      background: var(--blue-hv);
      border: 1px solid var(--blue-bd);
      border-radius: 6px;
      padding: 3px 8px;
    }

    /* ── Settings icon btn ── */
    .sw-gear {
      width: 34px; height: 34px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px; background: transparent;
      border: 1.5px solid transparent; color: var(--t2);
      cursor: pointer; transition: all .14s;
    }
    .sw-gear:hover { background: var(--bg4); color: var(--blue-lt); border-color: var(--bd); }

    /* ── Wrong-network banner ── */
    .sw-net-banner {
      margin-bottom: 12px; display: flex;
      align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px; border-radius: var(--radius-sm);
      background: rgba(248,113,113,.07); border: 1.5px solid rgba(248,113,113,.22);
    }
  `;
  document.head.appendChild(el);
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TokenBadge({ isEth, symbol, logoUrl }) {
  const [imgErr, setImgErr] = useState(false);
  const label  = isEth ? "ETH" : symbol || "TOKEN";
  const logo   = isEth ? ETH_LOGO : logoUrl;
  const showImg = logo && !imgErr;
  const initials = isEth ? "Ξ" : label.slice(0, 2).toUpperCase();

  return (
    <div className="sw-token-btn">
      {/* Token icon */}
      <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showImg ? (
          <img src={logo} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgErr(true)} />
        ) : (
          <span style={{
            width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
            background: isEth ? "linear-gradient(135deg,#1e3a8a,#3730a3)" : "linear-gradient(135deg,#1e3a5f,#1d4068)",
            color: isEth ? "#93c5fd" : "var(--blue-lt)",
          }}>{initials}</span>
        )}
      </div>
      {/* Symbol */}
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", letterSpacing: "0.01em" }}>{label}</span>
      <LuChevronDown size={14} style={{ color: "var(--t2)", marginLeft: -2 }} />
    </div>
  );
}

// ─── TokenPanel ───────────────────────────────────────────────────────────────
function TokenPanel({
  label, value, onChange, onFocusInput,
  isActive, isPassive, quoteLoading,
  isEth, symbol, logoUrl,
  usd, balance, showBalance, onMaxClick, showMax,
}) {
  const [focused, setFocused] = useState(false);
  const panelClass = `sw-panel ${isPassive ? "sw-panel-receive" : "sw-panel-pay"}${focused ? " sw-panel-focused" : ""}`;

  return (
    <div className={panelClass}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t2)", letterSpacing: "0.01em" }}>{label}</span>
        {showBalance && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--t2)" }}>
              {balance}
            </span>
            {showMax && onMaxClick && (
              <button className="sw-max" onClick={onMaxClick}>Max</button>
            )}
          </div>
        )}
      </div>

      {/* Amount + token badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        {/* Left — number + USD */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {quoteLoading && isPassive ? (
            <div className="sw-skel" style={{ height: 38, width: 160, marginBottom: 8 }} />
          ) : (
            <input
              type="number" step="any" min="0" inputMode="decimal"
              value={value} placeholder="0"
              className="sw-amount-input"
              onFocus={() => { setFocused(true); onFocusInput?.(); }}
              onBlur={() => setFocused(false)}
              onChange={onChange ? (e) => {
                const raw = e.target.value.replace(/^-+/, "");
                if (raw === "" || (parseFloat(raw) >= 0 && !raw.includes("e") && !raw.includes("E"))) {
                  onChange(raw);
                }
              } : undefined}
              onKeyDown={(e) => {
                if (["e", "E", "-", "+"].includes(e.key)) e.preventDefault();
              }}
            />
          )}

          {/* USD value */}
          <div style={{ height: 20, display: "flex", alignItems: "center", marginTop: 5 }}>
            {quoteLoading && isPassive ? (
              <div className="sw-skel" style={{ height: 13, width: 72 }} />
            ) : usd ? (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "var(--t2)" }}>{usd}</span>
            ) : value && Number(value) > 0 ? (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "var(--t3)" }}>$ —</span>
            ) : null}
          </div>
        </div>

        {/* Right — token selector */}
        <div style={{ paddingTop: 2, flexShrink: 0 }}>
          <TokenBadge isEth={isEth} symbol={symbol} logoUrl={logoUrl} />
        </div>
      </div>
    </div>
  );
}

// ─── Flip button ──────────────────────────────────────────────────────────────
function FlipButton({ onClick }) {
  const [deg, setDeg] = useState(0);
  return (
    <div style={{ display: "flex", justifyContent: "center", height: 0, position: "relative", zIndex: 10, margin: "2px 0" }}>
      <button
        className="sw-flip"
        style={{ transform: `rotate(${deg}deg)`, transition: "transform .32s cubic-bezier(.34,1.56,.64,1), background .15s, border-color .15s, color .15s" }}
        onClick={() => { setDeg(d => d + 180); onClick(); }}
      >
        <LuArrowUpDown size={16} />
      </button>
    </div>
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────
function DetailRow({ label, value, valueColor }) {
  return (
    <div className="sw-detail-row">
      <span style={{ color: "var(--t2)" }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500, color: valueColor || "var(--t1)" }}>{value}</span>
    </div>
  );
}

// ─── Swap CTA ─────────────────────────────────────────────────────────────────
function SwapButton({ btnStyle, label, disabled, onClick }) {
  const cls = { ready: "sw-cta-ready", loading: "sw-cta-loading", danger: "sw-cta-danger", disabled: "sw-cta-disabled" };
  return (
    <button
      className={`sw-cta ${cls[btnStyle] || cls.disabled}`}
      disabled={disabled || btnStyle !== "ready"}
      onClick={btnStyle === "ready" ? onClick : undefined}
    >
      {btnStyle === "loading" && (
        <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2.5px solid rgba(100,116,139,.3)", borderTopColor: "var(--t2)", animation: "sw-spin .7s linear infinite", flexShrink: 0 }} />
      )}
      {btnStyle === "ready" && <LuZap size={16} style={{ flexShrink: 0 }} />}
      {label}
    </button>
  );
}

// ─── Notice strip ─────────────────────────────────────────────────────────────
function Notice({ type, children }) {
  const cls  = { error: "sw-notice-error", warn: "sw-notice-warn", success: "sw-notice-success" };
  const icon = { error: "✕", warn: "!", success: "✓" };
  return (
    <div className={`sw-notice ${cls[type]}`}>
      <span style={{ fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{icon[type]}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmationModal({ isOpen, onClose, onConfirm, swapDetails }) {
  if (!isOpen) return null;
  const { fromAmount, fromSymbol, toAmount, toSymbol, priceImpact, gasEstimate } = swapDetails;
  const ic = priceImpact > 5 ? "var(--red)" : priceImpact > 1 ? "var(--amber)" : "var(--green)";

  return (
    <div className="sw-overlay sw">
      <div className="sw-modal">
        {/* Blue header bar */}
        <div style={{ height: 3, background: "linear-gradient(90deg, var(--blue-dk), var(--blue), var(--blue-lt))" }} />
        <div style={{ padding: "24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Review Swap</span>
            <button className="sw-close" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* From / To */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 18 }}>
            {/* Pay box */}
            <div style={{ background: "var(--bg2)", border: "1.5px solid var(--bd)", borderRadius: "16px 16px 6px 6px", padding: "16px 18px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)", marginBottom: 6, letterSpacing: "0.01em" }}>You pay</p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 400, color: "var(--t1)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {fromAmount}{" "}
                <span style={{ fontSize: 18, color: "var(--t2)" }}>{fromSymbol}</span>
              </p>
            </div>

            {/* Arrow separator */}
            <div style={{ display: "flex", justifyContent: "center", height: 0, position: "relative", zIndex: 1 }}>
              <div style={{ position: "absolute", top: -14, width: 28, height: 28, borderRadius: 9, background: "var(--bg1)", border: "1.5px solid var(--blue-bd)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--blue-lt)", boxShadow: "0 0 14px rgba(59,130,246,.2)" }}>
                <LuArrowUpDown size={13} />
              </div>
            </div>

            {/* Receive box */}
            <div style={{ background: "var(--bg3)", border: "1.5px solid var(--blue-bd)", borderRadius: "6px 6px 16px 16px", padding: "16px 18px", boxShadow: "0 0 24px rgba(59,130,246,.06)" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--t2)", marginBottom: 6, letterSpacing: "0.01em" }}>You receive ≈</p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 400, color: "var(--blue-lt)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {toAmount}{" "}
                <span style={{ fontSize: 18, color: "var(--t2)" }}>{toSymbol}</span>
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="sw-details" style={{ marginBottom: 18 }}>
            <DetailRow label="Price impact" value={`${priceImpact.toFixed(2)}%`}    valueColor={ic} />
            <DetailRow label="Network fee"  value={`~${gasEstimate} ETH`}            valueColor="var(--t2)" />
            <DetailRow label="Route"        value="1inch v6 · Base"                  valueColor="var(--blue-lt)" />
          </div>

          {priceImpact > 5 && (
            <div style={{ marginBottom: 14 }}>
              <Notice type="warn">High price impact — {priceImpact.toFixed(2)}% loss expected. Consider a smaller trade.</Notice>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: "14px 0", borderRadius: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 14, fontWeight: 700,
                background: "var(--bg4)", color: "var(--t2)",
                border: "1.5px solid var(--bd)", cursor: "pointer", transition: "all .14s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg5)"; e.currentTarget.style.color = "var(--t1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg4)"; e.currentTarget.style.color = "var(--t2)"; }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              style={{
                flex: 2, padding: "14px 0", borderRadius: 14,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, var(--blue) 0%, var(--blue-dk) 100%)",
                color: "#fff", border: "none", cursor: "pointer",
                boxShadow: "0 4px 20px rgba(59,130,246,.4)", transition: "all .14s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, var(--blue-lt) 0%, var(--blue) 100%)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, var(--blue) 0%, var(--blue-dk) 100%)"; }}
            >
              Confirm Swap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function SettingsModal({ isOpen, onClose, slippage, setSlippage, deadline, setDeadline }) {
  if (!isOpen) return null;
  const presets = [0.1, 0.5, 1.0];

  return (
    <div className="sw-overlay sw">
      <div className="sw-modal">
        <div style={{ height: 3, background: "linear-gradient(90deg, var(--blue-dk), var(--blue), var(--blue-lt))" }} />
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Settings</span>
            <button className="sw-close" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Slippage */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--t2)", marginBottom: 12, letterSpacing: "0.01em" }}>Max slippage</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {presets.map(p => {
                const active = slippage === p;
                return (
                  <button
                    key={p}
                    className="sw-preset"
                    onClick={() => setSlippage(p)}
                    style={{
                      background: active ? "var(--blue-hv)" : "var(--bg4)",
                      color:      active ? "var(--blue-lt)" : "var(--t2)",
                      border:     active ? "1.5px solid var(--blue-bd)" : "1.5px solid var(--bd)",
                    }}
                  >
                    {p}%
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", background: "var(--bg3)", border: "1.5px solid var(--bd)", borderRadius: 12, padding: "11px 14px", gap: 8 }}>
              <input
                type="number" min="0" max="50" step="0.1" value={slippage}
                className="sw-field-input"
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setSlippage(v); }}
                onKeyDown={e => { if (["-","e","E"].includes(e.key)) e.preventDefault(); }}
                placeholder="Custom"
              />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: "var(--t2)" }}>%</span>
            </div>
            {slippage > 5 && <div style={{ marginTop: 8 }}><Notice type="warn">High slippage — trade may be front-run.</Notice></div>}
          </div>

          {/* Deadline */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--t2)", marginBottom: 12, letterSpacing: "0.01em", display: "flex", alignItems: "center", gap: 6 }}>
              <LuClock size={13} /> Transaction deadline
            </p>
            <div style={{ display: "flex", alignItems: "center", background: "var(--bg3)", border: "1.5px solid var(--bd)", borderRadius: 12, padding: "11px 14px", gap: 8 }}>
              <input
                type="number" min="5" max="60" value={deadline}
                className="sw-field-input"
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 5 && v <= 60) setDeadline(v); }}
              />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: "var(--t2)" }}>min</span>
            </div>
            <p style={{ marginTop: 7, fontSize: 12, color: "var(--t3)", fontFamily: "'IBM Plex Mono', monospace" }}>
              1inch manages the exact deadline in calldata.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              marginTop: 24, width: "100%", padding: "15px 0", borderRadius: 14,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 15, fontWeight: 700,
              background: "linear-gradient(135deg, var(--blue) 0%, var(--blue-dk) 100%)",
              color: "#fff", border: "none", cursor: "pointer",
              boxShadow: "0 4px 20px rgba(59,130,246,.35)", transition: "all .14s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, var(--blue-lt) 0%, var(--blue) 100%)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, var(--blue) 0%, var(--blue-dk) 100%)"; }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Swap({ tokenAddress, tokenData, ethPrice: appEthPrice }) {
  useEffect(() => { injectStyles(); }, []);

  const { address, isConnected, chain } = useAccount();

  const checksummed = useMemo(() => {
    try { return tokenAddress ? getAddress(tokenAddress) : null; }
    catch { return null; }
  }, [tokenAddress]);

  // ── Balances ─────────────────────────────────────────────────────────────────
  const { data: ethBalData, refetch: refetchEth } = useBalance({
    address, chainId: base.id,
    query: { enabled: !!address && isConnected, refetchInterval: 30_000, staleTime: 15_000, gcTime: 60_000 },
  });
  const { data: tokBalData, refetch: refetchTok } = useBalance({
    address, token: checksummed ?? undefined, chainId: base.id,
    query: { enabled: !!address && isConnected && !!checksummed, refetchInterval: 30_000, staleTime: 15_000, gcTime: 60_000 },
  });
  const userEthBalance   = Number(ethBalData?.formatted ?? 0);
  const userTokenBalance = Number(tokBalData?.formatted ?? 0);

  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient           = usePublicClient({ chainId: base.id });
  const { switchChain }        = useSwitchChain();

  // ── State ─────────────────────────────────────────────────────────────────────
  const [ethAmount,         setEthAmount]         = useState("");
  const [tokenAmount,       setTokenAmount]       = useState("");
  const [reversed,          setReversed]          = useState(false);
  const [activeInput,       setActiveInput]       = useState("top");
  const [slippage,          setSlippage]          = useState(0.5);
  const [deadline,          setDeadline]          = useState(20);
  const [loading,           setLoading]           = useState(false);
  const [quoteLoading,      setQuoteLoading]      = useState(false);
  const [estimatedGas,      setEstimatedGas]      = useState("0");
  const [ethPrice,          setEthPrice]          = useState(appEthPrice || null);
  const [insufficientToken, setInsufficientToken] = useState(false);
  const [successMsg,        setSuccessMsg]        = useState("");
  const [errorMsg,          setErrorMsg]          = useState("");
  const [quoteError,        setQuoteError]        = useState("");
  const [tokenLogo,         setTokenLogo]         = useState(null);
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const suppressRef = useRef(false);

  const tokenSymbol    = tokenData?.symbol   ?? "TOKEN";
  const actualDecimals = tokBalData?.decimals ?? tokenData?.decimals ?? 18;
  const tokenPriceUsd  = Number(tokenData?.priceUsd) || null;
  const isCorrectNetwork = chain?.id === base.id;

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => { setTokenLogo(tokenData?.logo || tokenData?.dexLogo || null); }, [checksummed, tokenData]);
  useEffect(() => { if (appEthPrice) setEthPrice(appEthPrice); }, [appEthPrice]);

  useEffect(() => {
    if (appEthPrice) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.ethereum?.usd) setEthPrice(data.ethereum.usd);
      } catch {}
    };
    pull();
    const t = setInterval(pull, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [appEthPrice]);

  useEffect(() => {
    setInsufficientToken(isConnected && reversed && !!tokenAmount && Number(tokenAmount) > userTokenBalance);
  }, [reversed, tokenAmount, userTokenBalance, address, activeInput, isConnected]);

  // ── Quote effect ──────────────────────────────────────────────────────────────
  const publicClientRef = useRef(publicClient);
  useEffect(() => { publicClientRef.current = publicClient; }, [publicClient]);

  const topIsEth    = !reversed;
  const activeValue = activeInput === "top"
    ? (topIsEth ? ethAmount   : tokenAmount)
    : (topIsEth ? tokenAmount : ethAmount);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }

    if (!checksummed || !isConnected || !isCorrectNetwork || !activeValue || Number(activeValue) <= 0) {
      if (activeInput === "top") topIsEth ? setTokenAmount("") : setEthAmount("");
      else                       topIsEth ? setEthAmount("") : setTokenAmount("");
      setEstimatedGas("0"); setQuoteLoading(false); setQuoteError("");
      return;
    }

    let cancelled = false;
    setQuoteLoading(true); setQuoteError("");

    const timer = setTimeout(async () => {
      try {
        let srcToken, dstToken, amountWei;
        if (activeInput === "top") {
          srcToken  = topIsEth ? NATIVE_ETH : checksummed;
          dstToken  = topIsEth ? checksummed : NATIVE_ETH;
          amountWei = topIsEth
            ? parseEther(activeValue).toString()
            : parseUnits(truncateDecimals(activeValue, actualDecimals), actualDecimals).toString();
        } else {
          srcToken  = topIsEth ? checksummed : NATIVE_ETH;
          dstToken  = topIsEth ? NATIVE_ETH  : checksummed;
          amountWei = topIsEth
            ? parseUnits(truncateDecimals(activeValue, actualDecimals), actualDecimals).toString()
            : parseEther(activeValue).toString();
        }

        const quote = await fetchOneinchQuote({ srcToken, dstToken, amount: amountWei });
        if (cancelled) return;

        if (!quote) {
          setEstimatedGas(DEFAULT_GAS_EST);
          setQuoteError(ONEINCH_API_KEY
            ? "Could not fetch quote — check network or Vite proxy config"
            : "Missing VITE_ONEINCH_API_KEY in .env — see comments at top of file");
          setQuoteLoading(false);
          return;
        }

        suppressRef.current = true;
        if (activeInput === "top") {
          topIsEth
            ? setTokenAmount(formatUnits(BigInt(quote.dstAmount), actualDecimals).replace(/\.?0+$/, ""))
            : setEthAmount(formatEther(BigInt(quote.dstAmount)).replace(/\.?0+$/, ""));
        } else {
          topIsEth
            ? setEthAmount(formatEther(BigInt(quote.dstAmount)).replace(/\.?0+$/, ""))
            : setTokenAmount(formatUnits(BigInt(quote.dstAmount), actualDecimals).replace(/\.?0+$/, ""));
        }

        // Gas estimate
        try {
          const block = await publicClientRef.current.getBlock({ blockTag: "latest" });
          const baseFee = block.baseFeePerGas;
          const gasEth = baseFee
            ? Number(formatEther(BigInt(quote.estimatedGas) * baseFee))
            : Number(formatEther(BigInt(quote.estimatedGas) * (await publicClientRef.current.getGasPrice())));
          setEstimatedGas((!isFinite(gasEth) || gasEth <= 0 || gasEth > 0.01)
            ? DEFAULT_GAS_EST
            : gasEth.toFixed(8).replace(/\.?0+$/, ""));
        } catch { setEstimatedGas(DEFAULT_GAS_EST); }

      } catch {
        if (!cancelled) { setEstimatedGas(DEFAULT_GAS_EST); setQuoteError("Quote request failed — please try again"); }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, GAS_ESTIMATE_DEBOUNCE);

    return () => { cancelled = true; clearTimeout(timer); setQuoteLoading(false); };
  }, [activeValue, activeInput, topIsEth, checksummed, isConnected, isCorrectNetwork, actualDecimals]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const inputAmount  = reversed ? tokenAmount : ethAmount;
  const outputAmount = reversed ? ethAmount   : tokenAmount;
  const outputSymbol = reversed ? "ETH"       : tokenSymbol;

  const minReceived = useMemo(() => {
    if (!outputAmount || Number(outputAmount) <= 0) return "0";
    return toSafeDecimalString(Number(outputAmount) * (1 - slippage / 100), 18);
  }, [outputAmount, slippage]);
  const minReceivedDisplay = minReceived !== "0" ? minReceived.replace(/\.?0+$/, "") : "0";

  const priceImpact = useMemo(() => {
    if (!outputAmount || !tokenPriceUsd || !ethPrice) return 0;
    try {
      const iu = reversed ? Number(tokenAmount) * tokenPriceUsd : Number(ethAmount) * ethPrice;
      const ou = reversed ? Number(ethAmount) * ethPrice        : Number(tokenAmount) * tokenPriceUsd;
      if (iu === 0) return 0;
      return Math.abs(((iu - ou) / iu) * 100);
    } catch { return 0; }
  }, [ethAmount, tokenAmount, ethPrice, tokenPriceUsd, reversed]);

  const totalEthNeeded = reversed
    ? Number(estimatedGas) * GAS_BUFFER_MULTIPLIER
    : Number(ethAmount || 0) + Number(estimatedGas) * GAS_BUFFER_MULTIPLIER;
  const insufficientEth = isConnected && totalEthNeeded > userEthBalance && totalEthNeeded > 0;

  const ethUsdVal   = ethAmount   && Number(ethAmount)   > 0 && ethPrice
    ? `≈ $${(Number(ethAmount) * ethPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
  const tokenUsdVal = tokenAmount && Number(tokenAmount) > 0 && tokenPriceUsd
    ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "";

  // ── Tx history ────────────────────────────────────────────────────────────────
  const saveTxToHistory = useCallback((hash, type) => {
    try {
      const tx = { hash, timestamp: Date.now(), type, tokenAddress: checksummed, tokenSymbol, amountIn: reversed ? tokenAmount : ethAmount, amountOut: reversed ? ethAmount : tokenAmount, status: "success" };
      const prev = (() => { try { return JSON.parse(localStorage.getItem("swap_history") || "[]"); } catch { return []; } })();
      localStorage.setItem("swap_history", JSON.stringify([tx, ...prev].slice(0, 20)));
    } catch {}
  }, [checksummed, tokenSymbol, reversed, tokenAmount, ethAmount]);

  // ── Approve ───────────────────────────────────────────────────────────────────
  const approveToken = async () => {
    setSuccessMsg("Requesting approval…");
    const hash = await walletClient.writeContract({ address: checksummed, abi: ERC20ABI, functionName: "approve", args: [ONEINCH_ROUTER, MAX_UINT256] });
    setSuccessMsg(`Approval pending · ${hash.slice(0, 10)}…`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error("Approval transaction reverted");
    setSuccessMsg("Token approved ✓");
    await new Promise(r => setTimeout(r, 800));
  };

  // ── Execute swap ──────────────────────────────────────────────────────────────
  const executeSwap = async () => {
    setErrorMsg("");
    if (!isConnected)              { setErrorMsg("Connect wallet first"); return; }
    if (!isCorrectNetwork)         { await switchChain({ chainId: base.id }); return; }
    if (!ethAmount && !tokenAmount){ setErrorMsg("Enter an amount"); return; }
    if (!walletClient || !publicClient){ setErrorMsg("Wallet not ready"); return; }
    if (Number(inputAmount) <= 0)  { setErrorMsg("Amount must be > 0"); return; }
    if (insufficientEth)           { setErrorMsg(`Need ${totalEthNeeded.toFixed(6)} ETH (including gas)`); return; }
    if (insufficientToken)         { setErrorMsg(`Insufficient ${tokenSymbol}`); return; }

    try {
      setLoading(true); setSuccessMsg(""); setErrorMsg("");
      const srcToken  = reversed ? checksummed : NATIVE_ETH;
      const dstToken  = reversed ? NATIVE_ETH  : checksummed;
      const amountWei = reversed
        ? parseUnits(truncateDecimals(tokenAmount, actualDecimals), actualDecimals).toString()
        : parseEther(ethAmount).toString();

      if (reversed) {
        const allowance = await publicClient.readContract({ address: checksummed, abi: ERC20ABI, functionName: "allowance", args: [address, ONEINCH_ROUTER] });
        if (BigInt(allowance) < BigInt(amountWei)) await approveToken();
      }

      const swapTx = await fetchOneinchSwap({ srcToken, dstToken, amount: amountWei, fromAddress: address, slippage });

      let maxFeePerGas, maxPriorityFeePerGas;
      try {
        const [block, tip] = await Promise.all([publicClient.getBlock({ blockTag: "latest" }), publicClient.estimateMaxPriorityFeePerGas()]);
        const baseFee = block.baseFeePerGas ?? BigInt(swapTx.gasPrice ?? "1000000000");
        maxPriorityFeePerGas = tip;
        maxFeePerGas = baseFee * 2n + tip;
      } catch {
        maxFeePerGas = BigInt(swapTx.gasPrice ?? "1000000000");
        maxPriorityFeePerGas = BigInt(swapTx.gasPrice ?? "1000000000");
      }

      const hash = await walletClient.sendTransaction({
        to: swapTx.to, data: swapTx.data, value: BigInt(swapTx.value ?? "0"),
        gas: BigInt(Math.ceil(Number(swapTx.gas) * 1.25)), maxFeePerGas, maxPriorityFeePerGas,
      });

      setSuccessMsg(`Submitted · ${hash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

      if (receipt.status === "success") {
        setSuccessMsg("Swap confirmed ✓");
        saveTxToHistory(hash, reversed ? "TOKEN_TO_ETH" : "ETH_TO_TOKEN");
        if (!reversed && checksummed && tokenSymbol && walletClient?.watchAsset) {
          try { await walletClient.watchAsset({ type: "ERC20", options: { address: checksummed, symbol: tokenSymbol.slice(0, 11), decimals: actualDecimals, image: tokenLogo ?? undefined } }); } catch {}
        }
        suppressRef.current = true;
        setEthAmount(""); setTokenAmount("");
        refetchEth(); if (checksummed) refetchTok();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        throw new Error("Transaction reverted on-chain");
      }
    } catch (err) {
      let msg = "Swap failed";
      if      (err?.message?.includes("rejected"))                                             msg = "Transaction rejected";
      else if (err?.message?.includes("slippage") || err?.message?.includes("INSUFFICIENT_OUTPUT")) msg = "Price moved — try increasing slippage";
      else if (err?.message?.includes("timeout"))                                              msg = "Tx timed out — check wallet, may still confirm";
      else if (err?.message?.includes("Approval"))                                             msg = "Approval failed or rejected";
      else if (err?.message)                                                                   msg = err.message.slice(0, 80);
      setErrorMsg(msg); setSuccessMsg("");
    } finally { setLoading(false); setShowConfirmModal(false); }
  };

  // ── Max ───────────────────────────────────────────────────────────────────────
  const handleMaxClick = (side) => {
    suppressRef.current = false;
    const getMaxEth = () => {
      if (!ethBalData?.value) return "0";
      const buf = BigInt(Math.ceil((estimatedGas !== "0" ? Number(estimatedGas) * GAS_BUFFER_MULTIPLIER : 0.005) * 1e18));
      const max = ethBalData.value > buf ? ethBalData.value - buf : ethBalData.value;
      return formatEther(max);
    };
    const getMaxToken = () => tokBalData?.value ? formatUnits(tokBalData.value, actualDecimals) : "0";
    if (side === "top") {
      setActiveInput("top");
      if (reversed) { setTokenAmount(getMaxToken()); setEthAmount(""); }
      else          { setEthAmount(getMaxEth());     setTokenAmount(""); }
    } else {
      setActiveInput("bot");
      if (reversed) { setEthAmount(getMaxEth());     setTokenAmount(""); }
      else          { setTokenAmount(getMaxToken()); setEthAmount(""); }
    }
  };

  // ── Panel descriptors ─────────────────────────────────────────────────────────
  const top = {
    isEth: !reversed, symbol: reversed ? tokenSymbol : "ETH", logoUrl: reversed ? tokenLogo : null,
    value: reversed ? tokenAmount : ethAmount, usd: reversed ? tokenUsdVal : ethUsdVal,
    balance: reversed ? `${formatMaxBalance(userTokenBalance)} ${tokenSymbol}` : `${formatMaxBalance(userEthBalance)} ETH`,
    isActive: activeInput === "top", isPassive: activeInput === "bot",
    onChange: (v) => { setActiveInput("top"); suppressRef.current = false; setErrorMsg(""); setQuoteError(""); if (reversed) { setTokenAmount(v); setEthAmount(""); } else { setEthAmount(v); setTokenAmount(""); } },
    onFocusInput: () => setActiveInput("top"),
    onMaxClick:   () => handleMaxClick("top"), showMax: true,
  };
  const bot = {
    isEth: reversed, symbol: reversed ? "ETH" : tokenSymbol, logoUrl: reversed ? null : tokenLogo,
    value: reversed ? ethAmount : tokenAmount, usd: reversed ? ethUsdVal : tokenUsdVal,
    balance: reversed ? `${formatMaxBalance(userEthBalance)} ETH` : `${formatMaxBalance(userTokenBalance)} ${tokenSymbol}`,
    isActive: activeInput === "bot", isPassive: activeInput === "top",
    onChange: (v) => { setActiveInput("bot"); suppressRef.current = false; setErrorMsg(""); setQuoteError(""); if (reversed) { setEthAmount(v); setTokenAmount(""); } else { setTokenAmount(v); setEthAmount(""); } },
    onFocusInput: () => setActiveInput("bot"),
    onMaxClick:   () => handleMaxClick("bot"), showMax: true,
  };

  // ── Button state ──────────────────────────────────────────────────────────────
  let btnStyle = "disabled", btnLabel = "Enter an amount";
  if      (loading)                                    { btnStyle = "loading";  btnLabel = "Processing…"; }
  else if (quoteLoading)                               { btnStyle = "loading";  btnLabel = "Getting best price…"; }
  else if (!isConnected)                               { btnStyle = "disabled"; btnLabel = "Connect wallet"; }
  else if (!isCorrectNetwork)                          { btnStyle = "danger";   btnLabel = "Switch to Base"; }
  else if (!outputAmount || Number(outputAmount) <= 0) { btnStyle = "disabled"; btnLabel = "Enter an amount"; }
  else if (priceImpact > 15)                           { btnStyle = "danger";   btnLabel = "Price impact too high"; }
  else if (insufficientEth)                            { btnStyle = "danger";   btnLabel = "Insufficient ETH for gas"; }
  else if (insufficientToken)                          { btnStyle = "danger";   btnLabel = `Insufficient ${tokenSymbol}`; }
  else                                                 { btnStyle = "ready";    btnLabel = "Swap"; }

  const btnDisabled = loading || quoteLoading || !isConnected || !isCorrectNetwork ||
    !outputAmount || Number(outputAmount) <= 0 || insufficientEth || insufficientToken || priceImpact > 15;

  const impactColor = priceImpact > 5 ? "var(--red)" : priceImpact > 1 ? "var(--amber)" : "var(--green)";

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!checksummed) {
    return (
      <div className="sw" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", borderRadius: 24, textAlign: "center", background: "var(--bg1)", border: "1.5px solid var(--bd)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--blue-hv)", border: "1.5px solid var(--blue-bd)", color: "var(--blue-lt)" }}>
          <LuArrowUpDown size={22} />
        </div>
        <p style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, letterSpacing: "-0.01em" }}>Swap tokens</p>
        <p style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.6, maxWidth: 220 }}>Search for a token above to start swapping on Base</p>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="sw" style={{
        width: "100%", borderRadius: 24,
        background: "var(--bg1)",
        border: "1.5px solid var(--bd)",
        boxShadow: "0 8px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(59,130,246,.05)",
        overflow: "visible",
      }}>
        <div style={{ padding: "16px" }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Swap</span>
              <span className="sw-chip">Base</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 500,
                  color: "var(--t2)", background: "var(--bg4)", border: "1.5px solid var(--bd)",
                  borderRadius: 10, padding: "5px 10px", cursor: "pointer", transition: "all .14s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--blue-lt)"; e.currentTarget.style.borderColor = "var(--blue-bd)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--t2)"; e.currentTarget.style.borderColor = "var(--bd)"; }}
              >
                {slippage}% slippage
              </button>
              <button className="sw-gear" onClick={() => setShowSettingsModal(true)} title="Settings">
                <LuSettings2 size={16} />
              </button>
            </div>
          </div>

          {/* ── Wrong network ── */}
          {isConnected && !isCorrectNetwork && (
            <div className="sw-net-banner">
              <span style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>Wrong network — switch to Base</span>
              <button
                onClick={() => switchChain({ chainId: base.id })}
                style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "var(--red)", background: "rgba(248,113,113,.1)", border: "1.5px solid rgba(248,113,113,.25)", cursor: "pointer", transition: "all .14s" }}
              >
                Switch
              </button>
            </div>
          )}

          {/* ── Token panels ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TokenPanel label="You pay"    {...top} quoteLoading={quoteLoading} showBalance={isConnected} />
            <FlipButton onClick={() => { setReversed(r => !r); setActiveInput("top"); suppressRef.current = false; setEthAmount(""); setTokenAmount(""); setEstimatedGas("0"); setErrorMsg(""); setQuoteError(""); setSuccessMsg(""); }} />
            <TokenPanel label="You receive" {...bot} quoteLoading={quoteLoading} showBalance={isConnected} />
          </div>

          {/* ── Quote details ── */}
          {outputAmount && Number(outputAmount) > 0 && !quoteLoading && (
            <div style={{ marginTop: 12 }}>
              {/* Rate row */}
              {top.value && Number(top.value) > 0 && (
                <div className="sw-rate-row" style={{ marginBottom: 6, padding: "4px 6px" }}>
                  <span style={{ color: "var(--t2)" }}>
                    1 {reversed ? tokenSymbol : "ETH"}
                    <span style={{ color: "var(--t3)", margin: "0 4px" }}>=</span>
                    <span style={{ color: "var(--t1)", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>
                      {(Number(outputAmount) / Number(top.value)).toLocaleString(undefined, { maximumSignificantDigits: 6 })} {outputSymbol}
                    </span>
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--blue-lt)", opacity: 0.7 }}>via 1inch</span>
                </div>
              )}

              <div className="sw-details">
                <DetailRow label="Minimum received" value={`${minReceivedDisplay} ${outputSymbol}`} />
                {priceImpact > 0 && <DetailRow label="Price impact"     value={`${priceImpact.toFixed(2)}%`} valueColor={impactColor} />}
                <DetailRow label="Network fee"      value={estimatedGas && estimatedGas !== "0" ? `~${estimatedGas} ETH` : "—"} valueColor="var(--t2)" />
              </div>
            </div>
          )}

          {/* ── Notices ── */}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {successMsg                              && <Notice type="success">{successMsg}</Notice>}
            {errorMsg                                && <Notice type="error">{errorMsg}</Notice>}
            {quoteError && !errorMsg                 && <Notice type="warn">{quoteError}</Notice>}
            {priceImpact > 5 && priceImpact <= 15 && !errorMsg && (
              <Notice type="warn">High price impact ({priceImpact.toFixed(2)}%) — you may receive significantly less.</Notice>
            )}
            {insufficientEth && !errorMsg && (
              <Notice type="warn">You need {totalEthNeeded.toFixed(6)} ETH (including gas) · balance: {userEthBalance.toFixed(6)} ETH</Notice>
            )}
            {insufficientToken && !errorMsg && (
              <Notice type="warn">Insufficient {tokenSymbol} · need {tokenAmount}, have {userTokenBalance.toFixed(6)}</Notice>
            )}
          </div>

          {/* ── CTA ── */}
          <div style={{ marginTop: 12 }}>
            <SwapButton btnStyle={btnStyle} label={btnLabel} disabled={btnDisabled} onClick={() => setShowConfirmModal(true)} />
          </div>

          {/* ── Powered by footer ── */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--t3)" }}>Powered by</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--blue-lt)", opacity: 0.6 }}>1inch · Base</span>
          </div>

        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeSwap}
        swapDetails={{ fromAmount: reversed ? tokenAmount : ethAmount, fromSymbol: reversed ? tokenSymbol : "ETH", toAmount: outputAmount, toSymbol: outputSymbol, priceImpact, gasEstimate: estimatedGas }}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        slippage={slippage} setSlippage={setSlippage}
        deadline={deadline} setDeadline={setDeadline}
      />
    </>
  );
}