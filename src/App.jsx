// src/App.jsx
import "./App.css";
import { useState, useEffect, useRef } from "react";
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
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Fetch ETH price (CoinGecko)
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        setEthPrice(res.data?.ethereum?.usd ?? null);
      } catch (err) {
        console.error("Failed to fetch ETH price:", err);
        // fallback
        setEthPrice(3000);
      }
    };

    fetchEthPrice();

    // Refresh every 10s
    const t = setInterval(fetchEthPrice, 20_000);
    return () => clearInterval(t);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Fetch token info from DexScreener (with proper error handling)
  const fetchToken = async () => {
    try {
      setMessage("");
      setTokenData(null);
      setFetchedTokenAddress(null);

      const trimmedAddress = inputAddress?.trim();

      if (!trimmedAddress) {
        setMessage("Please paste a token address.");
        return;
      }

      // Basic validation for Ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedAddress)) {
        setMessage("Invalid address format. Must be a valid Ethereum address.");
        return;
      }

      // Cancel previous request if it's still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);

      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${trimmedAddress}`,
        {
          signal: abortControllerRef.current.signal,
          timeout: 10000,
        }
      );

      // Check if request was aborted
      if (!response?.data) {
        setLoading(false);
        return;
      }

      const pairs = response.data?.pairs;

      if (!pairs || pairs.length === 0) {
        setMessage("No trading pairs found for this token.");
        setLoading(false);
        return;
      }

      // Find the pair with the most liquidity on Base chain
      const basePairs = pairs.filter((p) => p.chainId === "base");
      const pair =
        basePairs.length > 0
          ? basePairs.reduce((prev, current) =>
              (prev.liquidity?.usd || 0) > (current.liquidity?.usd || 0)
                ? prev
                : current
            )
          : pairs[0];

      // Safely extract data
      if (!pair?.baseToken) {
        setMessage("Could not parse token data. Please try again.");
        setLoading(false);
        return;
      }

      const priceUsd = parseFloat(pair.priceUsd) || 0;
      const liquidityUsd = parseFloat(pair.liquidity?.usd) || 0;
      const volume24h = parseFloat(pair.volume?.h24) || 0;
      const priceChange24h = parseFloat(pair.priceChange?.h24) || 0;
      const decimals = pair.baseToken?.decimals || 18;

      setTokenData({
        name: pair.baseToken?.name || "Unknown Token",
        symbol: pair.baseToken?.symbol || "TOKEN",
        address: pair.baseToken?.address || trimmedAddress,
        priceUsd,
        liquidityUsd,
        volume24h,
        priceChange24h,
        decimals,
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
      });

      // Only set the fetched address after successful fetch
      setFetchedTokenAddress(trimmedAddress);
      setMessage("");
      setLoading(false);
    } catch (error) {
      // Don't update state if request was aborted
      if (error?.code === "ERR_CANCELED") {
        console.log("Request cancelled");
        setLoading(false);
        return;
      }

      console.error("Error fetching token:", error);

      // Only set error message if we haven't already aborted
      if (error?.response?.status === 404) {
        setMessage("Token not found on DexScreener.");
      } else if (error?.response?.status === 429) {
        setMessage("Rate limit exceeded. Please wait a moment.");
      } else if (error?.code !== "ECONNABORTED") {
        setMessage("Failed to fetch token data. Please try again.");
      }

      setTokenData(null);
      setFetchedTokenAddress(null);
      setLoading(false);
    }
  };

  // Debounced fetch to prevent rapid API calls
  const handleFetchToken = () => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      fetchToken();
    }, 300);
  };

  // Allow Enter key to trigger fetch
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleFetchToken();
    }
  };

  return (
    <div className="min-h-screen font-mono bg-black">
      <div className="flex bg-black border-b-4 border-gray-400 h-20 p-10 w-full justify-around items-center">
        <h3 className="text-white font-bold md:text-4xl text-xl font-mono">
          baseSwap
        </h3>

        <div>
          <WalletConnect setMessage={setMessage} />
        </div>
      </div>
      <div className="p-7 md:flex md:flex-row md:justify-center md:items-cente bg-cover bg-center w-full">
        <div className="max-w-6xl mx-auto p-4 font-bold bg-black outline-2 outline-gray-600 rounded-2xl">
          <div className="md:flex md:flex-row md:gap-4 w-full">
            <div className="flex-1 flex flex-col space-y-3 p-4 border rounded-2xl shadow mb-4 md:m-16 bg-black md:h-72 outline-gray-600 outline-2">
              <input
                type="text"
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full p-2 border rounded mb-3 bg-gray-600 text-white"
                placeholder="Paste Token Address (0x...)"
              />
              <button
                onClick={handleFetchToken}
                disabled={loading}
                className={`w-full py-2 rounded-xl shadow text-white font-semibold transition ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {loading ? "Fetching..." : "Fetch Token"}
              </button>

              {message && (
                <div
                  className={`text-center font-semibold p-2 rounded ${
                    message.includes("Invalid") ||
                    message.includes("Failed") ||
                    message.includes("No")
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {message}
                </div>
              )}

              {tokenData && <TokenInfo tokenData={tokenData} />}
            </div>

            <div className="flex-1">
              <Swap
                tokenAddress={fetchedTokenAddress}
                tokenData={tokenData}
                ethPrice={ethPrice}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
