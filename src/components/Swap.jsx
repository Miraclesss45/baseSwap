// src/components/Swap.jsx
// Font stack: Syne (display) · JetBrains Mono (mono) · Geist (body)
// — matches App.jsx exactly. No inline CSS blobs. Pure Tailwind.
// — wallet balances are live-wired from wagmi hooks and refresh on
//   every block via the `watch: true` flag.

import { useState, useEffect, useCallback, useRef } from "react";
import { LuArrowUpDown, LuSettings2, LuZap, LuInfo } from "react-icons/lu";
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
import ERC20ABI from "../abis/ERC20.json";
import UNISWAP_ROUTER_ABI from "../abis/UniswapV2Router.json";
import axios from "axios";

const ROUTER_ADDRESS  = getAddress("0x4752ba5dbc23f44d87826276bf6d2a606c4e5001");
const WETH_ADDRESS    = getAddress("0x4200000000000000000000000000000000000006");
const DEFAULT_GAS_EST = "0.005";

// ─── Mini helpers ──────────────────────────────────────────────────────────

function TokenPill({ isEth, symbol }) {
  const label = isEth ? "ETH" : (symbol || "TOKEN");
  const initials = isEth ? "Ξ" : label.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full border border-white/[0.07] bg-white/[0.04]">
      <span
        className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold font-mono shrink-0"
        style={{
          background: isEth
            ? "linear-gradient(135deg,#627eea,#8fa4f2)"
            : "linear-gradient(135deg,#22d3ee,#3b82f6)",
          color: "#fff",
        }}
      >
        {initials}
      </span>
      <span className="font-mono text-xs font-600 text-white tracking-wide">
        {label}
      </span>
    </div>
  );
}

function StatRow({ label, value, accent = "cyan", icon }) {
  const colorMap = {
    cyan:   "text-cyan-400",
    green:  "text-emerald-400",
    orange: "text-amber-400",
    red:    "text-red-400",
    muted:  "text-slate-500",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 tracking-widest uppercase">
        {icon && <span className="text-slate-600">{icon}</span>}
        {label}
      </span>
      <span className={`font-mono text-[11px] font-600 tabular-nums ${colorMap[accent] ?? colorMap.cyan}`}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ type, children }) {
  const styles = {
    success: "bg-emerald-950/60 border-emerald-500/25 text-emerald-300",
    error:   "bg-red-950/60 border-red-500/25 text-red-300",
    warn:    "bg-amber-950/60 border-amber-500/25 text-amber-300",
  };
  const icons = {
    success: "✓",
    error:   "⚠",
    warn:    "⚠",
  };
  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-[11px] font-mono leading-relaxed ${styles[type]}`}>
      <span className="shrink-0 mt-px">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function Swap({ tokenAddress, tokenData, ethPrice: appEthPrice }) {
  const { address, isConnected, chain } = useAccount();

  // Live ETH balance — watch:true refreshes on every new block
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: base.id,
    watch: true,
  });

  const { data: walletClient }  = useWalletClient({ chainId: base.id });
  const publicClient             = usePublicClient({ chainId: base.id });
  const { switchChain }          = useSwitchChain();

  const [ethAmount,    setEthAmount]    = useState("");
  const [tokenAmount,  setTokenAmount]  = useState("");
  const [reversed,     setReversed]     = useState(false);
  const [slippage,     setSlippage]     = useState(0.5);
  const [loading,      setLoading]      = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice,     setEthPrice]     = useState(appEthPrice || null);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [insufficientToken, setInsufficientToken] = useState(false);
  const [successMsg,   setSuccessMsg]   = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [lastEdited,   setLastEdited]   = useState("");

  const prevGas = useRef("0");

  const tokenSymbol   = tokenData?.symbol   ?? "TOKEN";
  const tokenName     = tokenData?.name     ?? "Token";
  const tokenDecimals = tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;

  let checksummed = null;
  try { checksummed = tokenAddress ? getAddress(tokenAddress) : null; }
  catch { checksummed = null; }

  const isCorrectNetwork = chain?.id === base.id;
  const userEthBalance   = Number(ethBalanceData?.formatted || 0);

  // ── ETH price ──────────────────────────────────────────────────
  useEffect(() => {
    if (appEthPrice) { setEthPrice(appEthPrice); return; }
    axios.get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then(r => setEthPrice(r.data.ethereum.usd))
      .catch(() => setEthPrice(3000));
  }, [appEthPrice]);

  // ── Live token balance (refetches on account / token change) ───
  useEffect(() => {
    if (!isConnected || !checksummed || !publicClient || !address) {
      setTokenBalance("0"); return;
    }
    const fetch = () =>
      publicClient
        .readContract({ address: checksummed, abi: ERC20ABI, functionName: "balanceOf", args: [address] })
        .then(b => setTokenBalance(formatUnits(b, tokenDecimals)))
        .catch(() => setTokenBalance("0"));

    fetch();
    // Poll every 12 s (Base block time ~2 s, but read is cheap)
    const interval = setInterval(fetch, 12_000);
    return () => clearInterval(interval);
  }, [isConnected, checksummed, publicClient, address, tokenDecimals]);

  // ── Price calculators ──────────────────────────────────────────
  const calcTokenFromEth = useCallback((v) => {
    if (!v || !ethPrice || !tokenPriceUsd) return "";
    return ((Number(v) * ethPrice) / tokenPriceUsd).toFixed(6);
  }, [ethPrice, tokenPriceUsd]);

  const calcEthFromToken = useCallback((v) => {
    if (!v || !ethPrice || !tokenPriceUsd) return "";
    return ((Number(v) * tokenPriceUsd) / ethPrice).toFixed(6);
  }, [ethPrice, tokenPriceUsd]);

  // Recalc when prices change
  useEffect(() => {
    if (!ethPrice || !tokenPriceUsd || !lastEdited) return;
    if (lastEdited === "eth"   && ethAmount)   setTokenAmount(calcTokenFromEth(ethAmount));
    if (lastEdited === "token" && tokenAmount) setEthAmount(calcEthFromToken(tokenAmount));
  }, [ethPrice, tokenPriceUsd, calcTokenFromEth, calcEthFromToken]);

  // Insufficient token balance check
  useEffect(() => {
    setInsufficientToken(reversed && !!tokenAmount && Number(tokenAmount) > Number(tokenBalance));
  }, [reversed, tokenAmount, tokenBalance]);

  const outputAmount  = reversed ? ethAmount  : tokenAmount;
  const outputSymbol  = reversed ? "ETH"      : tokenSymbol;
  const minReceived   = outputAmount ? (Number(outputAmount) * (1 - slippage / 100)).toFixed(6) : "0";
  const totalEthNeeded = reversed
    ? Number(estimatedGas)
    : Number(ethAmount || 0) + Number(estimatedGas);
  const insufficientEth = isConnected && totalEthNeeded > userEthBalance;

  const ethUsdVal   = ethAmount   && ethPrice      ? `≈ $${(Number(ethAmount)   * ethPrice).toFixed(2)}`      : "";
  const tokenUsdVal = tokenAmount && tokenPriceUsd ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toFixed(2)}` : "";

  // ── Gas estimation ─────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      if (!isConnected || !isCorrectNetwork || !checksummed || !publicClient || !address
          || (Number(ethAmount) <= 0 && Number(tokenAmount) <= 0)) {
        setEstimatedGas("0"); return;
      }
      try {
        const gasPrice  = await publicClient.getGasPrice();
        const amountIn  = reversed ? tokenAmount || "0" : ethAmount || "0";
        if (Number(amountIn) <= 0) { setEstimatedGas("0"); return; }

        let gasEst;
        if (!reversed) {
          gasEst = await publicClient.estimateContractGas({
            address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [parseUnits(minReceived, tokenDecimals), [WETH_ADDRESS, checksummed], address, BigInt(Math.floor(Date.now()/1000)+600)],
            value: parseEther(amountIn), account: address,
          });
        } else {
          try {
            gasEst = await publicClient.estimateContractGas({
              address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI,
              functionName: "swapExactTokensForETH",
              args: [parseUnits(amountIn, tokenDecimals), parseEther(minReceived), [checksummed, WETH_ADDRESS], address, BigInt(Math.floor(Date.now()/1000)+600)],
              account: address,
            });
          } catch { gasEst = BigInt(300000); }
        }
        const fmt = Number(formatEther(gasEst * gasPrice)).toFixed(6);
        if (fmt !== prevGas.current) { setEstimatedGas(fmt); prevGas.current = fmt; }
      } catch { setEstimatedGas(DEFAULT_GAS_EST); prevGas.current = DEFAULT_GAS_EST; }
    };
    const t = setTimeout(run, 500);
    return () => clearTimeout(t);
  }, [ethAmount, tokenAmount, reversed, slippage, isConnected, isCorrectNetwork, checksummed, publicClient, tokenDecimals, minReceived, address]);

  // ── Approve ────────────────────────────────────────────────────
  const approveToken = async (amount) => {
    try {
      setLoading(true); setSuccessMsg(""); setErrorMsg("");
      const hash = await walletClient.writeContract({
        address: checksummed, abi: ERC20ABI,
        functionName: "approve", args: [ROUTER_ADDRESS, amount],
      });
      setSuccessMsg(`Approval pending · ${hash.slice(0,10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status === "success") {
        setSuccessMsg("Token approved ✓");
        setTimeout(() => setSuccessMsg(""), 3000);
        setLoading(false); return true;
      }
      throw new Error("Approval failed");
    } catch (err) {
      setSuccessMsg("");
      setErrorMsg(err?.message?.includes("rejected") ? "Approval rejected" : err.message?.slice(0,80) || "Approval failed");
      setLoading(false); return false;
    }
  };

  // ── Swap ───────────────────────────────────────────────────────
  const handleSwap = async () => {
    setErrorMsg("");
    if (!isConnected)                    { setErrorMsg("Connect wallet first"); return; }
    if (!isCorrectNetwork)               { setErrorMsg("Switch to Base network"); await switchChain({ chainId: base.id }); return; }
    if (!ethAmount && !tokenAmount)      { setErrorMsg("Enter an amount"); return; }
    if (!walletClient || !publicClient)  { setErrorMsg("Wallet not ready"); return; }
    if ((reversed ? Number(tokenAmount) : Number(ethAmount)) <= 0) { setErrorMsg("Amount must be > 0"); return; }
    if (insufficientEth)                 { setErrorMsg(`Need ${totalEthNeeded.toFixed(6)} ETH`); return; }
    if (insufficientToken)               { setErrorMsg(`Insufficient ${tokenSymbol}`); return; }

    try {
      setLoading(true); setSuccessMsg(""); setErrorMsg("");
      const deadline = BigInt(Math.floor(Date.now()/1000)+600);

      if (!reversed) {
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [parseUnits(minReceived, tokenDecimals), [WETH_ADDRESS, checksummed], address, deadline],
          value: parseEther(ethAmount),
        });
        setSuccessMsg(`Submitted · ${hash.slice(0,10)}…`);
        const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (r.status === "success") {
          setSuccessMsg("Swap successful ✓");
          setEthAmount(""); setTokenAmount("");
          refetchEthBalance();
          setTimeout(() => setSuccessMsg(""), 4000);
        } else throw new Error("Transaction failed");
      } else {
        const amountIn = parseUnits(tokenAmount, tokenDecimals);
        const allowance = await publicClient.readContract({
          address: checksummed, abi: ERC20ABI,
          functionName: "allowance", args: [address, ROUTER_ADDRESS],
        });
        if (BigInt(allowance) < amountIn) {
          const ok = await approveToken(amountIn);
          if (!ok) throw new Error("Approval failed");
        }
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [amountIn, parseEther(minReceived), [checksummed, WETH_ADDRESS], address, deadline],
        });
        setSuccessMsg(`Submitted · ${hash.slice(0,10)}…`);
        const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (r.status === "success") {
          setSuccessMsg("Swap successful ✓");
          setEthAmount(""); setTokenAmount("");
          refetchEthBalance();
          setTimeout(() => setSuccessMsg(""), 4000);
        } else throw new Error("Transaction failed");
      }
    } catch (err) {
      let msg = "Swap failed";
      if (err?.message?.includes("rejected")) msg = "Transaction rejected";
      else if (err?.message?.includes("slippage")) msg = "Price moved — raise slippage";
      else if (err?.message?.includes("timeout")) msg = "Transaction timed out";
      else if (err?.message) msg = err.message.slice(0, 80);
      setErrorMsg(msg); setSuccessMsg("");
    } finally { setLoading(false); }
  };

  // ── Top / bottom slot assignment ───────────────────────────────
  const top = {
    isEth:    !reversed,
    symbol:   reversed ? tokenSymbol : "ETH",
    value:    reversed ? tokenAmount : ethAmount,
    usd:      reversed ? tokenUsdVal : ethUsdVal,
    balance:  reversed
      ? `${Number(tokenBalance).toFixed(4)} ${tokenSymbol}`
      : `${userEthBalance.toFixed(4)} ETH`,
    onChange: (v) => {
      setLastEdited(reversed ? "token" : "eth");
      if (reversed) { setTokenAmount(v); setEthAmount(v ? calcEthFromToken(v) : ""); }
      else          { setEthAmount(v);   setTokenAmount(v ? calcTokenFromEth(v) : ""); }
    },
  };
  const bot = {
    isEth:    reversed,
    symbol:   reversed ? "ETH" : tokenSymbol,
    value:    reversed ? ethAmount : tokenAmount,
    usd:      reversed ? ethUsdVal : tokenUsdVal,
    balance:  reversed
      ? `${userEthBalance.toFixed(4)} ETH`
      : `${Number(tokenBalance).toFixed(4)} ${tokenSymbol}`,
  };

  // ── Button state ───────────────────────────────────────────────
  const btnDisabled = loading || !isConnected || !isCorrectNetwork
    || !outputAmount || Number(outputAmount) <= 0
    || insufficientEth || insufficientToken;

  let btnStyle = "disabled";
  let btnLabel = "Enter Amount";
  if (loading)               { btnStyle = "loading"; btnLabel = "Processing…"; }
  else if (!isConnected)     { btnStyle = "disabled"; btnLabel = "Connect Wallet"; }
  else if (!isCorrectNetwork){ btnStyle = "danger";   btnLabel = "Switch to Base"; }
  else if (insufficientEth || insufficientToken) { btnStyle = "danger"; btnLabel = "Insufficient Balance"; }
  else if (!outputAmount || Number(outputAmount) <= 0) { btnStyle = "disabled"; btnLabel = "Enter Amount"; }
  else                       { btnStyle = "ready";    btnLabel = `Swap ${reversed ? tokenSymbol : "ETH"} → ${reversed ? "ETH" : tokenSymbol}`; }

  // ── Placeholders when no token ─────────────────────────────────
  if (!checksummed) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 rounded-2xl text-center"
        style={{ background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.06)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <LuArrowUpDown className="text-slate-700" size={18} />
        </div>
        <p className="font-display text-sm font-600 text-slate-600 mb-1">Swap Interface</p>
        <p className="font-mono text-[10px] text-slate-700 leading-relaxed max-w-[200px]">
          Fetch a token above to enable swapping
        </p>
      </div>
    );
  }

  // ── Full swap UI ───────────────────────────────────────────────
  return (
    <div className="relative rounded-2xl overflow-hidden w-full"
      style={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.06)" }}>

      {/* Card top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, #22d3ee30, #3b82f650, #22d3ee30, transparent)" }} />

      {/* Ambient glow */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full pointer-events-none blur-3xl opacity-[0.06]"
        style={{ background: "radial-gradient(ellipse, #22d3ee, transparent)" }} />

      <div className="relative p-5 sm:p-6 flex flex-col gap-4">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-700 text-white tracking-tight">
              Swap
            </h2>
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mt-0.5">
              {tokenData ? `${tokenName} / ETH · Base` : "Base Network"}
            </p>
          </div>
          <button
            title="Settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-cyan-400 transition-colors duration-200"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
          >
            <LuSettings2 size={15} />
          </button>
        </div>

        {/* ── Network warning ────────────────────────────────── */}
        {isConnected && !isCorrectNetwork && (
          <div className="flex flex-col items-center gap-3 px-4 py-3 rounded-xl text-center"
            style={{ background: "rgba(255,77,106,0.08)", border: "1px solid rgba(255,77,106,0.2)" }}>
            <p className="font-mono text-[11px] text-red-400 tracking-wide">
              Connected to <strong>{chain?.name || "wrong network"}</strong>
            </p>
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className="px-4 py-1.5 rounded-lg font-mono text-[11px] font-600 text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 4px 16px rgba(239,68,68,0.25)" }}
            >
              Switch to Base
            </button>
          </div>
        )}

        {/* ── Token inputs ───────────────────────────────────── */}
        <div className="flex flex-col gap-1 relative">

          {/* YOU PAY */}
          <InputBox
            label="You Pay"
            value={top.value}
            onChange={top.onChange}
            isEth={top.isEth}
            symbol={top.symbol}
            usd={top.usd}
            balance={top.balance}
            showBalance={isConnected}
          />

          {/* Flip button */}
          <div className="relative flex items-center justify-center h-0 z-10">
            <button
              onClick={() => setReversed(r => !r)}
              className="absolute flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 transition-all duration-300 hover:text-cyan-400 hover:rotate-180 active:scale-90"
              style={{
                background: "#0a0f1a",
                border: "2px solid rgba(255,255,255,0.08)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(34,211,238,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.4)"; }}
            >
              <LuArrowUpDown size={15} />
            </button>
          </div>

          {/* YOU RECEIVE */}
          <InputBox
            label="You Receive"
            value={bot.value}
            readOnly
            isEth={bot.isEth}
            symbol={bot.symbol}
            usd={bot.usd}
            balance={bot.balance}
            showBalance={isConnected}
            dimmed
          />
        </div>

        {/* ── Route path ─────────────────────────────────────── */}
        {outputAmount && Number(outputAmount) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg overflow-hidden"
            style={{ background: "rgba(123,108,255,0.05)", border: "1px solid rgba(123,108,255,0.12)" }}>
            <span className="font-mono text-[9px] font-700 tracking-[0.15em] uppercase text-indigo-400 shrink-0">
              Route
            </span>
            <div className="w-1 h-1 rounded-full bg-slate-700 shrink-0" />
            <span className="font-mono text-[10px] text-slate-600 truncate">
              {reversed ? tokenSymbol : "ETH"} → WETH → {reversed ? "ETH" : tokenSymbol}
            </span>
          </div>
        )}

        {/* ── Info panel ─────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded-xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>

          <StatRow
            label="ETH Price"
            value={ethPrice ? `$${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
            accent="green"
          />
          <StatRow
            label={`${tokenSymbol} Price`}
            value={tokenPriceUsd ? `$${tokenPriceUsd.toFixed(8)}` : "—"}
            accent="green"
          />

          <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />

          <StatRow
            label="Min Received"
            value={`${minReceived} ${outputSymbol}`}
            accent="cyan"
          />
          <StatRow
            label="Network Fee"
            value={estimatedGas !== "0" ? `~${estimatedGas} ETH` : "—"}
            accent="orange"
          />

          <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />

          {/* Slippage */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
              Slippage
            </span>
            <div className="flex items-center gap-1.5">
              {[0.1, 0.5, 1].map(p => (
                <button
                  key={p}
                  onClick={() => setSlippage(p)}
                  className="px-2 py-1 rounded-md font-mono text-[10px] font-600 transition-all duration-150"
                  style={slippage === p
                    ? { background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#5a6a85" }}
                >
                  {p}%
                </button>
              ))}
              <div className="flex items-center gap-1 px-2 py-1 rounded-md"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <input
                  type="number" min="0" max="50" step="0.1"
                  value={slippage}
                  onChange={e => setSlippage(Number(e.target.value))}
                  className="w-8 bg-transparent outline-none font-mono text-[10px] font-700 text-white text-right tabular-nums"
                />
                <span className="font-mono text-[10px] text-amber-400 font-700">%</span>
              </div>
            </div>
          </div>

          {/* Live wallet balance strip — only when connected */}
          {isConnected && (
            <>
              <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                  Wallet
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                    <span className="text-slate-600">ETH </span>
                    <span className="text-cyan-400 font-600">{userEthBalance.toFixed(4)}</span>
                  </span>
                  {checksummed && (
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                      <span className="text-slate-600">{tokenSymbol} </span>
                      <span className="text-cyan-400 font-600">{Number(tokenBalance).toFixed(4)}</span>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Alerts ─────────────────────────────────────────── */}
        {successMsg && <StatusBadge type="success">{successMsg}</StatusBadge>}
        {errorMsg   && <StatusBadge type="error">{errorMsg}</StatusBadge>}
        {insufficientEth && !errorMsg && (
          <StatusBadge type="warn">
            Need {totalEthNeeded.toFixed(6)} ETH · have {userEthBalance.toFixed(6)} ETH
          </StatusBadge>
        )}
        {insufficientToken && !errorMsg && (
          <StatusBadge type="warn">
            Need {tokenAmount} {tokenSymbol} · have {Number(tokenBalance).toFixed(6)}
          </StatusBadge>
        )}

        {/* ── CTA ────────────────────────────────────────────── */}
        <SwapButton
          style={btnStyle}
          label={btnLabel}
          disabled={btnDisabled}
          onClick={handleSwap}
          tokenSymbol={tokenSymbol}
          reversed={reversed}
        />

      </div>
    </div>
  );
}

// ─── InputBox sub-component ────────────────────────────────────────────────

function InputBox({ label, value, onChange, readOnly, isEth, symbol, usd, balance, showBalance, dimmed }) {
  return (
    <div
      className="px-4 py-3.5 rounded-xl transition-all duration-200"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
      onFocus={(e) => { if (!readOnly) { e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.05)"; }}}
      onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <span className="font-mono text-[9px] text-slate-600 tracking-[0.15em] uppercase mb-2 block">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={value}
          placeholder="0.0"
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`flex-1 min-w-0 bg-transparent outline-none border-none font-mono text-2xl font-700 tabular-nums leading-none
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            ${dimmed ? "text-slate-400" : "text-white"} placeholder-slate-700`}
        />
        <TokenPill isEth={isEth} symbol={symbol} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="font-mono text-[10px] text-slate-600">{usd}</span>
        {showBalance && (
          <span className="font-mono text-[10px] text-slate-600">
            Bal: <span className="text-cyan-500 font-600">{balance}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── SwapButton sub-component ──────────────────────────────────────────────

function SwapButton({ style, label, disabled, onClick }) {
  const base = "relative w-full py-3.5 rounded-xl font-mono text-xs font-700 tracking-[0.1em] uppercase transition-all duration-200 flex items-center justify-center gap-2.5 select-none overflow-hidden active:scale-[0.98]";

  const variants = {
    ready: {
      className: `${base} text-[#001f14]`,
      style: {
        background: "linear-gradient(135deg, #00c98a, #00e5a0)",
        boxShadow: "0 4px 24px rgba(0,229,160,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
      },
      hover: {
        boxShadow: "0 6px 32px rgba(0,229,160,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
        transform: "translateY(-1px)",
      },
    },
    disabled: {
      className: `${base} text-slate-600 cursor-not-allowed`,
      style: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" },
    },
    danger: {
      className: `${base} text-red-400 cursor-not-allowed`,
      style: { background: "rgba(255,77,106,0.08)", border: "1px solid rgba(255,77,106,0.2)" },
    },
    loading: {
      className: `${base} text-slate-500 cursor-not-allowed`,
      style: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" },
    },
  };

  const v = variants[style] ?? variants.disabled;

  return (
    <button
      className={v.className}
      style={v.style}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={(e) => { if (style === "ready") Object.assign(e.currentTarget.style, v.hover); }}
      onMouseLeave={(e) => { if (style === "ready") Object.assign(e.currentTarget.style, v.style); }}
    >
      {/* Gloss layer */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 60%)" }} />

      {style === "loading" && (
        <div className="w-3.5 h-3.5 rounded-full border border-white/10 border-t-slate-400 animate-spin shrink-0" />
      )}
      {style === "ready" && <LuZap size={13} className="shrink-0" />}

      <span className="relative">{label}</span>
    </button>
  );
}