// src/components/Swap.jsx - MOBILE-OPTIMIZED VERSION
import { useState, useEffect, useCallback, useRef } from "react";
import { LuArrowUpDown, LuSettings2, LuZap } from "react-icons/lu";
import {
  useAccount,
  useBalance,
  useBlockNumber,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import { parseEther, parseUnits, formatEther, getAddress } from "viem";
import ERC20ABI from "../abis/ERC20.json";
import UNISWAP_ROUTER_ABI from "../abis/UniswapV2Router.json";
import axios from "axios";

const ROUTER_ADDRESS = getAddress("0x4752ba5dbc23f44d87826276bf6d2a606c4e5001");
const WETH_ADDRESS = getAddress("0x4200000000000000000000000000000000000006");
const DEFAULT_GAS_EST = "0.005";
const GAS_ESTIMATE_DEBOUNCE_MS = 500;

// ─── Sub-components ────────────────────────────────────────────────────────

function TokenPill({ isEth, symbol }) {
  const label = isEth ? "ETH" : symbol || "TOKEN";
  const initials = isEth ? "Ξ" : label.slice(0, 2).toUpperCase();
  const bgGradient = isEth
    ? "from-[#627eea] to-[#8fa4f2]"
    : "from-cyan-500 to-blue-500";
  
  return (
    // ✅ MOBILE FIX: Better padding and sizing
    <div className="flex items-center gap-2 shrink-0 px-3 py-2 sm:py-1.5 rounded-full border border-white/[0.07] bg-white/[0.04]">
      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold font-mono shrink-0 bg-gradient-to-br ${bgGradient} text-white`}>
        {initials}
      </span>
      {/* ✅ MOBILE FIX: Bigger text on mobile */}
      <span className="font-mono text-sm sm:text-xs font-semibold text-white tracking-wide">
        {label}
      </span>
    </div>
  );
}

function StatRow({ label, value, accent = "cyan", shortLabel }) {
  const colorMap = {
    cyan: "text-cyan-400",
    green: "text-emerald-400",
    orange: "text-amber-400",
    red: "text-red-400",
    muted: "text-slate-500",
  };
  return (
    // ✅ MOBILE FIX: Better spacing
    <div className="flex items-center justify-between gap-3">
      {/* ✅ MOBILE FIX: 11px minimum text size, show short label on mobile */}
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
    error: "bg-red-950/60 border-red-500/25 text-red-300",
    warn: "bg-amber-950/60 border-amber-500/25 text-amber-300",
  };
  const icon = { success: "✓", error: "⚠", warn: "⚠" };
  return (
    // ✅ MOBILE FIX: Better text size
    <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-[11px] font-mono leading-relaxed ${map[type]}`}>
      <span className="shrink-0 mt-px">{icon[type]}</span>
      <span className="break-words">{children}</span>
    </div>
  );
}

function InputBox({
  label,
  value,
  onChange,
  readOnly,
  isEth,
  symbol,
  usd,
  balance,
  showBalance,
  dimmed,
}) {
  const [focused, setFocused] = useState(false);
  
  return (
    // ✅ MOBILE FIX: More padding on mobile
    <div className={`px-5 py-4 sm:px-4 sm:py-3.5 rounded-xl transition-all duration-200 bg-white/[0.025] ${
      focused && !readOnly
        ? "border-cyan-400/35 ring-2 ring-cyan-400/[0.06]"
        : "border-white/[0.06]"
    } border`}>
      {/* ✅ MOBILE FIX: Bigger label text */}
      <span className="font-mono text-[11px] sm:text-[10px] md:text-[9px] text-slate-600 tracking-[0.15em] uppercase mb-2 block">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={value}
          placeholder="0.0"
          readOnly={readOnly}
          onFocus={() => !readOnly && setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`flex-1 min-w-0 bg-transparent outline-none border-none font-mono 
            text-xl sm:text-2xl font-bold
            tabular-nums leading-none
            [appearance:textfield]
            [&::-webkit-outer-spin-button]:appearance-none
            [&::-webkit-inner-spin-button]:appearance-none
            ${dimmed ? "text-slate-400" : "text-white"} placeholder-slate-700`}
        />
        <TokenPill isEth={isEth} symbol={symbol} />
      </div>
      {/* ✅ MOBILE FIX: Better text size */}
      <div className="flex items-center justify-between mt-2">
        <span className="font-mono text-[11px] sm:text-[10px] text-slate-600">{usd}</span>
        {showBalance && (
          <span className="font-mono text-[11px] sm:text-[10px] text-slate-600 tabular-nums">
            Bal: <span className="text-cyan-400 font-semibold">{balance}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function SwapButton({ btnStyle, label, disabled, onClick }) {
  const [hovered, setHovered] = useState(false);
  
  const variants = {
    ready: {
      base: "text-[#001f14] bg-gradient-to-br from-[#00c98a] to-[#00e5a0]",
      shadow: hovered
        ? "shadow-[0_6px_32px_rgba(0,229,160,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]"
        : "shadow-[0_4px_24px_rgba(0,229,160,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]",
      transform: hovered ? "-translate-y-px" : "",
    },
    disabled: {
      base: "text-slate-600 cursor-not-allowed bg-white/[0.03] border border-white/[0.05]",
      shadow: "",
      transform: "",
    },
    danger: {
      base: "text-red-400 cursor-not-allowed bg-red-500/[0.08] border border-red-500/20",
      shadow: "",
      transform: "",
    },
    loading: {
      base: "text-slate-500 cursor-not-allowed bg-white/[0.03] border border-white/[0.05]",
      shadow: "",
      transform: "",
    },
  };

  const v = variants[btnStyle] ?? variants.disabled;
  
  return (
    // ✅ MOBILE FIX: Bigger text and better padding on mobile
    <button
      className={`relative w-full py-4 sm:py-3.5 rounded-xl font-mono 
        text-sm sm:text-xs font-bold 
        tracking-wider sm:tracking-[0.1em] uppercase 
        transition-all duration-200 flex items-center justify-center gap-2.5 select-none overflow-hidden active:scale-[0.98]
        ${v.base} ${v.shadow} ${v.transform}`}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => btnStyle === "ready" && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {btnStyle === "ready" && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.06] to-transparent" />
      )}
      {btnStyle === "loading" && (
        <div className="w-3.5 h-3.5 rounded-full border border-white/10 border-t-slate-400 animate-spin shrink-0" />
      )}
      {btnStyle === "ready" && <LuZap size={14} className="shrink-0 relative" />}
      <span className="relative">{label}</span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function Swap({ tokenAddress, tokenData, ethPrice: appEthPrice }) {
  const { address, isConnected, chain } = useAccount();

  let checksummed = null;
  try {
    checksummed = tokenAddress ? getAddress(tokenAddress) : null;
  } catch {
    checksummed = null;
  }

  const { data: blockNumber } = useBlockNumber({
    chainId: base.id,
    watch: isConnected,
  });

  const { data: ethBalData, refetch: refetchEth, isError: ethBalError } = useBalance({
    address,
    chainId: base.id,
    enabled: !!address && isConnected,
  });

  const { data: tokBalData, refetch: refetchTok, isError: tokBalError } = useBalance({
    address,
    token: checksummed ?? undefined,
    chainId: base.id,
    enabled: !!address && isConnected && !!checksummed,
  });

  useEffect(() => {
    if (!address || !isConnected) return;
    refetchEth();
    if (checksummed) refetchTok();
  }, [blockNumber, address, isConnected, checksummed, refetchEth, refetchTok]);

  useEffect(() => {
    if (!checksummed || !address || !isConnected) return;
    refetchTok();
  }, [checksummed, address, isConnected, refetchTok]);

  const userEthBalance = Number(ethBalData?.formatted ?? 0);
  const userTokenBalance = Number(tokBalData?.formatted ?? 0);

  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChain } = useSwitchChain();

  const [ethAmount, setEthAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [reversed, setReversed] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice, setEthPrice] = useState(appEthPrice || null);
  const [insufficientToken, setInsufficientToken] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastEdited, setLastEdited] = useState("");

  const tokenSymbol = tokenData?.symbol ?? "TOKEN";
  const tokenName = tokenData?.name ?? "Token";
  const actualDecimals = tokBalData?.decimals ?? tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;
  const isCorrectNetwork = chain?.id === base.id;

  useEffect(() => {
    let mounted = true;
    
    if (appEthPrice) {
      setEthPrice(appEthPrice);
      return;
    }
    
    const fetchPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        if (mounted) setEthPrice(res.data.ethereum.usd);
      } catch {
        if (mounted) setEthPrice(3000);
      }
    };
    
    fetchPrice();
    
    return () => {
      mounted = false;
    };
  }, [appEthPrice]);

  const calcTokenFromEth = useCallback(
    (v) => {
      if (!v || !ethPrice || !tokenPriceUsd) return "";
      return ((Number(v) * ethPrice) / tokenPriceUsd).toFixed(6);
    },
    [ethPrice, tokenPriceUsd]
  );

  const calcEthFromToken = useCallback(
    (v) => {
      if (!v || !ethPrice || !tokenPriceUsd) return "";
      return ((Number(v) * tokenPriceUsd) / ethPrice).toFixed(6);
    },
    [ethPrice, tokenPriceUsd]
  );

  useEffect(() => {
    if (!ethPrice || !tokenPriceUsd || !lastEdited) return;
    if (lastEdited === "eth" && ethAmount)
      setTokenAmount(calcTokenFromEth(ethAmount));
    if (lastEdited === "token" && tokenAmount)
      setEthAmount(calcEthFromToken(tokenAmount));
  }, [ethPrice, tokenPriceUsd, calcTokenFromEth, calcEthFromToken, lastEdited, ethAmount, tokenAmount]);

  useEffect(() => {
    setInsufficientToken(
      reversed && !!tokenAmount && Number(tokenAmount) > userTokenBalance
    );
  }, [reversed, tokenAmount, userTokenBalance]);

  const outputAmount = reversed ? ethAmount : tokenAmount;
  const outputSymbol = reversed ? "ETH" : tokenSymbol;
  const minReceived = outputAmount
    ? (Number(outputAmount) * (1 - slippage / 100)).toFixed(6)
    : "0";
  const totalEthNeeded = reversed
    ? Number(estimatedGas)
    : Number(ethAmount || 0) + Number(estimatedGas);
  const insufficientEth =
    isConnected && totalEthNeeded > userEthBalance && totalEthNeeded > 0;

  const ethUsdVal =
    ethAmount && ethPrice
      ? `≈ $${(Number(ethAmount) * ethPrice).toFixed(2)}`
      : "";
  const tokenUsdVal =
    tokenAmount && tokenPriceUsd
      ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toFixed(2)}`
      : "";

  useEffect(() => {
    const controller = new AbortController();
    
    const run = async () => {
      if (
        !isConnected ||
        !isCorrectNetwork ||
        !checksummed ||
        !publicClient ||
        !address ||
        (Number(ethAmount) <= 0 && Number(tokenAmount) <= 0)
      ) {
        setEstimatedGas("0");
        return;
      }
      
      try {
        const gasPrice = await publicClient.getGasPrice();
        const amountIn = reversed ? tokenAmount || "0" : ethAmount || "0";
        if (Number(amountIn) <= 0) {
          setEstimatedGas("0");
          return;
        }
        
        let gasEst;
        if (!reversed) {
          gasEst = await publicClient.estimateContractGas({
            address: ROUTER_ADDRESS,
            abi: UNISWAP_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [
              parseUnits(minReceived, actualDecimals),
              [WETH_ADDRESS, checksummed],
              address,
              BigInt(Math.floor(Date.now() / 1000) + 600),
            ],
            value: parseEther(amountIn),
            account: address,
          });
        } else {
          try {
            gasEst = await publicClient.estimateContractGas({
              address: ROUTER_ADDRESS,
              abi: UNISWAP_ROUTER_ABI,
              functionName: "swapExactTokensForETH",
              args: [
                parseUnits(amountIn, actualDecimals),
                parseEther(minReceived),
                [checksummed, WETH_ADDRESS],
                address,
                BigInt(Math.floor(Date.now() / 1000) + 600),
              ],
              account: address,
            });
          } catch {
            gasEst = BigInt(300000);
          }
        }
        
        if (!controller.signal.aborted) {
          const fmt = Number(formatEther(gasEst * gasPrice)).toFixed(6);
          setEstimatedGas(fmt);
        }
      } catch {
        if (!controller.signal.aborted) {
          setEstimatedGas(DEFAULT_GAS_EST);
        }
      }
    };
    
    const timer = setTimeout(run, GAS_ESTIMATE_DEBOUNCE_MS);
    
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    ethAmount,
    tokenAmount,
    reversed,
    slippage,
    isConnected,
    isCorrectNetwork,
    checksummed,
    publicClient,
    actualDecimals,
    minReceived,
    address,
  ]);

  const approveToken = async (amount) => {
    try {
      setLoading(true);
      setSuccessMsg("");
      setErrorMsg("");
      const hash = await walletClient.writeContract({
        address: checksummed,
        abi: ERC20ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, amount],
      });
      setSuccessMsg(`Approval pending · ${hash.slice(0, 10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });
      if (receipt.status === "success") {
        setSuccessMsg("Token approved ✓");
        setTimeout(() => setSuccessMsg(""), 3000);
        setLoading(false);
        return true;
      }
      throw new Error("Approval failed");
    } catch (err) {
      setSuccessMsg("");
      setErrorMsg(
        err?.message?.includes("rejected")
          ? "Approval rejected"
          : err.message?.slice(0, 80) || "Approval failed"
      );
      setLoading(false);
      return false;
    }
  };

  const handleSwap = async () => {
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
    if ((reversed ? Number(tokenAmount) : Number(ethAmount)) <= 0) {
      setErrorMsg("Amount must be > 0");
      return;
    }
    if (insufficientEth) {
      setErrorMsg(`Need ${totalEthNeeded.toFixed(6)} ETH`);
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
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      if (!reversed) {
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [
            parseUnits(minReceived, actualDecimals),
            [WETH_ADDRESS, checksummed],
            address,
            deadline,
          ],
          value: parseEther(ethAmount),
        });
        setSuccessMsg(`Submitted · ${hash.slice(0, 10)}…`);
        const r = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
        });
        if (r.status === "success") {
          setSuccessMsg("Swap successful ✓");
          setEthAmount("");
          setTokenAmount("");
          refetchEth();
          if (checksummed) refetchTok();
          setTimeout(() => setSuccessMsg(""), 4000);
        } else throw new Error("Transaction failed");
      } else {
        const amountIn = parseUnits(tokenAmount, actualDecimals);
        const allowance = await publicClient.readContract({
          address: checksummed,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address, ROUTER_ADDRESS],
        });
        if (BigInt(allowance) < amountIn) {
          const ok = await approveToken(amountIn);
          if (!ok) throw new Error("Approval failed");
        }
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [
            amountIn,
            parseEther(minReceived),
            [checksummed, WETH_ADDRESS],
            address,
            deadline,
          ],
        });
        setSuccessMsg(`Submitted · ${hash.slice(0, 10)}…`);
        const r = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
        });
        if (r.status === "success") {
          setSuccessMsg("Swap successful ✓");
          setEthAmount("");
          setTokenAmount("");
          refetchEth();
          if (checksummed) refetchTok();
          setTimeout(() => setSuccessMsg(""), 4000);
        } else throw new Error("Transaction failed");
      }
    } catch (err) {
      let msg = "Swap failed";
      if (err?.message?.includes("rejected")) msg = "Transaction rejected";
      else if (err?.message?.includes("slippage"))
        msg = "Price moved — raise slippage";
      else if (err?.message?.includes("timeout")) msg = "Transaction timed out";
      else if (err?.message) msg = err.message.slice(0, 80);
      setErrorMsg(msg);
      setSuccessMsg("");
    } finally {
      setLoading(false);
    }
  };

  // ✅ MOBILE FIX: Show 4 decimals on mobile, 6 on desktop
  const formatBalance = (bal, isMobile = false) => {
    return isMobile ? bal.toFixed(4) : bal.toFixed(6);
  };

  const top = {
    isEth: !reversed,
    symbol: reversed ? tokenSymbol : "ETH",
    value: reversed ? tokenAmount : ethAmount,
    usd: reversed ? tokenUsdVal : ethUsdVal,
    balance: reversed
      ? `${formatBalance(userTokenBalance, true)} ${tokenSymbol}`
      : `${formatBalance(userEthBalance, true)} ETH`,
    onChange: (v) => {
      setLastEdited(reversed ? "token" : "eth");
      if (reversed) {
        setTokenAmount(v);
        setEthAmount(v ? calcEthFromToken(v) : "");
      } else {
        setEthAmount(v);
        setTokenAmount(v ? calcTokenFromEth(v) : "");
      }
    },
  };
  
  const bot = {
    isEth: reversed,
    symbol: reversed ? "ETH" : tokenSymbol,
    value: reversed ? ethAmount : tokenAmount,
    usd: reversed ? ethUsdVal : tokenUsdVal,
    balance: reversed
      ? `${formatBalance(userEthBalance, true)} ETH`
      : `${formatBalance(userTokenBalance, true)} ${tokenSymbol}`,
  };

  let btnStyle = "disabled",
    btnLabel = "Enter Amount";
  if (loading) {
    btnStyle = "loading";
    btnLabel = "Processing…";
  } else if (!isConnected) {
    btnStyle = "disabled";
    btnLabel = "Connect Wallet";
  } else if (!isCorrectNetwork) {
    btnStyle = "danger";
    btnLabel = "Switch to Base";
  } else if (insufficientEth || insufficientToken) {
    btnStyle = "danger";
    btnLabel = "Insufficient Balance";
  } else if (!outputAmount || Number(outputAmount) <= 0) {
    btnStyle = "disabled";
    btnLabel = "Enter Amount";
  } else {
    btnStyle = "ready";
    btnLabel = `Swap ${reversed ? tokenSymbol : "ETH"} → ${reversed ? "ETH" : tokenSymbol}`;
  }

  const btnDisabled =
    loading ||
    !isConnected ||
    !isCorrectNetwork ||
    !outputAmount ||
    Number(outputAmount) <= 0 ||
    insufficientEth ||
    insufficientToken;

  if (!checksummed) {
    return (
      // ✅ MOBILE FIX: Better empty state padding
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:py-16 rounded-2xl text-center bg-white/[0.01] border border-dashed border-white/[0.06]">
        {/* ✅ MOBILE FIX: Bigger icon box */}
        <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-3 bg-white/[0.03] border border-white/[0.06]">
          <LuArrowUpDown className="text-slate-700" size={20} />
        </div>
        <p className="font-display text-sm font-semibold text-slate-600 mb-1">
          Swap Interface
        </p>
        <p className="font-mono text-xs sm:text-[10px] text-slate-700 leading-relaxed max-w-[200px]">
          Fetch a token above to enable swapping
        </p>
      </div>
    );
  }

  return (
    // ✅ MOBILE FIX: Better padding
    <div className="relative rounded-2xl overflow-hidden w-full bg-[#0a0f1a] border border-white/[0.06]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 via-blue-500/50 via-cyan-500/30 to-transparent" />
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full pointer-events-none blur-3xl opacity-[0.06] bg-[radial-gradient(ellipse,#22d3ee,transparent)]" />

      {/* ✅ MOBILE FIX: More padding on mobile */}
      <div className="relative p-6 sm:p-5 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            {/* ✅ MOBILE FIX: Better text sizing */}
            <h2 className="font-display text-lg sm:text-base font-bold text-white tracking-tight">
              Swap
            </h2>
            <p className="font-mono text-[11px] sm:text-[10px] text-slate-600 tracking-widest uppercase mt-0.5">
              {tokenData ? `${tokenName} / ETH · Base` : "Base Network"}
            </p>
          </div>
          {/* ✅ MOBILE FIX: Bigger settings button on mobile */}
          <button
            title="Settings"
            className="flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg text-slate-600 hover:text-cyan-400 transition-colors duration-200 border border-white/[0.06] bg-white/[0.02]"
          >
            <LuSettings2 size={16} className="sm:w-[15px] sm:h-[15px]" />
          </button>
        </div>

        {isConnected && !isCorrectNetwork && (
          <div className="flex flex-col items-center gap-3 px-4 py-3 rounded-xl text-center bg-red-500/[0.08] border border-red-500/20">
            {/* ✅ MOBILE FIX: Better text size */}
            <p className="font-mono text-xs sm:text-[11px] text-red-400 tracking-wide">
              Connected to <strong>{chain?.name || "wrong network"}</strong>
            </p>
            {/* ✅ MOBILE FIX: Better button sizing */}
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className="px-5 py-2 sm:px-4 sm:py-1.5 rounded-lg font-mono text-xs sm:text-[11px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] bg-gradient-to-br from-red-600 to-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.25)]"
            >
              Switch to Base
            </button>
          </div>
        )}

        {(ethBalError || tokBalError) && (
          <StatusBadge type="warn">
            Balance fetch failed - displayed values may be stale
          </StatusBadge>
        )}

        <div className="flex flex-col gap-1 relative">
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

          <div className="relative flex items-center justify-center h-0 z-10">
            {/* ✅ MOBILE FIX: Bigger flip button on mobile */}
            <button
              onClick={() => setReversed((r) => !r)}
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
            usd={bot.usd}
            balance={bot.balance}
            showBalance={isConnected}
            dimmed
          />
        </div>

        {outputAmount && Number(outputAmount) > 0 && (
          // ✅ MOBILE FIX: Better text sizing
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg overflow-hidden bg-indigo-500/[0.05] border border-indigo-500/[0.12]">
            <span className="font-mono text-[11px] sm:text-[10px] md:text-[9px] font-bold tracking-[0.15em] uppercase text-indigo-400 shrink-0">
              Route
            </span>
            <div className="w-1 h-1 rounded-full bg-slate-700 shrink-0" />
            <span className="font-mono text-xs sm:text-[11px] sm:text-[10px] text-slate-600 truncate">
              {reversed ? tokenSymbol : "ETH"} → WETH →{" "}
              {reversed ? "ETH" : tokenSymbol}
            </span>
          </div>
        )}

        {/* ✅ MOBILE FIX: Better padding and text */}
        <div className="flex flex-col gap-2.5 px-5 py-4 sm:px-4 sm:py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
          <StatRow
            label="ETH Price"
            shortLabel="ETH"
            value={
              ethPrice
                ? `$${ethPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : "—"
            }
            accent="green"
          />
          <StatRow
            label={`${tokenSymbol} Price`}
            shortLabel={tokenSymbol}
            value={tokenPriceUsd ? `$${tokenPriceUsd.toFixed(8)}` : "—"}
            accent="green"
          />

          <div className="h-px bg-white/[0.04]" />

          <StatRow
            label="Min Received"
            shortLabel="Min"
            value={`${minReceived} ${outputSymbol}`}
            accent="cyan"
          />
          <StatRow
            label="Network Fee"
            shortLabel="Fee"
            value={estimatedGas !== "0" ? `~${estimatedGas} ETH` : "—"}
            accent="orange"
          />

          <div className="h-px bg-white/[0.04]" />

          <div className="flex items-center justify-between gap-3">
            {/* ✅ MOBILE FIX: Better text size */}
            <span className="font-mono text-[11px] sm:text-[10px] text-slate-500 tracking-widest uppercase">
              Slippage
            </span>
            <div className="flex items-center gap-1.5">
              {[0.1, 0.5, 1].map((p) => (
                // ✅ MOBILE FIX: Bigger slippage buttons on mobile
                <button
                  key={p}
                  onClick={() => setSlippage(p)}
                  className={`px-3 py-2 sm:px-2 sm:py-1 rounded-md font-mono text-xs sm:text-[11px] sm:text-[10px] font-semibold transition-all duration-150 ${
                    slippage === p
                      ? "bg-cyan-400/10 border border-cyan-400/30 text-cyan-400"
                      : "bg-white/[0.03] border border-white/[0.06] text-slate-500"
                  }`}
                >
                  {p}%
                </button>
              ))}
              {/* ✅ MOBILE FIX: Better custom input */}
              <div className="flex items-center gap-1 px-3 py-2 sm:px-2 sm:py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  className="w-9 sm:w-8 bg-transparent outline-none font-mono text-xs sm:text-[11px] sm:text-[10px] font-bold text-white text-right tabular-nums"
                />
                <span className="font-mono text-xs sm:text-[11px] sm:text-[10px] text-amber-400 font-bold">
                  %
                </span>
              </div>
            </div>
          </div>

          {isConnected && (
            <>
              <div className="h-px bg-white/[0.04]" />
              {/* ✅ MOBILE FIX: Stack balances on very small screens */}
              <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2">
                <span className="font-mono text-[11px] sm:text-[10px] text-slate-600 tracking-widest uppercase flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Wallet
                </span>
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* ✅ MOBILE FIX: 4 decimals mobile, 6 desktop via CSS */}
                  <span className="font-mono text-xs sm:text-[11px] sm:text-[10px] tabular-nums">
                    <span className="text-slate-600">ETH </span>
                    <span className="text-cyan-400 font-semibold">
                      <span className="sm:hidden">{userEthBalance.toFixed(4)}</span>
                      <span className="hidden sm:inline">{userEthBalance.toFixed(6)}</span>
                    </span>
                  </span>
                  {checksummed && (
                    <span className="font-mono text-xs sm:text-[11px] sm:text-[10px] tabular-nums">
                      <span className="text-slate-600">{tokenSymbol} </span>
                      <span className="text-cyan-400 font-semibold">
                        <span className="sm:hidden">{userTokenBalance.toFixed(4)}</span>
                        <span className="hidden sm:inline">{userTokenBalance.toFixed(6)}</span>
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {successMsg && <StatusBadge type="success">{successMsg}</StatusBadge>}
        {errorMsg && <StatusBadge type="error">{errorMsg}</StatusBadge>}
        {/* ✅ MOBILE FIX: Better warning text with line breaks */}
        {insufficientEth && !errorMsg && (
          <StatusBadge type="warn">
            <span className="sm:hidden">
              Need {totalEthNeeded.toFixed(4)} ETH<br />
              Have {userEthBalance.toFixed(4)} ETH
            </span>
            <span className="hidden sm:inline">
              Need {totalEthNeeded.toFixed(6)} ETH · have {userEthBalance.toFixed(6)} ETH
            </span>
          </StatusBadge>
        )}
        {insufficientToken && !errorMsg && (
          <StatusBadge type="warn">
            <span className="sm:hidden">
              Need {Number(tokenAmount).toFixed(4)} {tokenSymbol}<br />
              Have {userTokenBalance.toFixed(4)}
            </span>
            <span className="hidden sm:inline">
              Need {tokenAmount} {tokenSymbol} · have {userTokenBalance.toFixed(6)}
            </span>
          </StatusBadge>
        )}

        <SwapButton
          btnStyle={btnStyle}
          label={btnLabel}
          disabled={btnDisabled}
          onClick={handleSwap}
        />
      </div>
    </div>
  );
}