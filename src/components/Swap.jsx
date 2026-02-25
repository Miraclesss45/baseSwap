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
import { LuArrowUpDown, LuSettings2, LuClock } from "react-icons/lu";
import {
  useAccount,
  useBalance,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  getAddress,
} from "viem";

const ERC20ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const ONEINCH_ROUTER = getAddress("0x111111125421cA6dc452d289314280a0f8842A65");
const ONEINCH_API = "https://api.1inch.dev/swap/v6.0/8453";
const ONEINCH_API_KEY = import.meta.env.VITE_ONEINCH_API_KEY;
const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DEFAULT_GAS_EST = "0.00005";
const GAS_ESTIMATE_DEBOUNCE = 600;
const GAS_BUFFER_MULTIPLIER = 1.2;
const MAX_UINT256 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

const ETH_LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23627EEA'/%3E%3Cg fill='%23FFF' fill-rule='nonzero'%3E%3Cpath fill-opacity='.602' d='M16.498 4v8.87l7.497 3.35z'/%3E%3Cpath d='M16.498 4L9 16.22l7.498-3.35z'/%3E%3Cpath fill-opacity='.602' d='M16.498 21.968v6.027L24 17.616z'/%3E%3Cpath d='M16.498 27.995v-6.028L9 17.616z'/%3E%3Cpath fill-opacity='.2' d='M16.498 20.573l7.497-4.353-7.497-3.348z'/%3E%3Cpath fill-opacity='.602' d='M9 16.22l7.498 4.353v-7.701z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

// ─── Utilities ────────────────────────────────────────────────────────────────
const formatMaxBalance = (balance) => {
  try {
    const num = Number(balance);
    if (!isFinite(num) || isNaN(num) || num === 0) return "0";
    const str = num.toString();
    if (!str.includes("e")) return str;
    const exp = Math.abs(Math.floor(Math.log10(Math.abs(num))));
    return num
      .toFixed(Math.min(exp + 6, 18))
      .replace(/0+$/, "")
      .replace(/\.$/, "");
  } catch {
    return "0";
  }
};

const toSafeDecimalString = (num, maxDecimals = 20) => {
  if (!isFinite(num) || num === 0) return "0";
  return num.toFixed(maxDecimals).replace(/\.?0+$/, "");
};

const truncateDecimals = (str, maxDecimals) => {
  if (!str || !str.includes(".")) return str || "0";
  const [whole, frac = ""] = str.split(".");
  return frac.length > maxDecimals
    ? `${whole}.${frac.slice(0, maxDecimals)}`
    : str;
};

// ─── 1inch API helpers ────────────────────────────────────────────────────────
const oneinchHeaders = () => ({
  "Content-Type": "application/json",
  ...(ONEINCH_API_KEY ? { Authorization: `Bearer ${ONEINCH_API_KEY}` } : {}),
});

const fetchOneinchQuote = async ({ srcToken, dstToken, amount }) => {
  try {
    const params = new URLSearchParams({
      src: srcToken,
      dst: dstToken,
      amount: amount.toString(),
      includeGas: "true",
    });
    const res = await fetch(`${ONEINCH_API}/quote?${params}`, {
      headers: oneinchHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return { dstAmount: data.dstAmount, estimatedGas: data.gas ?? 250000 };
  } catch {
    return null;
  }
};

const fetchOneinchSwap = async ({
  srcToken,
  dstToken,
  amount,
  fromAddress,
  slippage,
}) => {
  const clampedSlippage = Math.min(50, Math.max(0.01, slippage));
  const params = new URLSearchParams({
    src: srcToken,
    dst: dstToken,
    amount: amount.toString(),
    from: fromAddress,
    slippage: clampedSlippage.toString(),
    origin: fromAddress,
  });
  const res = await fetch(`${ONEINCH_API}/swap?${params}`, {
    headers: oneinchHeaders(),
  });
  const data = await res.json();
  if (!res.ok || data.error)
    throw new Error(
      data.description || data.error || "1inch swap request failed",
    );
  return data.tx;
};

// ─── Style injection ──────────────────────────────────────────────────────────
const injectStyles = () => {
  if (document.getElementById("swap-v2-styles")) return;
  const style = document.createElement("style");
  style.id = "swap-v2-styles";
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

    .sr * { box-sizing: border-box; }
    .sr {
      --bg0:  #060A12;
      --bg1:  #0B1120;
      --bg2:  #0F1829;
      --bg3:  #0D1525;
      --bg4:  #141E30;
      --bg5:  #172236;
      --ac:   #00D4FF;
      --ac2:  #00FFB2;
      --acD:  rgba(0,212,255,0.08);
      --acG:  rgba(0,212,255,0.15);
      --acM:  rgba(0,212,255,0.35);
      --bd:   rgba(0,212,255,0.10);
      --bdD:  rgba(255,255,255,0.04);
      --t1:   #E2EAF4;
      --t2:   #4E6282;
      --t3:   #2A3A52;
      --ok:   #00FFB2;
      --wn:   #FFB020;
      --er:   #FF4560;
      --fd:   'Syne', sans-serif;
      --fm:   'JetBrains Mono', monospace;
      font-family: var(--fd);
      color: var(--t1);
    }

    @keyframes sr-shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    @keyframes sr-spin { to { transform: rotate(360deg); } }
    @keyframes sr-fadeup {
      from { opacity:0; transform:translateY(4px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes sr-modalup {
      from { transform:translateY(36px); opacity:0; }
      to   { transform:translateY(0); opacity:1; }
    }
    @keyframes sr-modalpop {
      from { transform:translateY(10px) scale(0.97); opacity:0; }
      to   { transform:translateY(0) scale(1); opacity:1; }
    }

    .sr-panel { animation: sr-fadeup 0.16s ease forwards; }

    .sr-num-input {
      font-family: var(--fm);
      font-size: 30px;
      font-weight: 500;
      letter-spacing: -0.02em;
      background: transparent;
      border: none; outline: none;
      color: var(--t1);
      width: 100%;
      appearance: textfield;
      -moz-appearance: textfield;
    }
    .sr-num-input::-webkit-outer-spin-button,
    .sr-num-input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
    .sr-num-input::placeholder { color: var(--t3); }

    .sr-skeleton {
      background: linear-gradient(90deg, var(--bg4) 25%, var(--bg5) 50%, var(--bg4) 75%);
      background-size: 200% 100%;
      animation: sr-shimmer 1.3s infinite;
      border-radius: 6px;
    }

    .sr-badge {
      display:flex; align-items:center; gap:7px;
      background:var(--bg4); border:1px solid var(--bd);
      border-radius:10px; padding:6px 10px 6px 6px;
      transition: background 0.15s, border-color 0.15s;
      cursor:default; user-select:none; white-space:nowrap;
    }
    .sr-badge:hover { background:var(--bg5); border-color:var(--acM); }

    .sr-max {
      font-family: var(--fm); font-size:10px; font-weight:600;
      letter-spacing:0.08em; text-transform:uppercase;
      color:var(--ac); background:var(--acD);
      border:1px solid rgba(0,212,255,0.2); border-radius:5px;
      padding:2px 7px; cursor:pointer; transition:all 0.15s;
    }
    .sr-max:hover { background:var(--acG); border-color:var(--acM); }

    .sr-tag {
      font-family:var(--fm); font-size:10px; letter-spacing:0.12em;
      text-transform:uppercase; color:var(--t3);
      display:flex; align-items:center; gap:5px;
    }
    .sr-tag::before {
      content:''; display:inline-block;
      width:3px; height:3px; border-radius:50%;
      background:var(--ac); opacity:0.5; flex-shrink:0;
    }

    .sr-detail-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:6px 0; border-bottom:1px solid var(--bdD);
    }
    .sr-detail-row:last-child { border-bottom:none; }

    .sr-notice {
      display:flex; align-items:flex-start; gap:8px;
      padding:10px 13px; border-radius:8px;
      font-family:var(--fm); font-size:12px; line-height:1.5;
    }
    .sr-notice-error   { background:rgba(255,69,96,0.07);  color:#FF6B7A; border:1px solid rgba(255,69,96,0.2); }
    .sr-notice-warn    { background:rgba(255,176,32,0.07); color:#FFC040; border:1px solid rgba(255,176,32,0.2); }
    .sr-notice-success { background:rgba(0,255,178,0.07);  color:#00FFB2; border:1px solid rgba(0,255,178,0.2); }

    .sr-cta {
      width:100%; padding:14px 0; border-radius:10px;
      font-family:var(--fd); font-size:13px; font-weight:800;
      letter-spacing:0.1em; text-transform:uppercase;
      border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:8px;
      transition:all 0.15s ease; position:relative; overflow:hidden;
    }
    .sr-cta-ready {
      background:var(--ac); color:var(--bg0);
      box-shadow:0 0 28px rgba(0,212,255,0.25),0 0 60px rgba(0,212,255,0.07);
    }
    .sr-cta-ready:hover {
      background:#18DEFF;
      box-shadow:0 0 42px rgba(0,212,255,0.4),0 0 80px rgba(0,212,255,0.1);
      transform:translateY(-1px);
    }
    .sr-cta-ready:active { transform:translateY(0); }
    .sr-cta-loading  { background:var(--bg4); color:var(--t2); cursor:not-allowed; border:1px solid var(--bdD); }
    .sr-cta-danger   { background:rgba(255,69,96,0.07); color:var(--er); cursor:not-allowed; border:1px solid rgba(255,69,96,0.22); }
    .sr-cta-disabled { background:var(--bg4); color:var(--t3); cursor:not-allowed; border:1px solid var(--bdD); }

    .sr-slip-pill {
      font-family:var(--fm); font-size:11px; letter-spacing:0.05em;
      color:var(--t2); background:var(--bg4); border:1px solid var(--bdD);
      border-radius:7px; padding:5px 10px; cursor:pointer; transition:all 0.15s;
    }
    .sr-slip-pill:hover { color:var(--ac); border-color:var(--bd); background:var(--bg5); }

    .sr-icon-btn {
      width:30px; height:30px;
      display:flex; align-items:center; justify-content:center;
      border-radius:8px; background:transparent; border:1px solid transparent;
      color:var(--t2); cursor:pointer; transition:all 0.15s;
    }
    .sr-icon-btn:hover { background:var(--bg4); color:var(--ac); border-color:var(--bd); }

    .sr-flip-btn {
      width:34px; height:34px;
      display:flex; align-items:center; justify-content:center;
      border-radius:9px; background:var(--bg1);
      border:1px solid var(--bd); color:var(--t2); cursor:pointer;
      box-shadow:0 0 0 4px var(--bg1);
      transition:background 0.15s, color 0.15s, border-color 0.15s;
    }
    .sr-flip-btn:hover { background:var(--bg4); color:var(--ac); border-color:var(--acM); }

    .sr-cancel-btn {
      flex:1; padding:12px 0; border-radius:9px;
      font-family:var(--fd); font-size:12px; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase;
      background:var(--bg4); color:var(--t2);
      border:1px solid var(--bdD); cursor:pointer; transition:all 0.15s;
    }
    .sr-cancel-btn:hover { background:var(--bg5); color:var(--t1); }

    .sr-confirm-btn {
      flex:2; padding:12px 0; border-radius:9px;
      font-family:var(--fd); font-size:12px; font-weight:800;
      letter-spacing:0.08em; text-transform:uppercase;
      background:var(--ac); color:var(--bg0);
      border:none; cursor:pointer;
      box-shadow:0 0 22px rgba(0,212,255,0.28);
      transition:all 0.15s;
    }
    .sr-confirm-btn:hover { background:#18DEFF; box-shadow:0 0 36px rgba(0,212,255,0.42); }

    .sr-close-btn {
      width:28px; height:28px; display:flex; align-items:center; justify-content:center;
      border-radius:7px; background:var(--bg4); border:1px solid var(--bdD);
      color:var(--t2); cursor:pointer; transition:all 0.15s;
    }
    .sr-close-btn:hover { background:var(--bg5); color:var(--t1); border-color:var(--bd); }

    .sr-modal-overlay {
      position:fixed; inset:0; z-index:50;
      display:flex; align-items:flex-end; justify-content:center;
      background:rgba(4,8,16,0.88); backdrop-filter:blur(10px); padding:0;
    }
    @media(min-width:640px) { .sr-modal-overlay { align-items:center; padding:16px; } }

    .sr-modal-box {
      width:100%; max-width:420px;
      background:var(--bg1); border:1px solid var(--bd);
      border-radius:16px 16px 0 0; overflow:hidden;
      box-shadow:0 -4px 60px rgba(0,212,255,0.07),0 0 120px rgba(0,0,0,0.8);
      animation:sr-modalup 0.22s cubic-bezier(.32,1.2,.64,1) forwards;
    }
    @media(min-width:640px) {
      .sr-modal-box { border-radius:16px; animation:sr-modalpop 0.2s ease forwards; }
    }

    .sr-preset-btn {
      flex:1; padding:9px 0; border-radius:7px;
      font-family:var(--fm); font-size:12px; font-weight:600;
      cursor:pointer; transition:all 0.15s;
    }

    .sr-save-btn {
      width:100%; margin-top:22px; padding:13px 0; border-radius:9px;
      font-family:var(--fd); font-size:12px; font-weight:800;
      letter-spacing:0.1em; text-transform:uppercase;
      background:var(--ac); color:var(--bg0); border:none; cursor:pointer;
      box-shadow:0 0 20px rgba(0,212,255,0.22); transition:background 0.15s;
    }
    .sr-save-btn:hover { background:#18DEFF; }
  `;
  document.head.appendChild(style);
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TokenBadge({ isEth, symbol, logoUrl }) {
  const [imgError, setImgError] = useState(false);
  const label = isEth ? "ETH" : symbol || "TOKEN";
  const initials = isEth ? "Ξ" : label.slice(0, 2).toUpperCase();
  const displayLogo = isEth ? ETH_LOGO : logoUrl;
  const showImage = displayLogo && !imgError;

  return (
    <div className="sr-badge">
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {showImage ? (
          <img
            src={displayLogo}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              fontSize: 10,
              fontWeight: 700,
              background: isEth
                ? "#1A2860"
                : "linear-gradient(135deg,#0C3030,#0A2030)",
              color: isEth ? "#7E9EFF" : "var(--ac)",
              fontFamily: "var(--fm)",
            }}
          >
            {initials}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--t1)",
          fontFamily: "var(--fd)",
        }}
      >
        {label}
      </span>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        fill="none"
        style={{ marginLeft: 2, color: "var(--t2)", flexShrink: 0 }}
      >
        <path
          d="M1 1l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function TokenPanel({
  label,
  value,
  onChange,
  onFocusInput,
  isActive,
  isPassive,
  quoteLoading,
  isEth,
  symbol,
  logoUrl,
  usd,
  balance,
  showBalance,
  onMaxClick,
  showMax,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="sr-panel"
      style={{
        borderRadius: 12,
        padding: "14px 16px",
        background: isPassive ? "var(--bg3)" : "var(--bg2)",
        border: `1px solid ${focused ? "rgba(0,212,255,0.32)" : isPassive ? "var(--bdD)" : "var(--bd)"}`,
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: focused ? "0 0 0 3px rgba(0,212,255,0.06)" : "none",
      }}
    >
      {/* Top: label + balance */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span className="sr-tag">{label}</span>
        {showBalance && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--fm)",
                fontSize: 11,
                color: "var(--t2)",
                letterSpacing: "0.02em",
              }}
            >
              {balance}
            </span>
            {showMax && onMaxClick && (
              <button className="sr-max" onClick={onMaxClick}>
                Max
              </button>
            )}
          </div>
        )}
      </div>

      {/* Amount + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {quoteLoading && isPassive ? (
            <div
              className="sr-skeleton"
              style={{ height: 34, width: 130, marginBottom: 6 }}
            />
          ) : (
            <input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={value}
              placeholder="0.00"
              className="sr-num-input"
              onFocus={() => {
                setFocused(true);
                onFocusInput?.();
              }}
              onBlur={() => setFocused(false)}
              onChange={
                onChange
                  ? (e) => {
                      const raw = e.target.value.replace(/^-+/, "");
                      if (
                        raw === "" ||
                        (parseFloat(raw) >= 0 &&
                          !raw.includes("e") &&
                          !raw.includes("E"))
                      )
                        onChange(raw);
                    }
                  : undefined
              }
              onKeyDown={(e) => {
                if (
                  e.key === "-" ||
                  e.key === "+" ||
                  e.key === "e" ||
                  e.key === "E"
                )
                  e.preventDefault();
              }}
            />
          )}
          <div
            style={{
              height: 16,
              display: "flex",
              alignItems: "center",
              marginTop: 3,
            }}
          >
            {quoteLoading && isPassive ? (
              <div className="sr-skeleton" style={{ height: 11, width: 64 }} />
            ) : usd ? (
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 11,
                  color: "var(--t2)",
                  letterSpacing: "0.02em",
                }}
              >
                {usd}
              </span>
            ) : value && Number(value) > 0 ? (
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 11,
                  color: "var(--t3)",
                }}
              >
                $ —
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ flexShrink: 0, paddingBottom: 16 }}>
          <TokenBadge isEth={isEth} symbol={symbol} logoUrl={logoUrl} />
        </div>
      </div>
    </div>
  );
}

function FlipButton({ onClick }) {
  const [deg, setDeg] = useState(0);
  const handleClick = () => {
    setDeg((d) => d + 180);
    onClick();
  };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: 0,
        position: "relative",
        zIndex: 10,
        margin: "2px 0",
      }}
    >
      <button
        className="sr-flip-btn"
        onClick={handleClick}
        style={{
          transform: `rotate(${deg}deg)`,
          transition:
            "transform 0.3s cubic-bezier(.34,1.56,.64,1), background 0.15s, color 0.15s, border-color 0.15s",
        }}
      >
        <LuArrowUpDown size={14} />
      </button>
    </div>
  );
}

function DetailRow({ label, value, valueColor }) {
  return (
    <div className="sr-detail-row">
      <span
        style={{
          fontFamily: "var(--fm)",
          fontSize: 11,
          color: "var(--t2)",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--fm)",
          fontSize: 11,
          fontWeight: 500,
          color: valueColor || "var(--t1)",
          letterSpacing: "0.02em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SwapButton({ btnStyle, label, disabled, onClick }) {
  const cls = {
    ready: "sr-cta-ready",
    loading: "sr-cta-loading",
    danger: "sr-cta-danger",
    disabled: "sr-cta-disabled",
  };
  return (
    <button
      onClick={btnStyle === "ready" ? onClick : undefined}
      disabled={disabled || btnStyle !== "ready"}
      className={`sr-cta ${cls[btnStyle] || cls.disabled}`}
    >
      {btnStyle === "loading" && (
        <div
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            border: "2px solid rgba(78,98,130,0.3)",
            borderTopColor: "var(--t2)",
            animation: "sr-spin 0.7s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  );
}

function Notice({ type, children }) {
  const cls = {
    error: "sr-notice-error",
    warn: "sr-notice-warn",
    success: "sr-notice-success",
  };
  const icon = { error: "✕", warn: "!", success: "✓" };
  return (
    <div className={`sr-notice ${cls[type]}`}>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{icon[type]}</span>
      <span>{children}</span>
    </div>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, swapDetails }) {
  if (!isOpen) return null;
  const {
    fromAmount,
    fromSymbol,
    toAmount,
    toSymbol,
    priceImpact,
    gasEstimate,
  } = swapDetails;
  const ic =
    priceImpact > 5 ? "var(--er)" : priceImpact > 1 ? "var(--wn)" : "var(--ok)";

  return (
    <div className="sr-modal-overlay sr">
      <div className="sr-modal-box">
        <div
          style={{
            height: 3,
            background: "linear-gradient(to right, var(--ac), var(--ac2))",
          }}
        />
        <div style={{ padding: "22px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <span
              style={{
                fontFamily: "var(--fd)",
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: "0.04em",
              }}
            >
              Review Order
            </span>
            <button className="sr-close-btn" onClick={onClose}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 1l8 8M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                background: "var(--bg2)",
                border: "1px solid var(--bdD)",
                borderRadius: "10px 10px 4px 4px",
                padding: "13px 15px",
              }}
            >
              <span
                className="sr-tag"
                style={{ display: "flex", marginBottom: 6 }}
              >
                Sending
              </span>
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 26,
                  fontWeight: 500,
                  color: "var(--t1)",
                  letterSpacing: "-0.02em",
                }}
              >
                {fromAmount}{" "}
                <span style={{ color: "var(--t2)", fontSize: 16 }}>
                  {fromSymbol}
                </span>
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                height: 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -11,
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  background: "var(--bg1)",
                  border: "1px solid var(--bd)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--ac)",
                  boxShadow: "0 0 10px rgba(0,212,255,0.18)",
                }}
              >
                <LuArrowUpDown size={11} />
              </div>
            </div>
            <div
              style={{
                background: "var(--bg2)",
                border: "1px solid var(--bd)",
                borderRadius: "4px 4px 10px 10px",
                padding: "13px 15px",
                boxShadow: "0 0 20px rgba(0,212,255,0.04)",
              }}
            >
              <span
                className="sr-tag"
                style={{ display: "flex", marginBottom: 6 }}
              >
                Receiving ≈
              </span>
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 26,
                  fontWeight: 500,
                  color: "var(--ac)",
                  letterSpacing: "-0.02em",
                }}
              >
                {toAmount}{" "}
                <span style={{ color: "var(--t2)", fontSize: 16 }}>
                  {toSymbol}
                </span>
              </span>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg3)",
              border: "1px solid var(--bdD)",
              borderRadius: 9,
              padding: "2px 13px",
              marginBottom: 14,
            }}
          >
            <DetailRow
              label="Price impact"
              value={`${priceImpact.toFixed(2)}%`}
              valueColor={ic}
            />
            <DetailRow label="Network fee" value={`~${gasEstimate} ETH`} />
            <DetailRow label="Route" value="1inch v6" valueColor="var(--ac)" />
          </div>

          {priceImpact > 5 && (
            <div style={{ marginBottom: 12 }}>
              <Notice type="warn">
                High price impact — {priceImpact.toFixed(2)}% loss expected
              </Notice>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="sr-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="sr-confirm-btn" onClick={onConfirm}>
              Confirm Swap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  isOpen,
  onClose,
  slippage,
  setSlippage,
  deadline,
  setDeadline,
}) {
  if (!isOpen) return null;
  const presets = [0.1, 0.5, 1.0];

  return (
    <div className="sr-modal-overlay sr">
      <div className="sr-modal-box">
        <div
          style={{
            height: 3,
            background: "linear-gradient(to right, var(--ac), var(--ac2))",
          }}
        />
        <div style={{ padding: "22px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 22,
            }}
          >
            <span
              style={{
                fontFamily: "var(--fd)",
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: "0.04em",
              }}
            >
              Settings
            </span>
            <button className="sr-close-btn" onClick={onClose}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 1l8 8M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div style={{ marginBottom: 22 }}>
            <span
              className="sr-tag"
              style={{ display: "flex", marginBottom: 10 }}
            >
              Max Slippage
            </span>
            <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
              {presets.map((p) => {
                const active = slippage === p;
                return (
                  <button
                    key={p}
                    className="sr-preset-btn"
                    onClick={() => setSlippage(p)}
                    style={{
                      background: active ? "rgba(0,212,255,0.1)" : "var(--bg4)",
                      color: active ? "var(--ac)" : "var(--t2)",
                      border: active
                        ? "1px solid var(--acM)"
                        : "1px solid var(--bdD)",
                    }}
                  >
                    {p}%
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg3)",
                border: "1px solid var(--bd)",
                borderRadius: 8,
                padding: "9px 13px",
                gap: 7,
              }}
            >
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={slippage}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 0) setSlippage(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e" || e.key === "E")
                    e.preventDefault();
                }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "var(--fm)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--t1)",
                  appearance: "textfield",
                }}
                placeholder="Custom"
              />
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 12,
                  color: "var(--t2)",
                }}
              >
                %
              </span>
            </div>
            {slippage > 5 && (
              <div style={{ marginTop: 8 }}>
                <Notice type="warn">
                  High slippage — trade may be front-run
                </Notice>
              </div>
            )}
          </div>

          <div>
            <span
              className="sr-tag"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 10,
              }}
            >
              <LuClock size={10} /> Deadline
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg3)",
                border: "1px solid var(--bd)",
                borderRadius: 8,
                padding: "9px 13px",
                gap: 7,
              }}
            >
              <input
                type="number"
                min="5"
                max="60"
                value={deadline}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 5 && v <= 60) setDeadline(v);
                }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "var(--fm)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--t1)",
                  appearance: "textfield",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 12,
                  color: "var(--t2)",
                }}
              >
                min
              </span>
            </div>
            <p
              style={{
                marginTop: 5,
                fontFamily: "var(--fm)",
                fontSize: 10,
                color: "var(--t3)",
                letterSpacing: "0.03em",
              }}
            >
              1inch manages the exact deadline in calldata.
            </p>
          </div>

          <button className="sr-save-btn" onClick={onClose}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Swap({
  tokenAddress,
  tokenData,
  ethPrice: appEthPrice,
}) {
  useEffect(() => {
    injectStyles();
  }, []);

  const { address, isConnected, chain } = useAccount();

  const checksummed = useMemo(() => {
    try {
      return tokenAddress ? getAddress(tokenAddress) : null;
    } catch {
      return null;
    }
  }, [tokenAddress]);

  const { data: ethBalData, refetch: refetchEth } = useBalance({
    address,
    chainId: base.id,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 30_000,
      staleTime: 15_000,
      gcTime: 60_000,
    },
  });
  const { data: tokBalData, refetch: refetchTok } = useBalance({
    address,
    token: checksummed ?? undefined,
    chainId: base.id,
    query: {
      enabled: !!address && isConnected && !!checksummed,
      refetchInterval: 30_000,
      staleTime: 15_000,
      gcTime: 60_000,
    },
  });
  const userEthBalance = Number(ethBalData?.formatted ?? 0);
  const userTokenBalance = Number(tokBalData?.formatted ?? 0);

  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChain } = useSwitchChain();

  const [ethAmount, setEthAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [reversed, setReversed] = useState(false);
  const [activeInput, setActiveInput] = useState("top");
  const [slippage, setSlippage] = useState(0.5);
  const [deadline, setDeadline] = useState(20);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice, setEthPrice] = useState(appEthPrice || null);
  const [insufficientToken, setInsufficientToken] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [tokenLogo, setTokenLogo] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const suppressRef = useRef(false);

  const tokenSymbol = tokenData?.symbol ?? "TOKEN";
  const actualDecimals = tokBalData?.decimals ?? tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;
  const isCorrectNetwork = chain?.id === base.id;

  useEffect(() => {
    setTokenLogo(tokenData?.logo || tokenData?.dexLogo || null);
  }, [checksummed, tokenData]);
  useEffect(() => {
    if (appEthPrice) setEthPrice(appEthPrice);
  }, [appEthPrice]);

  useEffect(() => {
    if (appEthPrice) return;
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.ethereum?.usd) setEthPrice(data.ethereum.usd);
      } catch {}
    };
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [appEthPrice]);

  useEffect(() => {
    setInsufficientToken(
      isConnected &&
        reversed &&
        !!tokenAmount &&
        Number(tokenAmount) > userTokenBalance,
    );
  }, [
    reversed,
    tokenAmount,
    userTokenBalance,
    address,
    activeInput,
    isConnected,
  ]);

  const publicClientRef = useRef(publicClient);
  useEffect(() => {
    publicClientRef.current = publicClient;
  }, [publicClient]);

  const topIsEth = !reversed;
  const activeValue =
    activeInput === "top"
      ? topIsEth
        ? ethAmount
        : tokenAmount
      : topIsEth
        ? tokenAmount
        : ethAmount;

  useEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }

    if (
      !checksummed ||
      !isConnected ||
      !isCorrectNetwork ||
      !activeValue ||
      Number(activeValue) <= 0
    ) {
      if (activeInput === "top") {
        topIsEth ? setTokenAmount("") : setEthAmount("");
      } else {
        topIsEth ? setEthAmount("") : setTokenAmount("");
      }
      setEstimatedGas("0");
      setQuoteLoading(false);
      setQuoteError("");
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError("");

    const timer = setTimeout(async () => {
      try {
        let srcToken, dstToken, amountWei;
        if (activeInput === "top") {
          srcToken = topIsEth ? NATIVE_ETH : checksummed;
          dstToken = topIsEth ? checksummed : NATIVE_ETH;
          amountWei = topIsEth
            ? parseEther(activeValue).toString()
            : parseUnits(
                truncateDecimals(activeValue, actualDecimals),
                actualDecimals,
              ).toString();
        } else {
          srcToken = topIsEth ? checksummed : NATIVE_ETH;
          dstToken = topIsEth ? NATIVE_ETH : checksummed;
          amountWei = topIsEth
            ? parseUnits(
                truncateDecimals(activeValue, actualDecimals),
                actualDecimals,
              ).toString()
            : parseEther(activeValue).toString();
        }

        const quote = await fetchOneinchQuote({
          srcToken,
          dstToken,
          amount: amountWei,
        });
        if (cancelled) return;

        if (!quote) {
          setEstimatedGas(DEFAULT_GAS_EST);
          setQuoteError(
            ONEINCH_API_KEY
              ? "Could not fetch quote — check network or try again"
              : "No 1inch API key (VITE_ONEINCH_API_KEY) — add one to .env",
          );
          setQuoteLoading(false);
          return;
        }

        suppressRef.current = true;
        if (activeInput === "top") {
          topIsEth
            ? setTokenAmount(
                formatUnits(BigInt(quote.dstAmount), actualDecimals).replace(
                  /\.?0+$/,
                  "",
                ),
              )
            : setEthAmount(
                formatEther(BigInt(quote.dstAmount)).replace(/\.?0+$/, ""),
              );
        } else {
          topIsEth
            ? setEthAmount(
                formatEther(BigInt(quote.dstAmount)).replace(/\.?0+$/, ""),
              )
            : setTokenAmount(
                formatUnits(BigInt(quote.dstAmount), actualDecimals).replace(
                  /\.?0+$/,
                  "",
                ),
              );
        }

        try {
          const block = await publicClientRef.current.getBlock({
            blockTag: "latest",
          });
          const baseFee = block.baseFeePerGas;
          let gasEth;
          if (baseFee) {
            gasEth = Number(formatEther(BigInt(quote.estimatedGas) * baseFee));
          } else {
            const gasPrice = await publicClientRef.current.getGasPrice();
            gasEth = Number(formatEther(BigInt(quote.estimatedGas) * gasPrice));
          }
          setEstimatedGas(
            !isFinite(gasEth) || gasEth <= 0 || gasEth > 0.01
              ? DEFAULT_GAS_EST
              : gasEth.toFixed(8).replace(/\.?0+$/, ""),
          );
        } catch {
          setEstimatedGas(DEFAULT_GAS_EST);
        }
      } catch {
        if (!cancelled) {
          setEstimatedGas(DEFAULT_GAS_EST);
          setQuoteError("Quote request failed — please try again");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, GAS_ESTIMATE_DEBOUNCE);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setQuoteLoading(false);
    };
  }, [
    activeValue,
    activeInput,
    topIsEth,
    checksummed,
    isConnected,
    isCorrectNetwork,
    actualDecimals,
  ]);

  const inputAmount = reversed ? tokenAmount : ethAmount;
  const outputAmount = reversed ? ethAmount : tokenAmount;
  const outputSymbol = reversed ? "ETH" : tokenSymbol;

  const minReceived = useMemo(() => {
    if (!outputAmount || Number(outputAmount) <= 0) return "0";
    return toSafeDecimalString(Number(outputAmount) * (1 - slippage / 100), 18);
  }, [outputAmount, slippage]);
  const minReceivedDisplay =
    minReceived !== "0" ? minReceived.replace(/\.?0+$/, "") : "0";

  const priceImpact = useMemo(() => {
    if (!outputAmount || !tokenPriceUsd || !ethPrice) return 0;
    try {
      const iu = reversed
        ? Number(tokenAmount) * tokenPriceUsd
        : Number(ethAmount) * ethPrice;
      const ou = reversed
        ? Number(ethAmount) * ethPrice
        : Number(tokenAmount) * tokenPriceUsd;
      if (iu === 0) return 0;
      return Math.abs(((iu - ou) / iu) * 100);
    } catch {
      return 0;
    }
  }, [ethAmount, tokenAmount, ethPrice, tokenPriceUsd, reversed]);

  const totalEthNeeded = reversed
    ? Number(estimatedGas) * GAS_BUFFER_MULTIPLIER
    : Number(ethAmount || 0) + Number(estimatedGas) * GAS_BUFFER_MULTIPLIER;
  const insufficientEth =
    isConnected && totalEthNeeded > userEthBalance && totalEthNeeded > 0;

  const ethUsdVal =
    ethAmount && Number(ethAmount) > 0 && ethPrice
      ? `≈ $${(Number(ethAmount) * ethPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";
  const tokenUsdVal =
    tokenAmount && Number(tokenAmount) > 0 && tokenPriceUsd
      ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
      : "";

  const saveTxToHistory = useCallback(
    (hash, type) => {
      try {
        const tx = {
          hash,
          timestamp: Date.now(),
          type,
          tokenAddress: checksummed,
          tokenSymbol,
          amountIn: reversed ? tokenAmount : ethAmount,
          amountOut: reversed ? ethAmount : tokenAmount,
          status: "success",
        };
        const prev = (() => {
          try {
            return JSON.parse(localStorage.getItem("swap_history") || "[]");
          } catch {
            return [];
          }
        })();
        localStorage.setItem(
          "swap_history",
          JSON.stringify([tx, ...prev].slice(0, 20)),
        );
      } catch {}
    },
    [checksummed, tokenSymbol, reversed, tokenAmount, ethAmount],
  );

  const approveToken = async () => {
    setSuccessMsg("Requesting approval…");
    const hash = await walletClient.writeContract({
      address: checksummed,
      abi: ERC20ABI,
      functionName: "approve",
      args: [ONEINCH_ROUTER, MAX_UINT256],
    });
    setSuccessMsg(`Approval pending · ${hash.slice(0, 10)}…`);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });
    if (receipt.status !== "success")
      throw new Error("Approval transaction reverted");
    setSuccessMsg("Token approved ✓");
    await new Promise((r) => setTimeout(r, 800));
  };

  const executeSwap = async () => {
    setErrorMsg("");
    if (!isConnected) {
      setErrorMsg("Connect wallet first");
      return;
    }
    if (!isCorrectNetwork) {
      await switchChain({ chainId: base.id });
      return;
    }
    if (!ethAmount && !tokenAmount) {
      setErrorMsg("Enter an amount");
      return;
    }
    if (!walletClient || !publicClient) {
      setErrorMsg("Wallet not ready");
      return;
    }
    if (Number(inputAmount) <= 0) {
      setErrorMsg("Amount must be > 0");
      return;
    }
    if (insufficientEth) {
      setErrorMsg(`Need ${totalEthNeeded.toFixed(6)} ETH (including gas)`);
      return;
    }
    if (insufficientToken) {
      setErrorMsg(`Insufficient ${tokenSymbol}`);
      return;
    }

    try {
      setLoading(true);
      setSuccessMsg("");
      setErrorMsg("");
      const srcToken = reversed ? checksummed : NATIVE_ETH;
      const dstToken = reversed ? NATIVE_ETH : checksummed;
      const amountWei = reversed
        ? parseUnits(
            truncateDecimals(tokenAmount, actualDecimals),
            actualDecimals,
          ).toString()
        : parseEther(ethAmount).toString();

      if (reversed) {
        const allowance = await publicClient.readContract({
          address: checksummed,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address, ONEINCH_ROUTER],
        });
        if (BigInt(allowance) < BigInt(amountWei)) await approveToken();
      }

      const swapTx = await fetchOneinchSwap({
        srcToken,
        dstToken,
        amount: amountWei,
        fromAddress: address,
        slippage,
      });

      let maxFeePerGas, maxPriorityFeePerGas;
      try {
        const [block, tip] = await Promise.all([
          publicClient.getBlock({ blockTag: "latest" }),
          publicClient.estimateMaxPriorityFeePerGas(),
        ]);
        const baseFee =
          block.baseFeePerGas ?? BigInt(swapTx.gasPrice ?? "1000000000");
        maxPriorityFeePerGas = tip;
        maxFeePerGas = baseFee * 2n + tip;
      } catch {
        maxFeePerGas = BigInt(swapTx.gasPrice ?? "1000000000");
        maxPriorityFeePerGas = BigInt(swapTx.gasPrice ?? "1000000000");
      }

      const hash = await walletClient.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value ?? "0"),
        gas: BigInt(Math.ceil(Number(swapTx.gas) * 1.25)),
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      setSuccessMsg(`Submitted · ${hash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });

      if (receipt.status === "success") {
        setSuccessMsg("Swap confirmed ✓");
        saveTxToHistory(hash, reversed ? "TOKEN_TO_ETH" : "ETH_TO_TOKEN");
        if (
          !reversed &&
          checksummed &&
          tokenSymbol &&
          walletClient?.watchAsset
        ) {
          try {
            await walletClient.watchAsset({
              type: "ERC20",
              options: {
                address: checksummed,
                symbol: tokenSymbol.slice(0, 11),
                decimals: actualDecimals,
                image: tokenLogo ?? undefined,
              },
            });
          } catch {}
        }
        suppressRef.current = true;
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
      if (err?.message?.includes("rejected")) msg = "Transaction rejected";
      else if (
        err?.message?.includes("slippage") ||
        err?.message?.includes("INSUFFICIENT_OUTPUT")
      )
        msg = "Price moved — try higher slippage";
      else if (err?.message?.includes("timeout"))
        msg = "Tx timed out — check wallet, may still confirm";
      else if (err?.message?.includes("Approval"))
        msg = "Approval failed or rejected";
      else if (err?.message) msg = err.message.slice(0, 80);
      setErrorMsg(msg);
      setSuccessMsg("");
    } finally {
      setLoading(false);
      setShowConfirmModal(false);
    }
  };

  const handleMaxClick = (side) => {
    suppressRef.current = false;
    const getMaxEth = () => {
      if (!ethBalData?.value) return "0";
      const bufferEth =
        estimatedGas !== "0"
          ? Number(estimatedGas) * GAS_BUFFER_MULTIPLIER
          : 0.005;
      const bufferWei = BigInt(Math.ceil(bufferEth * 1e18));
      const maxWei =
        ethBalData.value > bufferWei
          ? ethBalData.value - bufferWei
          : ethBalData.value;
      return formatEther(maxWei);
    };
    const getMaxToken = () =>
      tokBalData?.value ? formatUnits(tokBalData.value, actualDecimals) : "0";
    if (side === "top") {
      setActiveInput("top");
      if (reversed) {
        setTokenAmount(getMaxToken());
        setEthAmount("");
      } else {
        setEthAmount(getMaxEth());
        setTokenAmount("");
      }
    } else {
      setActiveInput("bot");
      if (reversed) {
        setEthAmount(getMaxEth());
        setTokenAmount("");
      } else {
        setTokenAmount(getMaxToken());
        setEthAmount("");
      }
    }
  };

  const top = {
    isEth: !reversed,
    symbol: reversed ? tokenSymbol : "ETH",
    logoUrl: reversed ? tokenLogo : null,
    value: reversed ? tokenAmount : ethAmount,
    usd: reversed ? tokenUsdVal : ethUsdVal,
    balance: reversed
      ? `${formatMaxBalance(userTokenBalance)} ${tokenSymbol}`
      : `${formatMaxBalance(userEthBalance)} ETH`,
    isActive: activeInput === "top",
    isPassive: activeInput === "bot",
    onChange: (v) => {
      setActiveInput("top");
      suppressRef.current = false;
      setErrorMsg("");
      setQuoteError("");
      if (reversed) {
        setTokenAmount(v);
        setEthAmount("");
      } else {
        setEthAmount(v);
        setTokenAmount("");
      }
    },
    onFocusInput: () => setActiveInput("top"),
    onMaxClick: () => handleMaxClick("top"),
    showMax: true,
  };

  const bot = {
    isEth: reversed,
    symbol: reversed ? "ETH" : tokenSymbol,
    logoUrl: reversed ? null : tokenLogo,
    value: reversed ? ethAmount : tokenAmount,
    usd: reversed ? ethUsdVal : tokenUsdVal,
    balance: reversed
      ? `${formatMaxBalance(userEthBalance)} ETH`
      : `${formatMaxBalance(userTokenBalance)} ${tokenSymbol}`,
    isActive: activeInput === "bot",
    isPassive: activeInput === "top",
    onChange: (v) => {
      setActiveInput("bot");
      suppressRef.current = false;
      setErrorMsg("");
      setQuoteError("");
      if (reversed) {
        setEthAmount(v);
        setTokenAmount("");
      } else {
        setTokenAmount(v);
        setEthAmount("");
      }
    },
    onFocusInput: () => setActiveInput("bot"),
    onMaxClick: () => handleMaxClick("bot"),
    showMax: true,
  };

  let btnStyle = "disabled",
    btnLabel = "Enter an amount";
  if (loading) {
    btnStyle = "loading";
    btnLabel = "Processing…";
  } else if (quoteLoading) {
    btnStyle = "loading";
    btnLabel = "Fetching quote…";
  } else if (!isConnected) {
    btnStyle = "disabled";
    btnLabel = "Connect wallet";
  } else if (!isCorrectNetwork) {
    btnStyle = "danger";
    btnLabel = "Switch to Base";
  } else if (!outputAmount || Number(outputAmount) <= 0) {
    btnStyle = "disabled";
    btnLabel = "Enter an amount";
  } else if (priceImpact > 15) {
    btnStyle = "danger";
    btnLabel = "Price impact too high";
  } else if (insufficientEth) {
    btnStyle = "danger";
    btnLabel = "Insufficient ETH";
  } else if (insufficientToken) {
    btnStyle = "danger";
    btnLabel = `Insufficient ${tokenSymbol}`;
  } else {
    btnStyle = "ready";
    btnLabel = "Execute Swap →";
  }

  const btnDisabled =
    loading ||
    quoteLoading ||
    !isConnected ||
    !isCorrectNetwork ||
    !outputAmount ||
    Number(outputAmount) <= 0 ||
    insufficientEth ||
    insufficientToken ||
    priceImpact > 15;
  const impactColor =
    priceImpact > 5 ? "var(--er)" : priceImpact > 1 ? "var(--wn)" : "var(--ok)";

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!checksummed) {
    return (
      <div
        className="sr"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "54px 24px",
          borderRadius: 16,
          textAlign: "center",
          background: "var(--bg1)",
          border: "1px solid var(--bd)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg4)",
            border: "1px solid var(--bd)",
            color: "var(--ac)",
          }}
        >
          <LuArrowUpDown size={18} />
        </div>
        <p
          style={{
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Swap
        </p>
        <p
          style={{
            fontFamily: "var(--fm)",
            fontSize: 11,
            color: "var(--t2)",
            lineHeight: 1.8,
            letterSpacing: "0.03em",
          }}
        >
          Search for a token to begin
        </p>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="sr"
        style={{
          width: "100%",
          borderRadius: 16,
          background: "var(--bg1)",
          border: "1px solid var(--bd)",
          boxShadow:
            "0 0 60px rgba(0,212,255,0.04), 0 24px 80px rgba(0,0,0,0.5)",
          overflow: "visible",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: 2,
            borderRadius: "16px 16px 0 0",
            background:
              "linear-gradient(to right, transparent 5%, var(--ac) 40%, var(--ac2) 70%, transparent 95%)",
            opacity: 0.5,
          }}
        />

        <div style={{ padding: "16px" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              padding: "0 2px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Swap
              </span>
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "var(--ac)",
                  background: "var(--acD)",
                  border: "1px solid rgba(0,212,255,0.18)",
                  borderRadius: 5,
                  padding: "2px 8px",
                  textTransform: "uppercase",
                }}
              >
                Base
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button
                className="sr-slip-pill"
                onClick={() => setShowSettingsModal(true)}
              >
                {slippage}% slip
              </button>
              <button
                className="sr-icon-btn"
                onClick={() => setShowSettingsModal(true)}
                title="Settings"
              >
                <LuSettings2 size={14} />
              </button>
            </div>
          </div>

          {/* Wrong network */}
          {isConnected && !isCorrectNetwork && (
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 10,
                background: "rgba(255,69,96,0.07)",
                border: "1px solid rgba(255,69,96,0.2)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: 11,
                  color: "var(--er)",
                }}
              >
                Wrong network — switch to Base
              </span>
              <button
                onClick={() => switchChain({ chainId: base.id })}
                style={{
                  flexShrink: 0,
                  padding: "5px 11px",
                  borderRadius: 7,
                  fontFamily: "var(--fm)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--er)",
                  background: "rgba(255,69,96,0.1)",
                  border: "1px solid rgba(255,69,96,0.25)",
                  cursor: "pointer",
                }}
              >
                Switch
              </button>
            </div>
          )}

          {/* Panels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TokenPanel
              label="You pay"
              {...top}
              quoteLoading={quoteLoading}
              showBalance={isConnected}
            />
            <FlipButton
              onClick={() => {
                setReversed((r) => !r);
                setActiveInput("top");
                suppressRef.current = false;
                setEthAmount("");
                setTokenAmount("");
                setEstimatedGas("0");
                setErrorMsg("");
                setQuoteError("");
                setSuccessMsg("");
              }}
            />
            <TokenPanel
              label="You receive"
              {...bot}
              quoteLoading={quoteLoading}
              showBalance={isConnected}
            />
          </div>

          {/* Quote details */}
          {outputAmount && Number(outputAmount) > 0 && !quoteLoading && (
            <div style={{ marginTop: 10 }}>
              {top.value && Number(top.value) > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 4px",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--fm)",
                      fontSize: 11,
                      color: "var(--t2)",
                    }}
                  >
                    1 {reversed ? tokenSymbol : "ETH"}{" "}
                    <span style={{ color: "var(--t3)" }}>=</span>{" "}
                    <span style={{ color: "var(--t1)", fontWeight: 500 }}>
                      {(
                        Number(outputAmount) / Number(top.value)
                      ).toLocaleString(undefined, {
                        maximumSignificantDigits: 6,
                      })}{" "}
                      {outputSymbol}
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--fm)",
                      fontSize: 9,
                      color: "var(--ac)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    via 1inch
                  </span>
                </div>
              )}
              <div
                style={{
                  background: "var(--bg3)",
                  border: "1px solid var(--bdD)",
                  borderRadius: 9,
                  padding: "3px 13px",
                }}
              >
                <DetailRow
                  label="Min. received"
                  value={`${minReceivedDisplay} ${outputSymbol}`}
                />
                {priceImpact > 0 && (
                  <DetailRow
                    label="Price impact"
                    value={`${priceImpact.toFixed(2)}%`}
                    valueColor={impactColor}
                  />
                )}
                <DetailRow
                  label="Network fee"
                  value={
                    estimatedGas && estimatedGas !== "0"
                      ? `~${estimatedGas} ETH`
                      : "—"
                  }
                  valueColor="var(--t2)"
                />
              </div>
            </div>
          )}

          {/* Notices */}
          <div
            style={{
              marginTop: 9,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {successMsg && <Notice type="success">{successMsg}</Notice>}
            {errorMsg && <Notice type="error">{errorMsg}</Notice>}
            {quoteError && !errorMsg && (
              <Notice type="warn">{quoteError}</Notice>
            )}
            {priceImpact > 5 && priceImpact <= 15 && !errorMsg && (
              <Notice type="warn">
                High price impact ({priceImpact.toFixed(2)}%) — you may get a
                worse rate
              </Notice>
            )}
            {insufficientEth && !errorMsg && (
              <Notice type="warn">
                Need {totalEthNeeded.toFixed(6)} ETH · have{" "}
                {userEthBalance.toFixed(6)} ETH
              </Notice>
            )}
            {insufficientToken && !errorMsg && (
              <Notice type="warn">
                Need {tokenAmount} {tokenSymbol} · have{" "}
                {userTokenBalance.toFixed(6)}
              </Notice>
            )}
          </div>

          {/* CTA */}
          <div style={{ marginTop: 12 }}>
            <SwapButton
              btnStyle={btnStyle}
              label={btnLabel}
              disabled={btnDisabled}
              onClick={() => setShowConfirmModal(true)}
            />
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeSwap}
        swapDetails={{
          fromAmount: reversed ? tokenAmount : ethAmount,
          fromSymbol: reversed ? tokenSymbol : "ETH",
          toAmount: outputAmount,
          toSymbol: outputSymbol,
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
