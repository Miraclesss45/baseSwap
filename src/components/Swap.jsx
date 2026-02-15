import React, { useState, useEffect, useCallback, useRef } from "react";
import { LuArrowUpDown, LuSettings2, LuInfo, LuZap } from "react-icons/lu";
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

const ROUTER_ADDRESS = getAddress("0x4752ba5dbc23f44d87826276bf6d2a606c4e5001");
const WETH_ADDRESS = getAddress("0x4200000000000000000000000000000000000006");
const DEFAULT_GAS_ESTIMATE = "0.005";

/* ─────────────────────────────────────────────────────────────
   INLINE STYLES  (no Tailwind dependency for design-critical
   elements, so the card always looks right)
───────────────────────────────────────────────────────────── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  .swap-root {
    --c-bg:        #090c12;
    --c-surface:   #0e1320;
    --c-panel:     #121829;
    --c-border:    rgba(255,255,255,0.06);
    --c-border-hi: rgba(99,221,255,0.28);
    --c-accent:    #63ddff;
    --c-accent2:   #7b6cff;
    --c-green:     #00e5a0;
    --c-orange:    #ff9f43;
    --c-red:       #ff4d6a;
    --c-text:      #e2e8f0;
    --c-muted:     #5a6a85;
    --c-card-glow: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,221,255,0.07) 0%, transparent 70%);
    --radius-lg:   18px;
    --radius-md:   12px;
    --radius-sm:   8px;
    font-family: 'DM Sans', sans-serif;
    color: var(--c-text);
  }

  /* Card */
  .sw-card {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-width: 440px;
    width: 100%;
    position: relative;
    overflow: visible;
    box-shadow:
      0 0 0 1px rgba(99,221,255,0.04),
      0 24px 64px rgba(0,0,0,0.55),
      0 4px 16px rgba(0,0,0,0.35);
  }
  .sw-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius-lg);
    background: var(--c-card-glow);
    pointer-events: none;
  }

  /* Header */
  .sw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .sw-title {
    font-family: 'Space Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--c-text);
    text-transform: uppercase;
  }
  .sw-subtitle {
    font-size: 12px;
    color: var(--c-muted);
    margin-bottom: 20px;
    letter-spacing: 0.02em;
  }
  .sw-settings-btn {
    background: none;
    border: 1px solid var(--c-border);
    border-radius: var(--radius-sm);
    padding: 6px;
    color: var(--c-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: color 0.2s, border-color 0.2s, background 0.2s;
  }
  .sw-settings-btn:hover {
    color: var(--c-accent);
    border-color: var(--c-border-hi);
    background: rgba(99,221,255,0.06);
  }

  /* Network warning */
  .sw-net-warn {
    background: rgba(255,77,106,0.12);
    border: 1px solid rgba(255,77,106,0.35);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .sw-net-warn p { font-size: 13px; color: #ff8fa0; margin: 0; }
  .sw-switch-btn {
    background: linear-gradient(135deg, #ff4d6a, #ff2950);
    border: none;
    border-radius: var(--radius-sm);
    padding: 7px 18px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.15s;
  }
  .sw-switch-btn:hover { opacity: 0.88; transform: translateY(-1px); }

  /* Token input wrapper */
  .sw-token-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
    margin-bottom: 16px;
  }

  .sw-input-box {
    background: var(--c-panel);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    transition: border-color 0.2s, box-shadow 0.2s;
    position: relative;
  }
  .sw-input-box:focus-within {
    border-color: var(--c-border-hi);
    box-shadow: 0 0 0 3px rgba(99,221,255,0.08), inset 0 1px 0 rgba(99,221,255,0.08);
  }
  .sw-input-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-muted);
    margin-bottom: 8px;
  }
  .sw-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sw-input-row input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    color: var(--c-text);
    width: 0; /* let flex handle sizing */
    min-width: 0;
  }
  .sw-input-row input::placeholder { color: var(--c-muted); opacity: 0.5; }
  .sw-input-row input::-webkit-outer-spin-button,
  .sw-input-row input::-webkit-inner-spin-button { -webkit-appearance: none; }

  /* Token badge */
  .sw-token-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--c-border);
    border-radius: 30px;
    padding: 6px 12px 6px 8px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sw-token-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .sw-token-icon.eth  { background: linear-gradient(135deg,#627eea,#8fa4f2); color:#fff; }
  .sw-token-icon.tok  { background: linear-gradient(135deg,#63ddff,#7b6cff); color:#fff; }
  .sw-token-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--c-text);
    font-family: 'Space Mono', monospace;
  }
  .sw-balance-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
  }
  .sw-usd-val   { font-size: 12px; color: var(--c-muted); }
  .sw-bal-val   { font-size: 12px; color: var(--c-muted); }
  .sw-bal-val span { color: var(--c-accent); font-weight: 500; }

  /* Swap direction button */
  .sw-flip-btn {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 38px;
    height: 38px;
    background: var(--c-panel);
    border: 2px solid var(--c-border);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    color: var(--c-muted);
    transition: color 0.2s, border-color 0.2s, transform 0.3s, background 0.2s;
  }
  .sw-flip-btn:hover {
    color: var(--c-accent);
    border-color: var(--c-border-hi);
    background: rgba(99,221,255,0.08);
    transform: translate(-50%, -50%) rotate(180deg);
  }
  .sw-flip-btn:active { transform: translate(-50%, -50%) rotate(180deg) scale(0.9); }

  /* Info panel */
  .sw-info-panel {
    background: var(--c-panel);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .sw-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sw-info-key {
    font-size: 12px;
    color: var(--c-muted);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .sw-info-val {
    font-size: 12px;
    font-weight: 600;
    font-family: 'Space Mono', monospace;
  }
  .sw-info-val.green  { color: var(--c-green); }
  .sw-info-val.blue   { color: var(--c-accent); }
  .sw-info-val.orange { color: var(--c-orange); }
  .sw-divider {
    height: 1px;
    background: var(--c-border);
    margin: 2px 0;
  }

  /* Slippage control */
  .sw-slip-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sw-slip-btns { display: flex; gap: 5px; align-items: center; }
  .sw-slip-preset {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--c-border);
    border-radius: 6px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 600;
    color: var(--c-muted);
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Space Mono', monospace;
  }
  .sw-slip-preset:hover, .sw-slip-preset.active {
    background: rgba(99,221,255,0.1);
    border-color: var(--c-border-hi);
    color: var(--c-accent);
  }
  .sw-slip-input-wrap {
    display: flex;
    align-items: center;
    gap: 3px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--c-border);
    border-radius: 6px;
    padding: 4px 8px;
  }
  .sw-slip-input {
    background: transparent;
    border: none;
    outline: none;
    width: 38px;
    font-size: 11px;
    font-weight: 700;
    color: var(--c-text);
    text-align: right;
    font-family: 'Space Mono', monospace;
  }
  .sw-slip-pct { font-size: 11px; color: var(--c-orange); font-weight: 700; }

  /* Alerts */
  .sw-alert {
    border-radius: var(--radius-md);
    padding: 10px 14px;
    margin-bottom: 10px;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
  }
  .sw-alert.success {
    background: rgba(0,229,160,0.1);
    border: 1px solid rgba(0,229,160,0.3);
    color: var(--c-green);
  }
  .sw-alert.error {
    background: rgba(255,77,106,0.1);
    border: 1px solid rgba(255,77,106,0.3);
    color: #ff8fa0;
  }
  .sw-alert.warn {
    background: rgba(255,159,67,0.1);
    border: 1px solid rgba(255,159,67,0.3);
    color: var(--c-orange);
  }
  .sw-alert-icon { flex-shrink: 0; margin-top: 1px; }

  /* Swap button */
  .sw-btn {
    width: 100%;
    padding: 15px;
    border-radius: var(--radius-md);
    border: none;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    position: relative;
    overflow: hidden;
  }
  .sw-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%);
    pointer-events: none;
  }
  .sw-btn:not(:disabled):hover { transform: translateY(-1px); }
  .sw-btn:not(:disabled):active { transform: translateY(0) scale(0.99); }

  .sw-btn.ready {
    background: linear-gradient(135deg, #00c98a, #00e5a0);
    color: #001f14;
    box-shadow: 0 4px 24px rgba(0,229,160,0.3), 0 1px 0 rgba(255,255,255,0.15) inset;
  }
  .sw-btn.ready:hover { box-shadow: 0 6px 32px rgba(0,229,160,0.45); }

  .sw-btn.disabled-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--c-border);
    color: var(--c-muted);
    cursor: not-allowed;
  }
  .sw-btn.danger {
    background: rgba(255,77,106,0.15);
    border: 1px solid rgba(255,77,106,0.35);
    color: #ff8fa0;
    cursor: not-allowed;
  }

  /* Spinner */
  .sw-spinner {
    width: 18px;
    height: 18px;
    border: 2.5px solid rgba(0,31,20,0.3);
    border-top-color: #001f14;
    border-radius: 50%;
    animation: sw-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes sw-spin { to { transform: rotate(360deg); } }

  /* Route path indicator */
  .sw-route {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(123,108,255,0.06);
    border: 1px solid rgba(123,108,255,0.15);
    border-radius: var(--radius-sm);
  }
  .sw-route-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--c-accent2);
    white-space: nowrap;
  }
  .sw-route-path {
    font-size: 11px;
    color: var(--c-muted);
    font-family: 'Space Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sw-route-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: var(--c-muted);
    flex-shrink: 0;
  }
`;

/* ── Tiny helper components ─────────────────────────────────── */
function TokenBadge({ isEth, symbol }) {
  const initials = isEth ? "E" : (symbol || "T").slice(0, 2).toUpperCase();
  return (
    <div className="sw-token-badge">
      <div className={`sw-token-icon ${isEth ? "eth" : "tok"}`}>{initials}</div>
      <span className="sw-token-name">{isEth ? "ETH" : symbol}</span>
    </div>
  );
}

function InfoRow({ label, value, valueClass = "blue", icon }) {
  return (
    <div className="sw-info-row">
      <span className="sw-info-key">
        {icon && icon}
        {label}
      </span>
      <span className={`sw-info-val ${valueClass}`}>{value}</span>
    </div>
  );
}

function Alert({ type = "error", icon, children }) {
  return (
    <div className={`sw-alert ${type}`}>
      <span className="sw-alert-icon">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */
export default function Swap({ tokenAddress, tokenData, ethPrice: appEthPrice }) {
  const { address, isConnected, chain } = useAccount();
  const { data: balanceData } = useBalance({ address, chainId: base.id, watch: true });
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChain } = useSwitchChain();

  const [ethAmount, setEthAmount]       = useState("");
  const [tokenAmount, setTokenAmount]   = useState("");
  const [reversed, setReversed]         = useState(false);
  const [slippage, setSlippage]         = useState(0.5);
  const [loading, setLoading]           = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice, setEthPrice]         = useState(appEthPrice || null);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [hasInsufficientTokenBalance, setHasInsufficientTokenBalance] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [errorMessage, setErrorMessage]       = useState("");
  const [lastEditedField, setLastEditedField] = useState("");
  const prevGasEstimate = useRef("0");

  const tokenSymbol   = tokenData?.symbol   ?? "TOKEN";
  const tokenName     = tokenData?.name     ?? "Token";
  const tokenDecimals = tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;

  let checksummedTokenAddress = null;
  try { checksummedTokenAddress = tokenAddress ? getAddress(tokenAddress) : null; }
  catch (err) { console.error("Invalid token address:", err); }

  const isCorrectNetwork = chain?.id === base.id;

  const handleSwitchNetwork = async () => {
    try { await switchChain({ chainId: base.id }); }
    catch (error) { console.error("Failed to switch network:", error); }
  };

  /* ETH price */
  useEffect(() => {
    if (!appEthPrice && !ethPrice) {
      axios.get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
        .then(r => setEthPrice(r.data.ethereum.usd))
        .catch(() => setEthPrice(3000));
    } else if (appEthPrice) setEthPrice(appEthPrice);
  }, []);

  /* Token balance */
  useEffect(() => {
    if (!isConnected || !checksummedTokenAddress || !publicClient) { setTokenBalance("0"); return; }
    publicClient.readContract({ address: checksummedTokenAddress, abi: ERC20ABI, functionName: "balanceOf", args: [address] })
      .then(b => setTokenBalance(formatUnits(b, tokenDecimals)))
      .catch(() => setTokenBalance("0"));
  }, [isConnected, checksummedTokenAddress, publicClient, address, tokenDecimals]);

  /* Price helpers */
  const calcTokenFromEth = useCallback((v) => {
    if (!v || !ethPrice || !tokenPriceUsd) return "";
    return ((Number(v) * ethPrice) / tokenPriceUsd).toFixed(6);
  }, [ethPrice, tokenPriceUsd]);

  const calcEthFromToken = useCallback((v) => {
    if (!v || !ethPrice || !tokenPriceUsd) return "";
    return ((Number(v) * tokenPriceUsd) / ethPrice).toFixed(6);
  }, [ethPrice, tokenPriceUsd]);

  /* Recalc on price change */
  useEffect(() => {
    if (!ethPrice || !tokenPriceUsd || !lastEditedField) return;
    if (lastEditedField === "eth"   && ethAmount)   setTokenAmount(calcTokenFromEth(ethAmount));
    if (lastEditedField === "token" && tokenAmount) setEthAmount(calcEthFromToken(tokenAmount));
  }, [ethPrice, tokenPriceUsd, calcTokenFromEth, calcEthFromToken]);

  /* Token balance check */
  useEffect(() => {
    if (reversed && tokenAmount) setHasInsufficientTokenBalance(Number(tokenAmount) > Number(tokenBalance));
    else setHasInsufficientTokenBalance(false);
  }, [reversed, tokenAmount, tokenBalance]);

  const outputAmount   = reversed ? ethAmount  : tokenAmount;
  const outputSymbol   = reversed ? "ETH"      : tokenSymbol;
  const minReceivedUI  = outputAmount ? (Number(outputAmount) * (1 - slippage / 100)).toFixed(6) : "0";
  const userEthBalance = Number(balanceData?.formatted || 0);
  const totalEthNeeded = reversed ? Number(estimatedGas) : Number(ethAmount || 0) + Number(estimatedGas);
  const hasInsufficientEthBalance = isConnected && totalEthNeeded > userEthBalance;

  /* USD value display */
  const ethUsdVal   = ethAmount   && ethPrice      ? `≈ $${(Number(ethAmount)   * ethPrice).toFixed(2)}`      : "";
  const tokenUsdVal = tokenAmount && tokenPriceUsd ? `≈ $${(Number(tokenAmount) * tokenPriceUsd).toFixed(2)}` : "";

  /* Gas estimation */
  useEffect(() => {
    const go = async () => {
      if (!isConnected || !isCorrectNetwork || !checksummedTokenAddress || !publicClient || !address
          || (Number(ethAmount) <= 0 && Number(tokenAmount) <= 0)) { setEstimatedGas("0"); return; }
      try {
        const gasPrice = await publicClient.getGasPrice();
        const amountIn = reversed ? tokenAmount || "0" : ethAmount || "0";
        if (Number(amountIn) <= 0) { setEstimatedGas("0"); return; }
        let gasEstimate;
        if (!reversed) {
          gasEstimate = await publicClient.estimateContractGas({
            address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI, functionName: "swapExactETHForTokens",
            args: [parseUnits(minReceivedUI, tokenDecimals), [WETH_ADDRESS, checksummedTokenAddress], address, BigInt(Math.floor(Date.now()/1000)+600)],
            value: parseEther(amountIn), account: address,
          });
        } else {
          try {
            gasEstimate = await publicClient.estimateContractGas({
              address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI, functionName: "swapExactTokensForETH",
              args: [parseUnits(amountIn, tokenDecimals), parseEther(minReceivedUI), [checksummedTokenAddress, WETH_ADDRESS], address, BigInt(Math.floor(Date.now()/1000)+600)],
              account: address,
            });
          } catch { gasEstimate = BigInt(300000); }
        }
        const fmt = Number(formatEther(gasEstimate * gasPrice)).toFixed(6);
        if (fmt !== prevGasEstimate.current) { setEstimatedGas(fmt); prevGasEstimate.current = fmt; }
      } catch { setEstimatedGas(DEFAULT_GAS_ESTIMATE); prevGasEstimate.current = DEFAULT_GAS_ESTIMATE; }
    };
    const t = setTimeout(go, 500);
    return () => clearTimeout(t);
  }, [ethAmount, tokenAmount, reversed, slippage, isConnected, isCorrectNetwork, checksummedTokenAddress, publicClient, tokenDecimals, minReceivedUI, address]);

  /* Approve */
  const approveToken = async (amountToApprove) => {
    try {
      setLoading(true); setApprovalMessage(""); setErrorMessage("");
      const hash = await walletClient.writeContract({ address: checksummedTokenAddress, abi: ERC20ABI, functionName: "approve", args: [ROUTER_ADDRESS, amountToApprove] });
      setApprovalMessage(`Approval pending: ${hash.slice(0,10)}…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status === "success") {
        setApprovalMessage("Token approved"); setTimeout(() => setApprovalMessage(""), 3000);
        setLoading(false); return true;
      }
      throw new Error("Approval failed: " + receipt.status);
    } catch (err) {
      setApprovalMessage("");
      setErrorMessage(err?.message?.includes("rejected") ? "Approval rejected" : err.message?.slice(0,80) || "Approval failed");
      setLoading(false); return false;
    }
  };

  /* Swap */
  const handleSwap = async () => {
    setErrorMessage("");
    if (!isConnected) { setErrorMessage("Connect wallet first"); return; }
    if (!isCorrectNetwork) { setErrorMessage("Please switch to Base network"); await handleSwitchNetwork(); return; }
    if (!ethAmount && !tokenAmount) { setErrorMessage("Enter an amount"); return; }
    if (!walletClient || !publicClient) { setErrorMessage("Wallet not ready"); return; }
    if ((reversed ? Number(tokenAmount) : Number(ethAmount)) <= 0) { setErrorMessage("Amount must be > 0"); return; }
    if (hasInsufficientEthBalance) { setErrorMessage(`Need ${totalEthNeeded.toFixed(6)} ETH`); return; }
    if (hasInsufficientTokenBalance) { setErrorMessage(`Insufficient ${tokenSymbol}`); return; }

    try {
      setLoading(true); setApprovalMessage(""); setErrorMessage("");
      const deadline = BigInt(Math.floor(Date.now()/1000)+600);

      if (!reversed) {
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI, functionName: "swapExactETHForTokens",
          args: [parseUnits(minReceivedUI, tokenDecimals), [WETH_ADDRESS, checksummedTokenAddress], address, deadline],
          value: parseEther(ethAmount),
        });
        setApprovalMessage(`Submitted: ${hash.slice(0,10)}…`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (receipt.status === "success") { setApprovalMessage("Swap successful!"); setEthAmount(""); setTokenAmount(""); setTimeout(() => setApprovalMessage(""), 3000); }
        else throw new Error("Transaction failed");
      } else {
        const amountIn = parseUnits(tokenAmount, tokenDecimals);
        const allowance = await publicClient.readContract({ address: checksummedTokenAddress, abi: ERC20ABI, functionName: "allowance", args: [address, ROUTER_ADDRESS] });
        if (BigInt(allowance) < amountIn) { const ok = await approveToken(amountIn); if (!ok) throw new Error("Approval failed"); }
        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS, abi: UNISWAP_ROUTER_ABI, functionName: "swapExactTokensForETH",
          args: [amountIn, parseEther(minReceivedUI), [checksummedTokenAddress, WETH_ADDRESS], address, deadline],
        });
        setApprovalMessage(`Submitted: ${hash.slice(0,10)}…`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        if (receipt.status === "success") { setApprovalMessage("Swap successful!"); setEthAmount(""); setTokenAmount(""); setTimeout(() => setApprovalMessage(""), 3000); }
        else throw new Error("Transaction failed");
      }
    } catch (err) {
      let msg = "Swap failed";
      if (err?.message?.includes("rejected")) msg = "Transaction rejected";
      else if (err?.message?.includes("slippage")) msg = "Price moved — try higher slippage";
      else if (err?.message?.includes("timeout")) msg = "Transaction timed out";
      else if (err?.message) msg = err.message.slice(0, 80);
      setErrorMessage(msg); setApprovalMessage("");
    } finally { setLoading(false); }
  };

  const handleReverse = () => setReversed(r => !r);
  const isValidAddress = (a) => a && /^0x[a-fA-F0-9]{40}$/.test(a);

  /* ── Render guards ─────────────────────────────────────────── */
  if (!checksummedTokenAddress) return (
    <div className="swap-root" style={{ display:"flex", alignItems:"center", justifyContent:"center", height:240 }}>
      <style>{css}</style>
      <p style={{ color:"var(--c-muted)", fontSize:14 }}>Paste a token address and click "Fetch Token"</p>
    </div>
  );
  if (!isValidAddress(checksummedTokenAddress)) return (
    <div className="swap-root" style={{ display:"flex", alignItems:"center", justifyContent:"center", height:240 }}>
      <style>{css}</style>
      <p style={{ color:"var(--c-red)", fontSize:14 }}>Invalid token address</p>
    </div>
  );

  /* ── Button state ──────────────────────────────────────────── */
  const btnDisabled = loading || !isConnected || !isCorrectNetwork || !outputAmount || Number(outputAmount) <= 0 || hasInsufficientEthBalance || hasInsufficientTokenBalance;
  let btnClass = "sw-btn disabled-btn";
  let btnLabel = "Enter Amount";
  let btnIcon  = null;
  if (loading)                      { btnClass = "sw-btn disabled-btn"; btnLabel = "Processing…"; btnIcon = <div className="sw-spinner"/>; }
  else if (!isConnected)            { btnClass = "sw-btn disabled-btn"; btnLabel = "Connect Wallet"; }
  else if (!isCorrectNetwork)       { btnClass = "sw-btn danger";       btnLabel = "Switch to Base"; }
  else if (hasInsufficientEthBalance || hasInsufficientTokenBalance) { btnClass = "sw-btn danger"; btnLabel = "Insufficient Balance"; }
  else if (!outputAmount || Number(outputAmount) <= 0) { btnClass = "sw-btn disabled-btn"; btnLabel = "Enter Amount"; }
  else                              { btnClass = "sw-btn ready";        btnLabel = `Swap ${reversed ? tokenSymbol : "ETH"} → ${reversed ? "ETH" : tokenSymbol}`; btnIcon = <LuZap size={16}/>; }

  /* ── Top/bottom token assignment ──────────────────────────── */
  const topIsEth    = !reversed;
  const topSymbol   = reversed ? tokenSymbol : "ETH";
  const topValue    = reversed ? tokenAmount : ethAmount;
  const topUsd      = reversed ? tokenUsdVal : ethUsdVal;
  const topBalance  = reversed ? `${Number(tokenBalance).toFixed(4)} ${tokenSymbol}` : `${userEthBalance.toFixed(4)} ETH`;
  const topOnChange = (v) => {
    setLastEditedField(reversed ? "token" : "eth");
    if (reversed) { setTokenAmount(v); setEthAmount(v ? calcEthFromToken(v) : ""); }
    else          { setEthAmount(v);   setTokenAmount(v ? calcTokenFromEth(v) : ""); }
  };

  const botIsEth    = reversed;
  const botSymbol   = reversed ? "ETH" : tokenSymbol;
  const botValue    = reversed ? ethAmount : tokenAmount;
  const botUsd      = reversed ? ethUsdVal : tokenUsdVal;
  const botBalance  = reversed ? `${userEthBalance.toFixed(4)} ETH` : `${Number(tokenBalance).toFixed(4)} ${tokenSymbol}`;
  const botOnChange = (v) => {
    setLastEditedField(reversed ? "eth" : "token");
    if (reversed) { setEthAmount(v);   setTokenAmount(v ? calcTokenFromEth(v) : ""); }
    else          { setTokenAmount(v); setEthAmount(v ? calcEthFromToken(v) : ""); }
  };

  /* ── JSX ───────────────────────────────────────────────────── */
  return (
    <div className="swap-root">
      <style>{css}</style>
      <div className="sw-card">

        {/* Header */}
        <div className="sw-header">
          <span className="sw-title">Swap</span>
          <button className="sw-settings-btn" title="Settings"><LuSettings2 size={16}/></button>
        </div>
        <p className="sw-subtitle">
          {tokenData ? `${tokenName} / ETH on Base` : "Load a token to start"}
        </p>

        {/* Network warning */}
        {isConnected && !isCorrectNetwork && (
          <div className="sw-net-warn">
            <p>Connected to <strong>{chain?.name || "wrong network"}</strong></p>
            <button className="sw-switch-btn" onClick={handleSwitchNetwork}>Switch to Base</button>
          </div>
        )}

        {/* ── Token inputs ─────────────────────────────────── */}
        <div className="sw-token-stack">
          {/* Top input */}
          <div className="sw-input-box">
            <div className="sw-input-label">You Pay</div>
            <div className="sw-input-row">
              <input
                type="number" step="any"
                value={topValue}
                placeholder="0.0"
                onChange={e => topOnChange(e.target.value)}
              />
              <TokenBadge isEth={topIsEth} symbol={topSymbol}/>
            </div>
            <div className="sw-balance-row">
              <span className="sw-usd-val">{topUsd}</span>
              {isConnected && <span className="sw-bal-val">Bal: <span>{topBalance}</span></span>}
            </div>
          </div>

          {/* Flip */}
          <div className="sw-flip-btn" onClick={handleReverse}>
            <LuArrowUpDown size={16}/>
          </div>

          {/* Bottom input */}
          <div className="sw-input-box">
            <div className="sw-input-label">You Receive</div>
            <div className="sw-input-row">
              <input
                type="number" step="any"
                value={botValue}
                placeholder="0.0"
                onChange={e => botOnChange(e.target.value)}
              />
              <TokenBadge isEth={botIsEth} symbol={botSymbol}/>
            </div>
            <div className="sw-balance-row">
              <span className="sw-usd-val">{botUsd}</span>
              {isConnected && <span className="sw-bal-val">Bal: <span>{botBalance}</span></span>}
            </div>
          </div>
        </div>

        {/* Route indicator */}
        {outputAmount && Number(outputAmount) > 0 && (
          <div className="sw-route">
            <span className="sw-route-label">Route</span>
            <div className="sw-route-dot"/>
            <span className="sw-route-path">
              {reversed ? tokenSymbol : "ETH"} → WETH → {reversed ? "ETH" : tokenSymbol}
            </span>
          </div>
        )}

        {/* Info panel */}
        <div className="sw-info-panel" style={{ marginTop: 12 }}>
          <InfoRow
            label={<>ETH Price</>}
            value={ethPrice ? `$${ethPrice.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}
            valueClass="green"
          />
          <InfoRow
            label={`${tokenSymbol} Price`}
            value={tokenPriceUsd ? `$${tokenPriceUsd.toFixed(6)}` : "—"}
            valueClass="green"
          />
          <div className="sw-divider"/>
          <InfoRow
            label="Min Received"
            value={`${minReceivedUI} ${outputSymbol}`}
            valueClass="blue"
          />
          <InfoRow
            label="Network Fee"
            value={estimatedGas !== "0" ? `~${estimatedGas} ETH` : "—"}
            valueClass="orange"
          />
          <div className="sw-divider"/>
          {/* Slippage row */}
          <div className="sw-slip-row">
            <span className="sw-info-key">Slippage</span>
            <div className="sw-slip-btns">
              {[0.1, 0.5, 1].map(p => (
                <button
                  key={p}
                  className={`sw-slip-preset${slippage === p ? " active" : ""}`}
                  onClick={() => setSlippage(p)}
                >{p}%</button>
              ))}
              <div className="sw-slip-input-wrap">
                <input
                  className="sw-slip-input"
                  type="number" min="0" max="50" step="0.1"
                  value={slippage}
                  onChange={e => setSlippage(Number(e.target.value))}
                />
                <span className="sw-slip-pct">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {approvalMessage && (
          <Alert type="success" icon="✓">{approvalMessage}</Alert>
        )}
        {errorMessage && (
          <Alert type="error" icon="⚠">  {errorMessage}</Alert>
        )}
        {hasInsufficientEthBalance && !errorMessage && (
          <Alert type="warn" icon="⚠">
            Need {totalEthNeeded.toFixed(6)} ETH — have {userEthBalance.toFixed(6)} ETH
          </Alert>
        )}
        {hasInsufficientTokenBalance && !errorMessage && (
          <Alert type="warn" icon="⚠">
            Need {tokenAmount} {tokenSymbol} — have {Number(tokenBalance).toFixed(6)}
          </Alert>
        )}

        {/* CTA button */}
        <button className={btnClass} disabled={btnDisabled} onClick={handleSwap}>
          {btnIcon}
          {btnLabel}
        </button>

      </div>
    </div>
  );
}