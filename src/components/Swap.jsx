import React, { useState, useEffect } from "react";
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
  const [activeInput, setActiveInput] = useState("eth");
  const [slippage, setSlippage] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0");
  const [ethPrice, setEthPrice] = useState(appEthPrice || 3000);

  const tokenSymbol = tokenData?.symbol ?? "TOKEN";
  const tokenName = tokenData?.name ?? "Token";
  const tokenDecimals = tokenData?.decimals ?? 18;
  const tokenPriceUsd = Number(tokenData?.priceUsd) || null;

  // Ensure token address is checksummed
  const checksummedTokenAddress = tokenAddress
    ? getAddress(tokenAddress)
    : null;

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
    if (appEthPrice) return setEthPrice(appEthPrice);

    const fetchEthPrice = async () => {
      try {
        const res = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        setEthPrice(res.data.ethereum.usd);
      } catch (err) {
        console.error("Failed to fetch ETH price:", err);
      }
    };
    fetchEthPrice();
  }, [appEthPrice]);

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
  const hasInsufficientBalance = isConnected && totalEthNeeded > userEthBalance;

  const calcTokenFromEth = (ethVal) =>
    !ethVal || !ethPrice || !tokenPriceUsd
      ? ""
      : ((Number(ethVal) * ethPrice) / tokenPriceUsd).toFixed(6);

  const calcEthFromToken = (tkVal) =>
    !tkVal || !ethPrice || !tokenPriceUsd
      ? ""
      : ((Number(tkVal) * tokenPriceUsd) / ethPrice).toFixed(6);

  // --- Sync input fields ---
  useEffect(() => {
    if (activeInput === "eth") setTokenAmount(calcTokenFromEth(ethAmount));
    else setEthAmount(calcEthFromToken(tokenAmount));
  }, [ethAmount, tokenAmount, activeInput, ethPrice, tokenPriceUsd]);

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
          // Token -> ETH - need to check token balance first
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
            // If estimation fails for token->ETH, use a default estimate
            gasEstimate = BigInt(250000);
          }
        }

        const totalGas = gasEstimate * gasPrice;
        setEstimatedGas(Number(formatEther(totalGas)).toFixed(6));
      } catch (err) {
        console.error("Gas estimation failed:", err);
        // Set a reasonable default gas estimate
        setEstimatedGas("0.001");
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

      const hash = await walletClient.writeContract({
        address: checksummedTokenAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, amountToApprove],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      console.log("Token approved!");
      return true;
    } catch (err) {
      console.error("Approval failed:", err);
      alert("Approval failed: " + (err.message || "Unknown error"));
      setLoading(false);
      return false;
    }
  };

  const handleSwap = async () => {
    if (!isConnected) {
      alert("Connect wallet first");
      return;
    }

    // Check network before swapping
    if (!isCorrectNetwork) {
      alert("Please switch to Base network");
      await handleSwitchNetwork();
      return;
    }

    if (!ethAmount && !tokenAmount) {
      alert("Enter amounts");
      return;
    }
    if (!walletClient) {
      alert("Wallet not ready");
      return;
    }

    const amountInValue = reversed ? Number(tokenAmount) : Number(ethAmount);
    if (amountInValue <= 0) {
      alert("Amount must be greater than zero.");
      return;
    }

    try {
      setLoading(true);

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

        if (allowance < amountIn) {
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
      alert("Swap failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleReverse = () => {
    const tmpEth = ethAmount;
    setEthAmount(tokenAmount);
    setTokenAmount(tmpEth);
    setReversed(!reversed);
    setActiveInput(activeInput === "eth" ? "token" : "eth");
  };

  // --- Validation ---
  const isValidAddress = (addr) => {
    return addr && /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  // --- Conditional Rendering ---
  if (!checksummedTokenAddress) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white text-lg">Loading Token Info...</p>
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
          {/* Top Input */}
          <input
            type="number"
            step="any"
            value={reversed ? tokenAmount : ethAmount}
            onChange={(e) => {
              setActiveInput(reversed ? "token" : "eth");
              reversed
                ? setTokenAmount(e.target.value)
                : setEthAmount(e.target.value);
            }}
            className="w-full p-3 outline-2 outline-gray-400 rounded-xl bg-black text-white text-center h-14 mb-10 shadow-inner"
            placeholder={
              reversed ? `Enter ${tokenSymbol} amount` : "Enter ETH amount"
            }
          />

          {/* Swap Button */}
          <div
            onClick={handleReverse}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
      w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center
      cursor-pointer shadow-lg border-4 border-white z-10"
          >
            <LuArrowUpDown className="text-white h-6 w-6" />
          </div>

          {/* Bottom Input */}
          <input
            type="number"
            step="any"
            value={reversed ? ethAmount : tokenAmount}
            onChange={(e) => {
              setActiveInput(reversed ? "eth" : "token");
              reversed
                ? setEthAmount(e.target.value)
                : setTokenAmount(e.target.value);
            }}
            className="w-full p-3 outline-2 outline-gray-500 rounded-xl bg-black text-white text-center h-14 mt-10 shadow-inner"
            placeholder={
              reversed ? "Enter ETH amount" : `Enter ${tokenSymbol} amount`
            }
          />
        </div>

        <p className="text-white text-sm mb-1">
          Min Received:{" "}
          <span className="font-semibold">
            {minReceivedUI} {outputSymbol}
          </span>
        </p>
        <p className="text-white text-sm mb-1">
          Estimated Gas Fee:{" "}
          <span className="font-semibold">{estimatedGas} ETH</span>
        </p>
        <p className="text-white text-sm mb-1">
          Slippage:{" "}
          <span className="font-semibold text-red-300">{slippage}%</span>
        </p>

        {hasInsufficientBalance && (
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

        <button
          className={`w-full py-3 rounded-xl text-white font-bold transition duration-200 shadow-md ${
            loading ||
            !isConnected ||
            !isCorrectNetwork ||
            !outputAmount ||
            Number(outputAmount) <= 0 ||
            hasInsufficientBalance
              ? "bg-blue-600 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 active:bg-green-800"
          }`}
          disabled={
            loading ||
            !isConnected ||
            !isCorrectNetwork ||
            !outputAmount ||
            Number(outputAmount) <= 0 ||
            hasInsufficientBalance
          }
          onClick={handleSwap}
        >
          {loading
            ? "Processing..."
            : !isCorrectNetwork
            ? "Wrong Network"
            : hasInsufficientBalance
            ? "Insufficient Balance"
            : "Execute Swap"}
        </button>
      </div>
    </div>
  );
}
