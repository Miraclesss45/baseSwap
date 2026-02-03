import React, { useState, useEffect, useCallback, useRef } from "react";
import { LuArrowUpDown } from "react-icons/lu";
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

// Use getAddress to ensure proper checksum format
const ROUTER_ADDRESS = getAddress("0x4752ba5dbc23f44d87826276bf6d2a606c4e5001");
const WETH_ADDRESS = getAddress("0x4200000000000000000000000000000000000006");
const DEFAULT_GAS_ESTIMATE = "0.005"; // More realistic default

export default function Swap({
  tokenAddress,
  tokenData,
  ethPrice: appEthPrice,
}) {
  // --- WAGMI Hooks ---
  const { address, isConnected, chain } = useAccount();
  const { data: balanceData } = useBalance({
    address,
    chainId: base.id,
    watch: true,
  });
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const publicClient = usePublicClient({ chainId: base.id });
  const { switchChain } = useSwitchChain();

  // --- State ---
  const [ethAmount, setEthAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [reversed, setReversed] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice, setEthPrice] = useState(appEthPrice || null);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [hasInsufficientTokenBalance, setHasInsufficientTokenBalance] =
    useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastEditedField, setLastEditedField] = useState(""); // Track which field user last edited

  // Ref to track previous gas estimate to avoid unnecessary updates
  const prevGasEstimate = useRef("0");

  const tokenSymbol = tokenData?.symbol ?? "TOKEN";
  const tokenName = tokenData?.name ?? "Token";
  const tokenDecimals = tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;

  // Ensure token address is checksummed
  let checksummedTokenAddress = null;
  try {
    checksummedTokenAddress = tokenAddress ? getAddress(tokenAddress) : null;
  } catch (err) {
    console.error("Invalid token address:", err);
  }

  // Check if on correct network
  const isCorrectNetwork = chain?.id === base.id;

  // Switch to Base network
  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: base.id });
    } catch (error) {
      console.error("Failed to switch network:", error);
      alert(
        "Failed to switch to Base network. Please switch manually in your wallet."
      );
    }
  };

  // --- Fetch ETH price if not provided ---
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        setEthPrice(res.data.ethereum.usd);
      } catch (err) {
        console.error("Failed to fetch ETH price:", err);
        // Only set fallback if no price was provided
        if (!appEthPrice) setEthPrice(3000);
      }
    };

    // Fetch if we don't have a price yet
    if (!appEthPrice && !ethPrice) {
      fetchEthPrice();
    } else if (appEthPrice) {
      setEthPrice(appEthPrice);
    }
  }, []);

  // --- Fetch token balance for Token->ETH swaps ---
  useEffect(() => {
    if (!isConnected || !checksummedTokenAddress || !publicClient) {
      setTokenBalance("0");
      return;
    }

    const fetchTokenBalance = async () => {
      try {
        const balance = await publicClient.readContract({
          address: checksummedTokenAddress,
          abi: ERC20ABI,
          functionName: "balanceOf",
          args: [address],
        });
        setTokenBalance(formatUnits(balance, tokenDecimals));
      } catch (err) {
        console.error("Failed to fetch token balance:", err);
        setTokenBalance("0");
      }
    };

    fetchTokenBalance();
  }, [
    isConnected,
    checksummedTokenAddress,
    publicClient,
    address,
    tokenDecimals,
  ]);

  // --- Derived values ---
  const outputAmount = reversed ? ethAmount : tokenAmount;
  const outputSymbol = reversed ? "ETH" : tokenSymbol;
  const minReceivedUI = outputAmount
    ? (Number(outputAmount) * (1 - slippage / 100)).toFixed(6)
    : "0";

  // Calculate total ETH needed (input + gas for ETH->Token, or just gas for Token->ETH)
  const userEthBalance = Number(balanceData?.formatted || 0);
  const totalEthNeeded = reversed
    ? Number(estimatedGas)
    : Number(ethAmount || 0) + Number(estimatedGas);
  const hasInsufficientEthBalance =
    isConnected && totalEthNeeded > userEthBalance;

  // Helper functions for price calculations (DEX standard formula)
  const calcTokenFromEth = useCallback(
    (ethVal) => {
      if (!ethVal || !ethPrice || !tokenPriceUsd) return "";
      // Formula: (ETH Amount × ETH Price USD) / Token Price USD
      const result = ((Number(ethVal) * ethPrice) / tokenPriceUsd).toFixed(6);
      return result;
    },
    [ethPrice, tokenPriceUsd]
  );

  const calcEthFromToken = useCallback(
    (tkVal) => {
      if (!tkVal || !ethPrice || !tokenPriceUsd) return "";
      // Formula: (Token Amount × Token Price USD) / ETH Price USD
      const result = ((Number(tkVal) * tokenPriceUsd) / ethPrice).toFixed(6);
      return result;
    },
    [ethPrice, tokenPriceUsd]
  );

  // --- Recalculate ONLY when prices change, not on every render ---
  useEffect(() => {
    if (!ethPrice || !tokenPriceUsd || !lastEditedField) return;

    // Only recalculate if the user hasn't recently edited
    if (lastEditedField === "eth" && ethAmount) {
      const calculated = calcTokenFromEth(ethAmount);
      setTokenAmount(calculated);
    } else if (lastEditedField === "token" && tokenAmount) {
      const calculated = calcEthFromToken(tokenAmount);
      setEthAmount(calculated);
    }
  }, [ethPrice, tokenPriceUsd, calcTokenFromEth, calcEthFromToken]);

  // --- Validate token balance before Token->ETH swap ---
  useEffect(() => {
    if (reversed && tokenAmount) {
      const userTokenBalance = Number(tokenBalance);
      const inputAmount = Number(tokenAmount);
      setHasInsufficientTokenBalance(inputAmount > userTokenBalance);
    } else {
      setHasInsufficientTokenBalance(false);
    }
  }, [reversed, tokenAmount, tokenBalance]);

  // --- Gas estimation ---
  useEffect(() => {
    const estimateGas = async () => {
      if (
        !isConnected ||
        !isCorrectNetwork ||
        !checksummedTokenAddress ||
        !publicClient ||
        !address ||
        (Number(ethAmount) <= 0 && Number(tokenAmount) <= 0)
      ) {
        setEstimatedGas("0");
        return;
      }

      try {
        const gasPrice = await publicClient.getGasPrice();
        const amountInString = reversed ? tokenAmount || "0" : ethAmount || "0";

        // Skip if amount is too small
        if (Number(amountInString) <= 0) {
          setEstimatedGas("0");
          return;
        }

        let gasEstimate;

        if (!reversed) {
          // ETH -> Token
          const amountIn = parseEther(amountInString);
          const amountOutMin = parseUnits(minReceivedUI, tokenDecimals);

          gasEstimate = await publicClient.estimateContractGas({
            address: ROUTER_ADDRESS,
            abi: UNISWAP_ROUTER_ABI,
            functionName: "swapExactETHForTokens",
            args: [
              amountOutMin,
              [WETH_ADDRESS, checksummedTokenAddress],
              address,
              BigInt(Math.floor(Date.now() / 1000) + 600),
            ],
            value: amountIn,
            account: address,
          });
        } else {
          // Token -> ETH
          const amountIn = parseUnits(amountInString, tokenDecimals);
          const amountOutMin = parseEther(minReceivedUI);

          try {
            gasEstimate = await publicClient.estimateContractGas({
              address: ROUTER_ADDRESS,
              abi: UNISWAP_ROUTER_ABI,
              functionName: "swapExactTokensForETH",
              args: [
                amountIn,
                amountOutMin,
                [checksummedTokenAddress, WETH_ADDRESS],
                address,
                BigInt(Math.floor(Date.now() / 1000) + 600),
              ],
              account: address,
            });
          } catch (e) {
            // If estimation fails, use a reasonable default
            gasEstimate = BigInt(300000);
          }
        }

        const totalGas = gasEstimate * gasPrice;
        const estimatedGasFormatted = Number(formatEther(totalGas)).toFixed(6);

        // Only update if significantly different (avoid unnecessary renders)
        if (estimatedGasFormatted !== prevGasEstimate.current) {
          setEstimatedGas(estimatedGasFormatted);
          prevGasEstimate.current = estimatedGasFormatted;
        }
      } catch (err) {
        console.error("Gas estimation failed:", err);
        // Set a realistic default gas estimate
        setEstimatedGas(DEFAULT_GAS_ESTIMATE);
        prevGasEstimate.current = DEFAULT_GAS_ESTIMATE;
      }
    };

    // Debounce gas estimation
    const timeout = setTimeout(estimateGas, 500);
    return () => clearTimeout(timeout);
  }, [
    ethAmount,
    tokenAmount,
    reversed,
    slippage,
    isConnected,
    isCorrectNetwork,
    checksummedTokenAddress,
    publicClient,
    tokenDecimals,
    minReceivedUI,
    address,
  ]);

  // --- Helper Functions ---
  const approveToken = async (amountToApprove) => {
    try {
      setLoading(true);
      setApprovalMessage("");
      setErrorMessage("");

      const hash = await walletClient.writeContract({
        address: checksummedTokenAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, amountToApprove],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setApprovalMessage("✓ Token approved successfully!");
      console.log("Token approved!");

      // Clear approval message after 3 seconds
      setTimeout(() => setApprovalMessage(""), 3000);

      setLoading(false);
      return true;
    } catch (err) {
      console.error("Approval failed:", err);
      setApprovalMessage("");
      setErrorMessage("Approval failed: " + (err.message || "Unknown error"));
      setLoading(false);
      return false;
    }
  };

  const handleSwap = async () => {
    setErrorMessage("");

    if (!isConnected) {
      setErrorMessage("Connect wallet first");
      return;
    }

    // Check network before swapping
    if (!isCorrectNetwork) {
      setErrorMessage("Please switch to Base network");
      await handleSwitchNetwork();
      return;
    }

    if (!ethAmount && !tokenAmount) {
      setErrorMessage("Enter amounts");
      return;
    }
    if (!walletClient) {
      setErrorMessage("Wallet not ready");
      return;
    }

    const amountInValue = reversed ? Number(tokenAmount) : Number(ethAmount);
    if (amountInValue <= 0) {
      setErrorMessage("Amount must be greater than zero.");
      return;
    }

    // Validate balances
    if (hasInsufficientEthBalance) {
      setErrorMessage(
        `Insufficient ETH balance. Need: ${totalEthNeeded.toFixed(6)} ETH`
      );
      return;
    }

    if (hasInsufficientTokenBalance) {
      setErrorMessage(
        `Insufficient token balance. Have: ${tokenBalance} ${tokenSymbol}`
      );
      return;
    }

    try {
      setLoading(true);
      setApprovalMessage("");
      setErrorMessage("");

      const minReceivedForTx = minReceivedUI;
      const amountInString = reversed ? tokenAmount : ethAmount;

      if (!reversed) {
        // ETH -> Token swap
        const amountIn = parseEther(amountInString);
        const amountOutMin = parseUnits(minReceivedForTx, tokenDecimals);

        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [
            amountOutMin,
            [WETH_ADDRESS, checksummedTokenAddress],
            address,
            BigInt(Math.floor(Date.now() / 1000) + 600),
          ],
          value: amountIn,
        });

        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        // Token -> ETH swap
        const amountIn = parseUnits(amountInString, tokenDecimals);
        const amountOutMin = parseEther(minReceivedForTx);

        // Check allowance
        const allowance = await publicClient.readContract({
          address: checksummedTokenAddress,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address, ROUTER_ADDRESS],
        });

        if (BigInt(allowance) < amountIn) {
          const approved = await approveToken(amountIn);
          if (!approved) return;
        }

        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [
            amountIn,
            amountOutMin,
            [checksummedTokenAddress, WETH_ADDRESS],
            address,
            BigInt(Math.floor(Date.now() / 1000) + 600),
          ],
        });

        await publicClient.waitForTransactionReceipt({ hash });
      }

      alert("Swap successful!");
      setEthAmount("");
      setTokenAmount("");
    } catch (err) {
      console.error("Swap failed:", err);
      setErrorMessage("Swap failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleReverse = () => {
    // Simply toggle reversed - amounts stay the same!
    // The UI will just swap which input is input vs output
    setReversed(!reversed);
  };

  // --- Validation ---
  const isValidAddress = (addr) => {
    return addr && /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  // --- Conditional Rendering ---
  if (!checksummedTokenAddress) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white text-lg">
          Paste a token address and click "Fetch Token"
        </p>
      </div>
    );
  }

  if (!isValidAddress(checksummedTokenAddress)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-lg">Invalid Token Address</p>
      </div>
    );
  }

  return (
    <div className="bg-black outline-2 outline-gray-400 p-6 rounded-2xl shadow-2xl max-w-md mx-auto">
      <h2 className="text-xl font-bold text-white mb-2 text-center">
        Swap {reversed ? tokenSymbol : "ETH"} ↔ {reversed ? "ETH" : tokenSymbol}
      </h2>
      <p className="text-white text-sm text-center mb-4">
        {tokenData
          ? `${tokenName} (${tokenSymbol})`
          : "Enter a token address to load token info"}
      </p>

      {isConnected && !isCorrectNetwork && (
        <div className="mb-4 p-3 bg-red-500 rounded-xl text-white text-center">
          <p className="font-semibold mb-2">
            You're on {chain?.name || "the wrong network"}
          </p>
          <button
            onClick={handleSwitchNetwork}
            className="bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition"
          >
            Switch to Base Network
          </button>
        </div>
      )}

      <div className="relative flex flex-col items-center space-y-6 w-full">
        <div className="relative w-full flex flex-col items-center">
          {/* Top Input - Primary Input (ETH or Token based on reversed) */}
          <input
            type="number"
            step="any"
            value={reversed ? tokenAmount : ethAmount}
            onChange={(e) => {
              const value = e.target.value;
              setLastEditedField(reversed ? "token" : "eth");

              if (reversed) {
                // Reversed mode: Top input is TOKEN
                setTokenAmount(value);
                if (value) {
                  const calculated = calcEthFromToken(value);
                  setEthAmount(calculated);
                } else {
                  setEthAmount("");
                }
              } else {
                // Normal mode: Top input is ETH
                setEthAmount(value);
                if (value) {
                  const calculated = calcTokenFromEth(value);
                  setTokenAmount(calculated);
                } else {
                  setTokenAmount("");
                }
              }
            }}
            className="w-full p-3 outline-2 outline-gray-400 rounded-xl bg-black text-white text-center h-14 mb-10 shadow-inner"
            placeholder={
              reversed ? `Enter ${tokenSymbol} to sell` : "Enter ETH to buy"
            }
          />

          {/* Swap Button */}
          <div
            onClick={handleReverse}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
      w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center
      cursor-pointer shadow-lg border-4 border-white z-10 hover:bg-blue-700 transition"
          >
            <LuArrowUpDown className="text-white h-6 w-6" />
          </div>

          {/* Bottom Input - Secondary Output (Calculated) */}
          <input
            type="number"
            step="any"
            value={reversed ? ethAmount : tokenAmount}
            onChange={(e) => {
              const value = e.target.value;
              setLastEditedField(reversed ? "eth" : "token");

              if (reversed) {
                // Reversed mode: Bottom input is ETH
                setEthAmount(value);
                if (value) {
                  const calculated = calcTokenFromEth(value);
                  setTokenAmount(calculated);
                } else {
                  setTokenAmount("");
                }
              } else {
                // Normal mode: Bottom input is TOKEN
                setTokenAmount(value);
                if (value) {
                  const calculated = calcEthFromToken(value);
                  setEthAmount(calculated);
                } else {
                  setEthAmount("");
                }
              }
            }}
            className="w-full p-3 outline-2 outline-gray-500 rounded-xl bg-black text-white text-center h-14 mt-10 shadow-inner"
            placeholder={
              reversed
                ? "You will receive ETH"
                : `You will receive ${tokenSymbol}`
            }
          />
        </div>

        <div className="w-full space-y-3 bg-gray-900/50 p-4 rounded-lg">
          <p className="text-white text-sm">
            ETH Price:{" "}
            <span className="font-semibold text-green-400">
              ${ethPrice.toFixed(2)}
            </span>
          </p>
          <p className="text-white text-sm">
            {tokenSymbol} Price:{" "}
            <span className="font-semibold text-green-400">
              ${tokenPriceUsd?.toFixed(6) || "N/A"}
            </span>
          </p>
          <p className="text-white text-sm">
            Min Received:{" "}
            <span className="font-semibold text-blue-300">
              {minReceivedUI} {outputSymbol}
            </span>
          </p>
          <p className="text-white text-sm">
            Gas Fee:{" "}
            <span className="font-semibold text-orange-300">
              {estimatedGas} ETH
            </span>
          </p>
          <p className="text-white text-sm">
            Slippage:{" "}
            <span className="font-semibold text-red-300">{slippage}%</span>
          </p>

          {isConnected && reversed && (
            <p className="text-white text-sm">
              Your {tokenSymbol} Balance:{" "}
              <span className="font-semibold text-cyan-300">
                {Number(tokenBalance).toFixed(6)}
              </span>
            </p>
          )}
        </div>

        {approvalMessage && (
          <div className="w-full mb-3 p-3 bg-green-500/90 rounded-lg">
            <p className="text-white text-sm font-semibold text-center">
              {approvalMessage}
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="w-full mb-3 p-3 bg-red-500/90 rounded-lg">
            <p className="text-white text-sm font-semibold text-center">
              ⚠️ {errorMessage}
            </p>
          </div>
        )}

        {hasInsufficientEthBalance && (
          <div className="w-full mb-3 p-3 bg-red-500/90 rounded-lg">
            <p className="text-white text-sm font-semibold text-center">
              ⚠️ Insufficient ETH Balance
            </p>
            <p className="text-white text-xs text-center mt-1">
              Need: {totalEthNeeded.toFixed(6)} ETH | Have:{" "}
              {userEthBalance.toFixed(6)} ETH
            </p>
          </div>
        )}

        {hasInsufficientTokenBalance && (
          <div className="w-full mb-3 p-3 bg-red-500/90 rounded-lg">
            <p className="text-white text-sm font-semibold text-center">
              ⚠️ Insufficient {tokenSymbol} Balance
            </p>
            <p className="text-white text-xs text-center mt-1">
              Need: {tokenAmount} | Have: {Number(tokenBalance).toFixed(6)}
            </p>
          </div>
        )}

        <button
          className={`w-full py-4 px-6 rounded-2xl text-white font-extrabold text-lg transition-all duration-300 shadow-xl border-2 
            flex items-center justify-center gap-2 transform hover:scale-105 active:scale-95
            ${
              loading ||
              !isConnected ||
              !isCorrectNetwork ||
              !outputAmount ||
              Number(outputAmount) <= 0 ||
              hasInsufficientEthBalance ||
              hasInsufficientTokenBalance
                ? "bg-gradient-to-r from-gray-600 to-gray-700 border-gray-500 cursor-not-allowed opacity-60"
                : "bg-gradient-to-r from-green-500 to-emerald-600 border-green-400 hover:from-green-600 hover:to-emerald-700 hover:shadow-2xl hover:shadow-green-500/50 active:from-emerald-700 active:to-green-800"
            }`}
          disabled={
            loading ||
            !isConnected ||
            !isCorrectNetwork ||
            !outputAmount ||
            Number(outputAmount) <= 0 ||
            hasInsufficientEthBalance ||
            hasInsufficientTokenBalance
          }
          onClick={handleSwap}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
              <span>Processing Swap...</span>
            </>
          ) : !isCorrectNetwork ? (
            <>
              <span>⚠️</span>
              <span>Switch to Base</span>
            </>
          ) : hasInsufficientEthBalance ? (
            <>
              <span>❌</span>
              <span>Insufficient ETH</span>
            </>
          ) : hasInsufficientTokenBalance ? (
            <>
              <span>❌</span>
              <span>Insufficient {tokenSymbol}</span>
            </>
          ) : !outputAmount || Number(outputAmount) <= 0 ? (
            <>
              <span>📝</span>
              <span>Enter Amount</span>
            </>
          ) : !isConnected ? (
            <>
              <span>🔗</span>
              <span>Connect Wallet</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>Execute Swap</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
