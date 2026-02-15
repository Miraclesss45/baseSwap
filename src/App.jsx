// src/App.jsx - ENHANCED UI/UX VERSION
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

  // ===============================
  // Fetch ETH Price
  // ===============================
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        setEthPrice(res.data?.ethereum?.usd ?? null);
      } catch {
        setEthPrice(3000);
      }
    };

    fetchEthPrice();
    const t = setInterval(fetchEthPrice, 20000);
    return () => clearInterval(t);
  }, []);

  // ===============================
  // SAFE BigInt Supply Converter
  // ===============================
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

  // ===============================
  // Fetch Token
  // ===============================
  const fetchToken = async () => {
    try {
      setMessage("");
      setTokenData(null);
      setFetchedTokenAddress(null);

      const address = inputAddress.trim();

      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        setMessage("Invalid token address.");
        return;
      }

      if (!MORALIS_API_KEY) {
        setMessage("Moralis API key missing.");
        return;
      }

      setLoading(true);

      // 1️⃣ Metadata
      const metadataRes = await axios.get(
        "https://deep-index.moralis.io/api/v2.2/erc20/metadata",
        {
          params: { chain: BASE_CHAIN, addresses: [address] },
          headers: { "X-API-Key": MORALIS_API_KEY },
        }
      );

      const metadata = metadataRes.data?.[0];
      if (!metadata) throw new Error("Token not found");

      const decimals = Number(metadata.decimals) || 18;

      const totalSupply = convertSupply(metadata.total_supply, decimals);
      const circulatingSupply = convertSupply(
        metadata.circulating_supply || metadata.total_supply,
        decimals
      );

      // 2️⃣ Price
      const priceRes = await axios.get(
        `https://deep-index.moralis.io/api/v2.2/erc20/${address}/price`,
        {
          params: { chain: BASE_CHAIN },
          headers: { "X-API-Key": MORALIS_API_KEY },
        }
      );

      const price = priceRes.data?.usdPrice || 0;

      // 3️⃣ DexScreener
      const dexRes = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`
      );

      const pairs = dexRes.data?.pairs || [];
      const basePairs = pairs.filter((p) => p.chainId === "base");

      const bestPair =
        basePairs.length > 0
          ? basePairs.reduce((prev, current) =>
              (prev.liquidity?.usd || 0) > (current.liquidity?.usd || 0)
                ? prev
                : current
            )
          : null;

      const liquidityUsd = Number(bestPair?.liquidity?.usd || 0);
      const priceChange = bestPair?.priceChange || {};

      // ===============================
      // TRUE Market Cap + FDV
      // ===============================
      const fdv = totalSupply * price;
      const marketCap = circulatingSupply > 0 ? circulatingSupply * price : fdv;

      setTokenData({
        name: metadata.name,
        symbol: metadata.symbol,
        address,
        priceUsd: price,
        liquidityUsd,
        totalSupply,
        circulatingSupply,
        marketCap,
        fdv,
        change5m: Number(priceChange.m5 || 0),
        change1h: Number(priceChange.h1 || 0),
        change6h: Number(priceChange.h6 || 0),
        change24h: Number(priceChange.h24 || 0),
      });

      setFetchedTokenAddress(address);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setMessage("Failed to fetch token data.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Animated background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)] opacity-20"></div>
      
      {/* Gradient orbs for depth */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>

      {/* Header */}
      <header className="relative border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & Brand */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3 group cursor-pointer">
                {/* Animated logo icon */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
                  <div className="relative w-12 h-12 bg-gradient-to-br from-cyan-500 via-blue-500 to-blue-600 rounded-xl flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                
                {/* Brand name with gradient */}
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent tracking-tight">
                  baseSwap
                </h1>
              </div>

              {/* Navigation - Hidden on mobile */}
              <nav className="hidden lg:flex items-center gap-6">
                <a href="#swap" className="group relative px-4 py-2 text-cyan-400 font-semibold text-sm">
                  SWAP
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 transform scale-x-100 transition-transform"></div>
                </a>
                <a href="#pools" className="px-4 py-2 text-slate-400 hover:text-cyan-400 font-semibold text-sm transition-colors">
                  POOLS
                </a>
                <a href="#analytics" className="px-4 py-2 text-slate-400 hover:text-cyan-400 font-semibold text-sm transition-colors">
                  ANALYTICS
                </a>
              </nav>
            </div>

            {/* Right side: ETH Price + Wallet */}
            <div className="flex items-center gap-3 md:gap-4">
              {/* ETH Price Badge */}
              {ethPrice && (
                <div className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-900/50 border border-cyan-500/20 rounded-xl backdrop-blur-sm hover:border-cyan-500/40 transition-all group">
                  <div className="relative">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-75"></div>
                  </div>
                  <span className="text-slate-400 text-xs md:text-sm font-medium">ETH</span>
                  <span className="text-cyan-400 font-bold text-sm md:text-base tabular-nums">
                    ${ethPrice.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Wallet Connect */}
              <WalletConnect setMessage={setMessage} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          {/* Status Message Banner */}
          {message && (
            <div className={`mb-6 p-4 rounded-xl border-2 backdrop-blur-sm animate-in slide-in-from-top-5 duration-500 ${
              message.includes("Invalid") || message.includes("Failed") || message.includes("missing")
                ? "bg-red-950/50 border-red-500/50"
                : "bg-cyan-950/50 border-cyan-500/50"
            }`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {message.includes("Invalid") || message.includes("Failed") || message.includes("missing") ? (
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-medium text-sm md:text-base ${
                    message.includes("Invalid") || message.includes("Failed") || message.includes("missing")
                      ? "text-red-200"
                      : "text-cyan-200"
                  }`}>
                    {message}
                  </p>
                </div>
                <button
                  onClick={() => setMessage("")}
                  className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
            {/* Left Column: Token Search & Info (3/5 width) */}
            <div className="lg:col-span-3 space-y-6">
              {/* Token Search Card */}
              <div className="group bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 md:p-8 shadow-2xl hover:border-cyan-500/30 transition-all duration-500">
                {/* Card Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white">Token Explorer</h2>
                      <p className="text-slate-400 text-sm">Search Base network tokens</p>
                    </div>
                  </div>
                  
                  {/* Base Network Badge */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-blue-400 text-xs font-bold">BASE</span>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={inputAddress}
                    onChange={(e) => setInputAddress(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !loading && fetchToken()}
                    placeholder="Enter token address (0x...)"
                    className="w-full pl-12 pr-4 py-4 bg-slate-950/50 border-2 border-slate-800/50 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-cyan-500/50 focus:bg-slate-900/50 transition-all duration-300"
                  />
                  {inputAddress && (
                    <button
                      onClick={() => setInputAddress("")}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Fetch Button */}
                <button
                  onClick={fetchToken}
                  disabled={loading || !inputAddress}
                  className={`w-full py-4 rounded-xl font-bold text-white transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden ${
                    loading || !inputAddress
                      ? "bg-slate-800 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40"
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      <span>ANALYZING TOKEN...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>FETCH TOKEN DATA</span>
                    </div>
                  )}
                </button>

                {/* Helper Text */}
                <div className="mt-4 pt-4 border-t border-slate-800/50">
                  <div className="flex items-start gap-2 text-slate-400 text-xs">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="leading-relaxed">
                      Enter a valid Base network token address. We'll fetch real-time data from Moralis and DexScreener.
                    </p>
                  </div>
                </div>
              </div>

              {/* Token Info Display */}
              {tokenData && (
                <div className="animate-in slide-in-from-left-5 duration-700">
                  <TokenInfo tokenData={tokenData} />
                </div>
              )}

              {/* Empty State */}
              {!tokenData && !loading && (
                <div className="bg-slate-900/20 backdrop-blur-sm border-2 border-dashed border-slate-800/50 rounded-2xl p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-slate-800/50 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-400 mb-2">No Token Selected</h3>
                  <p className="text-slate-500 text-sm">Enter a token address above to view details and start trading</p>
                </div>
              )}
            </div>

            {/* Right Column: Swap Interface (2/5 width) */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <Swap
                  tokenAddress={fetchedTokenAddress}
                  tokenData={tokenData}
                  ethPrice={ethPrice}
                />
              </div>
            </div>
          </div>

          {/* Feature Cards - Below main content */}
          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <div className="bg-slate-900/30 backdrop-blur-sm border border-slate-800/50 rounded-2xl p-6 hover:border-cyan-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all duration-300">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Lightning Fast</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Execute swaps instantly on Base L2 with minimal gas fees and maximum efficiency
              </p>
            </div>

            <div className="bg-slate-900/30 backdrop-blur-sm border border-slate-800/50 rounded-2xl p-6 hover:border-blue-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 group-hover:scale-110 transition-all duration-300">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Secure & Trustless</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Non-custodial architecture means you always maintain full control of your assets
              </p>
            </div>

            <div className="bg-slate-900/30 backdrop-blur-sm border border-slate-800/50 rounded-2xl p-6 hover:border-purple-500/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all duration-300">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Real-Time Analytics</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Live price feeds, liquidity data, and market metrics from multiple data sources
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative mt-20 border-t border-slate-800/50 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-slate-400 text-sm font-medium">baseSwap © 2024</span>
            </div>
            
            <div className="flex items-center gap-6">
              <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm font-medium">
                Documentation
              </a>
              <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm font-medium">
                GitHub
              </a>
              <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm font-medium">
                Discord
              </a>
              <a href="#" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm font-medium">
                Twitter
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}