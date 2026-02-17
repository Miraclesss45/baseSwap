import "./App.css";
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAccount } from "wagmi";
import { getAddress } from "viem";
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

  const { address, isConnected, chain } = useAccount();

  const MORALIS_API_KEY = import.meta.env.VITE_MORALIS_API_KEY;
  const BASE_CHAIN = "0x2105";
  const CACHE_TTL_MS = 30_000;

  const tokenCache = useRef(new Map());

  useEffect(() => {
    let mounted = true;
    
    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        if (mounted) setEthPrice(res.data?.ethereum?.usd ?? null);
      } catch {
        if (mounted) setEthPrice(null);
      }
    };
    
    fetchEthPrice();
    const t = setInterval(fetchEthPrice, 20000);
    
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const getCachedToken = (address) => {
    try {
      const checksummed = getAddress(address);
      const cached = tokenCache.current.get(checksummed);
      
      if (
        cached &&
        Date.now() - cached.timestamp < CACHE_TTL_MS &&
        cached.data?.address?.toLowerCase() === address.toLowerCase()
      ) {
        return cached.data;
      }
    } catch {}
    return null;
  };

  const cacheToken = (address, data) => {
    try {
      const checksummed = getAddress(address);
      tokenCache.current.set(checksummed, { data, timestamp: Date.now() });
    } catch {}
  };

  const fetchWithRetry = async (fetchFn, retries = 2, delay = 1000) => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fetchFn();
      } catch (err) {
        if (i === retries) throw err;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const convertSupply = (raw, decimals) => {
    if (!raw || raw === "0") return 0;
    try {
      const rawBigInt = BigInt(raw);
      const decimalsBigInt = BigInt(decimals);
      
      const rawString = rawBigInt.toString();
      const decimalPoint = rawString.length - Number(decimalsBigInt);
      
      if (decimalPoint <= 0) {
        return Number(`0.${"0".repeat(Math.abs(decimalPoint))}${rawString}`);
      }
      
      const wholePart = rawString.slice(0, decimalPoint);
      const fractionalPart = rawString.slice(decimalPoint);
      
      return Number(`${wholePart || "0"}.${fractionalPart}`);
    } catch {
      return 0;
    }
  };

  const fetchToken = async () => {
    setLoading(true);
    
    try {
      setMessage("");
      setTokenData(null);
      setFetchedTokenAddress(null);
      
      const addr = inputAddress.trim();
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        setMessage("Invalid token address.");
        setLoading(false);
        return;
      }
      
      if (!MORALIS_API_KEY) {
        setMessage("Moralis API key missing.");
        setLoading(false);
        return;
      }

      let checksummedAddr;
      try {
        checksummedAddr = getAddress(addr);
      } catch {
        setMessage("Invalid address format.");
        setLoading(false);
        return;
      }

      const cached = getCachedToken(checksummedAddr);
      if (cached) {
        setTokenData(cached);
        setFetchedTokenAddress(checksummedAddr);
        setMessage("✅ Data loaded from cache (30s TTL)");
        setLoading(false);
        return;
      }

      const [metadataResult, priceResult, dexResult] = await Promise.allSettled([
        fetchWithRetry(() =>
          axios.get(
            "https://deep-index.moralis.io/api/v2.2/erc20/metadata",
            {
              params: { chain: BASE_CHAIN, addresses: [checksummedAddr] },
              headers: { "X-API-Key": MORALIS_API_KEY },
              timeout: 10000,
            }
          )
        ),
        fetchWithRetry(() =>
          axios.get(
            `https://deep-index.moralis.io/api/v2.2/erc20/${checksummedAddr}/price`,
            {
              params: { chain: BASE_CHAIN },
              headers: { "X-API-Key": MORALIS_API_KEY },
              timeout: 10000,
            }
          )
        ),
        fetchWithRetry(() =>
          axios.get(`https://api.dexscreener.com/latest/dex/tokens/${checksummedAddr}`, {
            timeout: 10000,
          })
        ),
      ]);

      let metadata = null;
      if (metadataResult.status === "fulfilled") {
        metadata = metadataResult.value?.data?.[0];
        if (!metadata) throw new Error("Token not found on Base network");
      } else {
        throw new Error("Failed to fetch token metadata");
      }

      let price = 0;
      if (priceResult.status === "fulfilled") {
        price = Number(priceResult.value?.data?.usdPrice) || 0;
      }

      let dexData = null;
      if (dexResult.status === "fulfilled") {
        dexData = dexResult.value?.data;
      }

      let bestPair = null;
      let liquidityUsd = 0;
      let priceChange = { m5: 0, h1: 0, h6: 0, h24: 0 };

      if (dexData?.pairs && Array.isArray(dexData.pairs)) {
        const basePairs = dexData.pairs.filter(
          (p) => p?.chainId === "base" && p?.liquidity?.usd
        );

        if (basePairs.length > 0) {
          bestPair = basePairs.reduce((prev, cur) => {
            const prevLiq = Number(prev?.liquidity?.usd) || 0;
            const curLiq = Number(cur?.liquidity?.usd) || 0;
            return curLiq > prevLiq ? cur : prev;
          });

          liquidityUsd = Number(bestPair?.liquidity?.usd) || 0;
          
          if (price === 0 && bestPair?.priceUsd) {
            price = Number(bestPair.priceUsd);
          }

          priceChange = {
            m5: Number(bestPair?.priceChange?.m5) || 0,
            h1: Number(bestPair?.priceChange?.h1) || 0,
            h6: Number(bestPair?.priceChange?.h6) || 0,
            h24: Number(bestPair?.priceChange?.h24) || 0,
          };
        }
      }

      const decimals = Number(metadata.decimals) || 18;
      const totalSupply = convertSupply(metadata.total_supply || "0", decimals);
      const circulatingSupply = convertSupply(
        metadata.circulating_supply || metadata.total_supply || "0",
        decimals
      );

      const fdv = totalSupply * price;
      const marketCap = circulatingSupply > 0 ? circulatingSupply * price : fdv;

      const tokenObj = {
        name: metadata.name || "Unknown Token",
        symbol: metadata.symbol || "???",
        address: checksummedAddr,
        logo: bestPair?.info?.imageUrl || null,
        dexLogo: bestPair?.info?.imageUrl || null,
        priceUsd: price,
        liquidityUsd,
        totalSupply,
        circulatingSupply,
        marketCap,
        fdv,
        decimals,
        change5m: priceChange.m5,
        change1h: priceChange.h1,
        change6h: priceChange.h6,
        change24h: priceChange.h24,
      };

      cacheToken(checksummedAddr, tokenObj);
      setTokenData(tokenObj);
      setFetchedTokenAddress(checksummedAddr);
      setMessage("✅ Token data fetched successfully");
      setLoading(false);
    } catch (err) {
      console.error(err);
      
      let errorMsg = "❌ Failed to fetch token data. ";
      if (err.message?.includes("not found")) {
        errorMsg += "Token not found on Base network.";
      } else if (err.message?.includes("timeout")) {
        errorMsg += "Request timed out. Check your connection.";
      } else if (err.response?.status === 429) {
        errorMsg += "Rate limit reached. Please wait a moment.";
      } else if (err.response?.status === 401) {
        errorMsg += "Invalid API key.";
      } else {
        errorMsg += err.message || "Unknown error occurred.";
      }
      
      setMessage(errorMsg);
      setLoading(false);
    }
  };

  const isError =
    message.includes("Invalid") ||
    message.includes("Failed") ||
    message.includes("missing") ||
    message.includes("❌");

  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const isBase = chain?.id === 8453;

  return (
    <div className="font-sans min-h-screen bg-[#080b11] text-white overflow-x-hidden relative">

      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07] bg-cyan-400 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.06] bg-blue-500 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.02] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.03)_2px,rgba(255,255,255,0.03)_4px)]" />
      </div>

      {/* ✅ MOBILE FIX: Better header spacing */}
      <header className="relative z-50 sticky top-0">
        <div className="absolute inset-0 bg-[#080b11]/80 backdrop-blur-2xl border-b border-white/[0.04]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
          {/* ✅ MOBILE FIX: Better height */}
          <div className="flex items-center justify-between h-16 sm:h-14 lg:h-[68px]">

            <div className="flex items-center gap-6 sm:gap-8 lg:gap-10">
              <div className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group select-none shrink-0">
                <div className="relative flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 md:w-9 md:h-9 shrink-0">
                  <div className="absolute inset-0 rounded-lg bg-cyan-500/20 blur-md group-hover:bg-cyan-500/40 transition-all duration-300" />
                  <div className="relative w-full h-full rounded-lg flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-500">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                {/* ✅ MOBILE FIX: Hide text on very small screens */}
                <span className="hidden xs:inline font-display text-lg sm:text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  baseSwap
                </span>
              </div>

              <nav className="hidden lg:flex items-center">
                {[
                  { label: "Swap", href: "#swap", active: true },
                  { label: "Pools", href: "#pools" },
                  { label: "Analytics", href: "#analytics" },
                ].map(({ label, href, active }) => (
                  <a
                    key={label}
                    href={href}
                    className={`relative px-4 py-2 text-[11px] font-mono font-semibold tracking-[0.15em] uppercase transition-colors duration-200 ${
                      active ? "text-cyan-400" : "text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {active && (
                      <span className="absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                    )}
                    {label}
                  </a>
                ))}
              </nav>
            </div>

            {/* ✅ MOBILE FIX: Better gap */}
            <div className="flex items-center gap-2 sm:gap-2 md:gap-3">

              {ethPrice && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:border-cyan-500/20 transition-all duration-200 cursor-default">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? "bg-emerald-400" : "bg-slate-500"}`} />
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-slate-500"}`} />
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 tracking-wider uppercase">ETH</span>
                  <span className="font-mono text-xs sm:text-sm font-semibold text-cyan-300 tabular-nums">
                    ${ethPrice.toLocaleString()}
                  </span>
                </div>
              )}

              {isConnected && !isBase && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/[0.08] border border-red-500/25">
                  <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-mono text-[10px] text-red-400 tracking-wider font-semibold">
                    {chain?.name ?? "Wrong Network"}
                  </span>
                </div>
              )}

              {isConnected && shortAddress && (
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                  isBase
                    ? "bg-cyan-400/[0.05] border-cyan-400/[0.18]"
                    : "bg-red-500/[0.05] border-red-500/20"
                }`}>
                  <div className="w-4 h-4 rounded-full shrink-0 bg-gradient-to-br from-cyan-400 to-blue-500" />
                  <span className={`font-mono text-[11px] font-semibold tabular-nums ${isBase ? "text-cyan-400" : "text-red-400"}`}>
                    {shortAddress}
                  </span>
                  {isBase && (
                    <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              )}

              <WalletConnect setMessage={setMessage} />
            </div>

          </div>
        </div>
      </header>

      {/* ✅ MOBILE FIX: Better main padding */}
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-14">

        {message && (
          // ✅ MOBILE FIX: Better text size
          <div className={`mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-mono backdrop-blur-sm ${
            isError
              ? "bg-red-950/30 border-red-500/20 text-red-300"
              : "bg-cyan-950/30 border-cyan-500/20 text-cyan-300"
          }`}>
            <svg
              className={`w-4 h-4 shrink-0 mt-0.5 ${isError ? "text-red-400" : "text-cyan-400"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d={isError
                  ? "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"} />
            </svg>
            <p className="flex-1 leading-relaxed break-words">{message}</p>
            <button onClick={() => setMessage("")} className="text-slate-500 hover:text-white transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {isConnected && (
          // ✅ MOBILE FIX: Better text sizes
          <div className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-cyan-400/[0.02] border border-cyan-400/[0.07]">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-xs sm:text-[11px] text-emerald-400 font-semibold tracking-wide">
              Wallet Connected
            </span>
            <span className="w-px h-3 bg-white/10 hidden sm:block" />
            <span className="font-mono text-xs sm:text-[11px] text-slate-400 tabular-nums">{shortAddress}</span>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${
              isBase
                ? "bg-blue-500/[0.08] border-blue-500/20"
                : "bg-red-500/[0.08] border-red-500/25"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isBase ? "bg-blue-400" : "bg-red-400"}`} />
              <span className={`font-mono text-[11px] sm:text-[10px] font-semibold tracking-wider uppercase ${isBase ? "text-blue-400" : "text-red-400"}`}>
                {isBase ? "Base" : chain?.name ?? "Wrong Network"}
              </span>
            </div>
          </div>
        )}

        {/* ✅ MOBILE FIX: Better gap */}
        <div className="flex flex-col lg:flex-row items-start gap-6 sm:gap-5 lg:gap-7">

          <div className="flex flex-col gap-5 w-full lg:flex-1 min-w-0">

            <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />

              {/* ✅ MOBILE FIX: Better padding */}
              <div className="p-6 sm:p-5 md:p-6 lg:p-7">

                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-cyan-500/[0.08] border border-cyan-400/[0.12]">
                      <svg className="w-5 h-5 sm:w-4 sm:h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      {/* ✅ MOBILE FIX: Better text sizing */}
                      <h2 className="font-display text-lg sm:text-base font-bold text-white tracking-tight truncate">
                        Token Explorer
                      </h2>
                      <p className="font-mono text-[11px] sm:text-[10px] text-slate-500 tracking-wider uppercase mt-0.5">
                        Base Network · ERC-20
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-lg ml-3 bg-blue-600/[0.08] border border-blue-500/[0.15]">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="font-mono text-[9px] text-blue-400 font-semibold tracking-[0.2em] uppercase">Base</span>
                  </div>
                </div>

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
                    className="font-mono w-full pl-10 pr-10 py-3.5 sm:py-3 text-sm text-slate-200 placeholder-slate-600
                               rounded-xl bg-[#0d1117] border border-white/[0.07]
                               focus:outline-none focus:border-cyan-400/35 focus:ring-2 focus:ring-cyan-400/[0.06]
                               transition-all duration-300"
                  />
                  {inputAddress && (
                    // ✅ MOBILE FIX: Bigger clear button
                    <button
                      onClick={() => setInputAddress("")}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* ✅ MOBILE FIX: Better button sizing */}
                <button
                  onClick={fetchToken}
                  disabled={loading || !inputAddress}
                  className={`relative w-full py-4 sm:py-3 rounded-xl font-mono 
                              text-sm sm:text-xs font-bold 
                              tracking-wider sm:tracking-[0.15em] uppercase
                              transition-all duration-300 active:scale-[0.98]
                              flex items-center justify-center gap-2.5 select-none overflow-hidden
                              ${loading || !inputAddress
                                ? "bg-white/[0.03] text-slate-600 cursor-not-allowed border border-white/[0.04]"
                                : "bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:-translate-y-px"
                              }`}
                >
                  {!loading && inputAddress && (
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />
                  )}
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Analyzing Token…</span>
                    </>
                  ) : (
                    <>
                      <svg className="relative w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span className="relative">Fetch Token Data</span>
                    </>
                  )}
                </button>

                {/* ✅ MOBILE FIX: Better text size */}
                <div className="mt-4 pt-4 flex items-start gap-2 text-slate-600 border-t border-white/[0.04]">
                  <svg className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0 mt-0.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-mono text-[11px] sm:text-[10px] leading-relaxed tracking-wide">
                    Paste a valid Base ERC-20 address. Data sourced live from Moralis + DexScreener.
                  </p>
                </div>

              </div>
            </div>

            {tokenData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                <TokenInfo tokenData={tokenData} />
              </div>
            )}

            {!tokenData && !loading && (
              // ✅ MOBILE FIX: Better empty state
              <div className="flex flex-col items-center justify-center px-6 py-14 sm:py-16 lg:py-20 rounded-2xl text-center bg-white/[0.01] border border-dashed border-white/[0.06]">
                <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-4 bg-white/[0.03] border border-white/[0.06]">
                  <svg className="w-6 h-6 sm:w-5 sm:h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <p className="font-display text-base sm:text-sm font-semibold text-slate-600 mb-1">No Token Selected</p>
                <p className="font-mono text-xs sm:text-[11px] text-slate-700 leading-relaxed max-w-[220px]">
                  Enter a contract address above to begin
                </p>
              </div>
            )}

          </div>

          <div className="w-full lg:w-[380px] xl:w-[400px] shrink-0 lg:sticky lg:top-[84px]">
            <Swap
              tokenAddress={fetchedTokenAddress}
              tokenData={tokenData}
              ethPrice={ethPrice}
            />
          </div>

        </div>

        {/* ✅ MOBILE FIX: Better spacing */}
        <div className="flex flex-wrap gap-4 mt-12 sm:mt-14 lg:mt-20">
          {[
            {
              iconPath: "M13 10V3L4 14h7v7l9-11h-7z",
              iconColor: "text-cyan-400",
              iconBg: "bg-cyan-400/[0.06] border-cyan-400/[0.12]",
              shimmer: "via-cyan-400/25",
              hover: "hover:border-cyan-400/15",
              label: "Lightning Fast",
              desc: "Execute swaps on Base L2 instantly — near-zero latency, minimal gas.",
            },
            {
              iconPath: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
              iconColor: "text-blue-400",
              iconBg: "bg-blue-400/[0.06] border-blue-400/[0.12]",
              shimmer: "via-blue-400/25",
              hover: "hover:border-blue-400/15",
              label: "Non-Custodial",
              desc: "Your keys, your tokens. We never hold your assets — ever.",
            },
            {
              iconPath: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
              iconColor: "text-violet-400",
              iconBg: "bg-violet-400/[0.06] border-violet-400/[0.12]",
              shimmer: "via-violet-400/25",
              hover: "hover:border-violet-400/15",
              label: "Live Analytics",
              desc: "Real-time prices, liquidity depth, and 24h metrics pulled from DexScreener.",
            },
          ].map(({ iconPath, iconColor, iconBg, shimmer, hover, label, desc }) => (
            <div
              key={label}
              className={`group relative flex-1 min-w-[260px] rounded-2xl p-6 sm:p-5 md:p-6 cursor-default
                          transition-all duration-300 hover:-translate-y-1 overflow-hidden
                          bg-white/[0.015] border border-white/[0.05] ${hover}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent ${shimmer} to-transparent`} />
              <div className={`flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-xl mb-4 border transition-all duration-300 group-hover:scale-110 ${iconBg}`}>
                <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
                </svg>
              </div>
              {/* ✅ MOBILE FIX: Better text sizing */}
              <h3 className="font-display text-base sm:text-sm font-bold text-white mb-2 tracking-tight">{label}</h3>
              <p className="font-mono text-xs sm:text-[11px] text-slate-500 leading-relaxed tracking-wide">{desc}</p>
            </div>
          ))}
        </div>

      </main>

      {/* ✅ MOBILE FIX: Better footer spacing */}
      <footer className="relative z-10 mt-12 sm:mt-16 lg:mt-20 border-t border-white/[0.04] bg-black/30 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-7">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600">
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              {/* ✅ MOBILE FIX: Better text size */}
              <span className="font-mono text-xs sm:text-[11px] text-slate-600 tracking-wider">baseSwap © 2024</span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-5 md:gap-6">
              {["Documentation", "GitHub", "Discord", "Twitter"].map((link) => (
                <a
                  key={link}
                  href="#"
                  // ✅ MOBILE FIX: Better link sizing
                  className="font-mono text-xs sm:text-[11px] text-slate-600 hover:text-cyan-400 transition-colors duration-200 tracking-wider uppercase"
                >
                  {link}
                </a>
              ))}
            </div>

            {isConnected && (
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {/* ✅ MOBILE FIX: Better text size */}
                <span className="font-mono text-xs sm:text-[10px] text-emerald-500 tracking-wider tabular-nums">
                  {shortAddress}
                </span>
              </div>
            )}

          </div>
        </div>
      </footer>

    </div>
  );
}