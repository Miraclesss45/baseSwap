# 🔧 BaseSwap - Developer Integration Guide

## Overview

This guide explains how the swap logic integrates with the rest of your application and how to integrate it into other components.

---

## Component Integration

### Current Architecture

```
App.jsx (Main)
    ↓
    ├─ WalletConnect.jsx       ← Wallet connection
    ├─ TokenInfo.jsx           ← Token data fetching
    └─ Swap.jsx               ← SWAP LOGIC (this is what you implemented!)
        ├─ ethAmount, tokenAmount (state)
        ├─ handleSwap() (execute)
        ├─ approveToken() (approval)
        ├─ Gas estimation (useEffect)
        └─ Price calculations (useEffect)
```

### Props Passed to Swap Component

```javascript
<Swap
  tokenAddress={selectedToken} // Token contract address
  tokenData={{
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
    priceUsd: "1.00",
  }}
  ethPrice={3500} // ETH price in USD
/>
```

### Required Props

```javascript
{
  tokenAddress: string,              // e.g., "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  tokenData: {
    name: string,                    // Token name
    symbol: string,                  // Token symbol
    decimals: number,                // Token decimals (usually 18 or 6)
    priceUsd: number                 // Token price in USD
  },
  ethPrice: number                   // ETH price in USD
}
```

---

## How to Use Swap Component

### Basic Setup

```jsx
import Swap from "./components/Swap";

function App() {
  const [selectedToken, setSelectedToken] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [ethPrice, setEthPrice] = useState(3500);

  return (
    <Swap
      tokenAddress={selectedToken}
      tokenData={tokenData}
      ethPrice={ethPrice}
    />
  );
}
```

### With Token Fetching

```jsx
import Swap from "./components/Swap";
import { fetchTokenData } from "./services/api";

function App() {
  const [selectedToken, setSelectedToken] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [ethPrice, setEthPrice] = useState(3500);

  const handleTokenAddressChange = async (address) => {
    setSelectedToken(address);
    const data = await fetchTokenData(address);
    setTokenData(data);
  };

  return (
    <>
      <input
        placeholder="Enter token address"
        onChange={(e) => handleTokenAddressChange(e.target.value)}
      />
      {tokenData && (
        <Swap
          tokenAddress={selectedToken}
          tokenData={tokenData}
          ethPrice={ethPrice}
        />
      )}
    </>
  );
}
```

---

## Extracting Swap Logic for Reuse

### If You Want Swap Logic in Another Component

```javascript
// Create a custom hook: src/hooks/useSwap.js
import { useCallback, useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseEther, parseUnits, formatEther } from "viem";
import UNISWAP_ROUTER_ABI from "../abis/UniswapV2Router.json";
import ERC20ABI from "../abis/ERC20.json";

const ROUTER_ADDRESS = "0x4752ba5dbc23f44d87826276bf6d2a606c4e5001";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

export function useSwap() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const executeEthToTokenSwap = useCallback(
    async (
      ethAmount,
      tokenAddress,
      tokenDecimals,
      minOutput,
      deadline = Math.floor(Date.now() / 1000) + 600,
    ) => {
      try {
        setLoading(true);
        setError("");

        const amountIn = parseEther(ethAmount);
        const amountOutMin = parseUnits(minOutput, tokenDecimals);

        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [
            amountOutMin,
            [WETH_ADDRESS, tokenAddress],
            address,
            BigInt(deadline),
          ],
          value: amountIn,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status !== "success") {
          throw new Error("Transaction failed");
        }

        return { success: true, hash, receipt };
      } catch (err) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [address, walletClient, publicClient],
  );

  const executeTokenToEthSwap = useCallback(
    async (
      tokenAmount,
      tokenAddress,
      tokenDecimals,
      minOutput,
      deadline = Math.floor(Date.now() / 1000) + 600,
    ) => {
      try {
        setLoading(true);
        setError("");

        const amountIn = parseUnits(tokenAmount, tokenDecimals);
        const amountOutMin = parseEther(minOutput);

        // Check allowance
        const allowance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [address, ROUTER_ADDRESS],
        });

        if (BigInt(allowance) < amountIn) {
          // Request approval
          const approvalHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20ABI,
            functionName: "approve",
            args: [ROUTER_ADDRESS, amountIn],
          });

          await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });
        }

        const hash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: UNISWAP_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [
            amountIn,
            amountOutMin,
            [tokenAddress, WETH_ADDRESS],
            address,
            BigInt(deadline),
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status !== "success") {
          throw new Error("Transaction failed");
        }

        return { success: true, hash, receipt };
      } catch (err) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [address, walletClient, publicClient],
  );

  return {
    loading,
    error,
    executeEthToTokenSwap,
    executeTokenToEthSwap,
  };
}
```

### Using the Hook in Another Component

```jsx
import { useSwap } from "../hooks/useSwap";

function MyCustomSwapper() {
  const { loading, error, executeEthToTokenSwap } = useSwap();

  const handleSwap = async () => {
    const result = await executeEthToTokenSwap(
      "1", // 1 ETH
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      6, // USDC decimals
      "2330", // Min output
    );

    if (result.success) {
      console.log("Swap successful:", result.hash);
    } else {
      console.error("Swap failed:", result.error);
    }
  };

  return (
    <button onClick={handleSwap} disabled={loading}>
      {loading ? "Swapping..." : "Swap 1 ETH to USDC"}
    </button>
  );
}
```

---

## API Integration Pattern

### If You Have a Backend API

```javascript
// src/services/swapService.js
import axios from "axios";

const API_BASE = "https://api.yourapp.com";

export const swapService = {
  // Get swap quote
  async getQuote(tokenIn, tokenOut, amountIn) {
    const res = await axios.get(`${API_BASE}/swap/quote`, {
      params: { tokenIn, tokenOut, amountIn },
    });
    return res.data;
  },

  // Track swap transaction
  async trackSwap(txHash, details) {
    const res = await axios.post(`${API_BASE}/swap/track`, {
      txHash,
      details,
    });
    return res.data;
  },

  // Get swap history
  async getSwapHistory(userAddress) {
    const res = await axios.get(`${API_BASE}/swap/history/${userAddress}`);
    return res.data;
  },
};
```

### Using in Swap Component

```javascript
// In Swap.jsx handleSwap function
const handleSwap = async () => {
  try {
    // ... existing code ...

    // After successful swap:
    if (receipt.status === "success") {
      // Track in backend
      await swapService.trackSwap(hash, {
        from: reversed ? tokenSymbol : "ETH",
        to: reversed ? "ETH" : tokenSymbol,
        amountIn: reversed ? tokenAmount : ethAmount,
        amountOut: reversed ? ethAmount : tokenAmount,
        slippage,
        timestamp: new Date().toISOString(),
      });

      // Success handling...
    }
  } catch (err) {
    // Error handling...
  }
};
```

---

## State Management (Redux/Zustand Integration)

### If Using Redux

```javascript
// src/store/swapSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const executeSwap = createAsyncThunk(
  "swap/executeSwap",
  async ({ tokenAddress, ethAmount, slippage }, { rejectWithValue }) => {
    try {
      const walletClient = useWalletClient();
      const publicClient = usePublicClient();
      // ... swap logic ...
      return { success: true, txHash };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const swapSlice = createSlice({
  name: "swap",
  initialState: {
    loading: false,
    error: null,
    lastSwap: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(executeSwap.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(executeSwap.fulfilled, (state, action) => {
        state.loading = false;
        state.lastSwap = action.payload;
      })
      .addCase(executeSwap.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default swapSlice.reducer;
```

---

## Error Handling Pattern

### Custom Error Types

```javascript
// src/errors/SwapErrors.js

export class SwapError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.code = code;
    this.context = context;
  }
}

export class InsufficientBalanceError extends SwapError {
  constructor(context) {
    super("Insufficient balance", "INSUFFICIENT_BALANCE", context);
  }
}

export class SlippageExceededError extends SwapError {
  constructor(context) {
    super("Slippage exceeded", "SLIPPAGE_EXCEEDED", context);
  }
}

export class ApprovalFailedError extends SwapError {
  constructor(context) {
    super("Token approval failed", "APPROVAL_FAILED", context);
  }
}
```

### Using Custom Errors

```javascript
import {
  InsufficientBalanceError,
  SlippageExceededError,
  ApprovalFailedError,
} from "../errors/SwapErrors";

const handleSwap = async () => {
  try {
    if (hasInsufficientEthBalance) {
      throw new InsufficientBalanceError({
        needed: totalEthNeeded,
        have: userEthBalance,
      });
    }

    // ... swap logic ...
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      // Handle balance error
    } else if (err instanceof ApprovalFailedError) {
      // Handle approval error
    } else {
      // Generic error
    }
  }
};
```

---

## Testing the Swap Logic

### Unit Test Example

```javascript
// src/__tests__/swap.test.js
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSwap } from "../hooks/useSwap";

describe("useSwap", () => {
  it("should execute ETH to token swap", async () => {
    const { result } = renderHook(() => useSwap());

    await act(async () => {
      const res = await result.current.executeEthToTokenSwap(
        "1", // ethAmount
        "0x...", // tokenAddress
        18, // decimals
        "2330", // minOutput
      );

      expect(res.success).toBe(true);
      expect(res.hash).toBeDefined();
    });
  });

  it("should handle swap errors", async () => {
    const { result } = renderHook(() => useSwap());

    await act(async () => {
      const res = await result.current.executeEthToTokenSwap(
        "0", // invalid amount
        "0x...",
        18,
        "0",
      );

      expect(res.success).toBe(false);
      expect(result.current.error).toBeDefined();
    });
  });
});
```

---

## Monitoring & Analytics

### Tracking Swaps

```javascript
// src/services/analytics.js
export const trackSwap = (event) => {
  // Send to analytics service
  window.gtag?.("event", "swap_executed", {
    token: event.tokenSymbol,
    ethAmount: event.ethAmount,
    slippage: event.slippage,
    gasUsed: event.gasUsed,
    txHash: event.txHash,
  });

  // Log to backend
  logger.info("Swap executed", event);
};

export const trackSwapError = (error) => {
  window.gtag?.("event", "swap_error", {
    errorCode: error.code,
    errorMessage: error.message,
  });

  logger.error("Swap error", error);
};
```

---

## Performance Optimization

### Memoization

```javascript
// Avoid recalculating prices unnecessarily
import { useMemo } from "react";

const minReceivedUI = useMemo(() => {
  if (!outputAmount) return "0";
  return (Number(outputAmount) * (1 - slippage / 100)).toFixed(6);
}, [outputAmount, slippage]);
```

### Debounced Gas Estimation

```javascript
// Already implemented in current code!
// Gas estimation debounced by 500ms to prevent RPC spam
useEffect(
  () => {
    const timeout = setTimeout(estimateGas, 500);
    return () => clearTimeout(timeout);
  },
  [
    /* dependencies */
  ],
);
```

---

## Security Considerations

### Input Validation

```javascript
// Always validate before smart contract calls
function validateSwapInputs(ethAmount, tokenAmount, slippage) {
  // Check amounts are numbers
  if (isNaN(ethAmount) || isNaN(tokenAmount)) {
    throw new Error("Invalid amount");
  }

  // Check amounts are positive
  if (ethAmount <= 0 || tokenAmount <= 0) {
    throw new Error("Amount must be > 0");
  }

  // Check slippage is reasonable
  if (slippage < 0 || slippage > 50) {
    throw new Error("Invalid slippage");
  }

  return true;
}
```

### Address Validation

```javascript
import { getAddress } from "viem";

function validateTokenAddress(address) {
  try {
    // getAddress validates checksum and format
    return getAddress(address);
  } catch (err) {
    throw new Error("Invalid token address");
  }
}
```

---

## Environment Configuration

### Create .env.local

```
VITE_RPC_URL=https://mainnet.base.org
VITE_ROUTER_ADDRESS=0x4752ba5dbc23f44d87826276bf6d2a606c4e5001
VITE_WETH_ADDRESS=0x4200000000000000000000000000000000000006
VITE_API_KEY=your_api_key
```

### Access in Code

```javascript
const ROUTER_ADDRESS = getAddress(import.meta.env.VITE_ROUTER_ADDRESS);
```

---

## Documentation for Integrators

### What You Tell Other Developers

```
Our swap component provides:
✓ ETH ↔ Token swaps on Base network
✓ Automatic token approval detection
✓ Real-time gas estimation
✓ Slippage protection (0-50%)
✓ Comprehensive error handling
✓ Transaction monitoring
✓ Wallet integration via wagmi

To use:
1. Pass tokenAddress, tokenData, ethPrice as props
2. Component handles everything else
3. Monitor console for detailed logs
4. Check Base Scan with transaction hash

For integration questions:
- See SWAP_LOGIC_DOCUMENTATION.md
- Check SWAP_QUICK_START.md
- Review TESTING_SCENARIOS.md
```

---

## Summary

Your swap logic is:

- ✅ **Modular**: Can be extracted to hooks
- ✅ **Reusable**: Can be used in other components
- ✅ **Testable**: Has clear inputs and outputs
- ✅ **Maintainable**: Well-documented and organized
- ✅ **Scalable**: Ready for Redux/Zustand integration
- ✅ **Secure**: Includes validation and error handling
- ✅ **Monitored**: Includes logging and tracking

**Ready for production deployment!**

---

_Last Updated: February 3, 2026_
