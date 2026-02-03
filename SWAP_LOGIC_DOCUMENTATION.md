# BaseSwap - Swap Logic Implementation

## Overview

This document explains the smart contract interaction layer and swap logic implemented in the `Swap.jsx` component. The implementation enables users to swap ETH ↔ Tokens on the Base network using Uniswap V2 Router.

---

## Architecture

### Key Components

#### 1. **Wallet Integration (wagmi + viem)**

- **useAccount()**: Monitors connected wallet, address, and chain
- **useWalletClient()**: Manages wallet transactions (writes to blockchain)
- **usePublicClient()**: Handles read-only blockchain operations

#### 2. **Smart Contract Interaction**

- **Router**: Uniswap V2 Router (0x4752ba5dbc23f44d87826276bf6d2a606c4e5001)
- **WETH**: Wrapped ETH on Base (0x4200000000000000000000000000000000000006)
- **Token**: User-specified ERC20 token

---

## Swap Flow

### ETH → Token Swap (Direct)

```
User Input: ETH Amount
    ↓
Price Calculation: ETH * ETHPrice / TokenPrice = Token Amount
    ↓
Gas Estimation: Estimate transaction gas cost
    ↓
Validation:
  - Check wallet connected
  - Check correct network (Base)
  - Verify sufficient ETH balance (input + gas)
  - Verify slippage tolerance
    ↓
Execute Swap:
  1. Calculate minimum received amount (with slippage protection)
  2. Call swapExactETHForTokens() on Router
  3. Path: WETH → Token
  4. Wait for transaction confirmation
  5. Update UI with success/error
```

**Smart Contract Call:**

```javascript
router.swapExactETHForTokens(
  amountOutMin, // Min tokens to receive (with slippage)
  [WETH, token], // Trading path
  userAddress, // Token recipient
  deadline, // Transaction deadline (10 minutes)
);
```

---

### Token → ETH Swap (Requires Approval)

```
User Input: Token Amount
    ↓
Price Calculation: Token * TokenPrice / ETHPrice = ETH Amount
    ↓
Gas Estimation: Estimate transaction gas cost
    ↓
Validation:
  - Check wallet connected
  - Check correct network (Base)
  - Verify sufficient token balance
  - Verify sufficient ETH for gas
    ↓
Check Allowance:
  - Get current token allowance to Router
  - If insufficient:
    ├─ Request user approval
    ├─ Execute approve() transaction
    └─ Wait for confirmation
    ↓
Execute Swap:
  1. Calculate minimum ETH to receive (with slippage)
  2. Call swapExactTokensForETH() on Router
  3. Path: Token → WETH
  4. Wait for transaction confirmation
  5. Update UI with success/error
```

**Smart Contract Call (if approval needed):**

```javascript
// Approval step
token.approve(router, tokenAmount);

// Then execute swap
router.swapExactTokensForETH(
  amountIn, // Exact tokens to send
  amountOutMin, // Min ETH to receive (with slippage)
  [token, WETH], // Trading path
  userAddress, // ETH recipient
  deadline, // Transaction deadline (10 minutes)
);
```

---

## Core Functions

### 1. **handleSwap()**

Main transaction execution function.

**Features:**

- Comprehensive input validation
- Separate logic for ETH→Token and Token→ETH
- Transaction receipt waiting with 60-second timeout
- Detailed console logging for debugging
- Error categorization and user-friendly messages
- Automatic state reset on success

**Error Handling:**

```javascript
if (err?.message?.includes("rejected"))
  → "Transaction rejected by wallet"
if (err?.message?.includes("insufficient"))
  → "Insufficient balance or allowance"
if (err?.message?.includes("slippage"))
  → "Slippage exceeded - try increasing tolerance"
if (err?.message?.includes("timeout"))
  → "Transaction timeout - check your wallet"
```

---

### 2. **approveToken(amountToApprove)**

Handles ERC20 token approval to Router.

**Process:**

1. Call `token.approve(router, amount)` via wallet
2. Wait for transaction confirmation
3. Clear loading state and show confirmation message
4. Auto-hide message after 3 seconds

**Why Needed:**

- Uniswap Router needs permission to transfer your tokens
- Token→ETH swaps require prior approval
- Approval is a separate transaction from the swap

---

### 3. **Gas Estimation (useEffect)**

Automatically calculates expected gas fees.

**Logic:**

```
If ETH→Token:
  - Estimate swapExactETHForTokens gas
  - Use minimum received amount with slippage

If Token→ETH:
  - Estimate swapExactTokensForETH gas
  - Fallback to 300,000 gas if estimation fails

Calculate Total:
  gasEstimate × gasPrice = Total Gas Cost (in ETH)
```

**Debouncing:** 500ms debounce prevents excessive RPC calls

---

### 4. **Price Calculations**

**ETH → Token Formula:**

```
Token Amount = (ETH Amount × ETH Price USD) / Token Price USD
```

**Token → ETH Formula:**

```
ETH Amount = (Token Amount × Token Price USD) / ETH Price USD
```

**Minimum Received (with Slippage):**

```
Min Amount = Calculated Amount × (1 - Slippage / 100)
```

Example: If 1.5% slippage is set:

- Calculated: 100 tokens
- Min Received: 100 × (1 - 0.015) = 98.5 tokens

---

## State Management

| State             | Purpose                                 | Type    |
| ----------------- | --------------------------------------- | ------- |
| `ethAmount`       | ETH input amount                        | string  |
| `tokenAmount`     | Token input amount                      | string  |
| `reversed`        | Swap direction (ETH→Token or Token→ETH) | boolean |
| `slippage`        | Slippage tolerance percentage           | number  |
| `loading`         | Transaction in progress                 | boolean |
| `estimatedGas`    | Calculated gas fee in ETH               | string  |
| `errorMessage`    | User-facing error text                  | string  |
| `approvalMessage` | Approval/success message                | string  |
| `lastEditedField` | Track which input user edited           | string  |
| `tokenBalance`    | User's token balance                    | string  |

---

## Security Features

### 1. **Slippage Protection**

- Prevents sandwich attacks
- User-adjustable tolerance (0-50%)
- Default: 0.5%
- Enforced via `amountOutMin` parameter

### 2. **Deadline Protection**

```javascript
deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
```

- Prevents stale transaction execution
- Reverts if not included in block within 10 minutes

### 3. **Balance Validation**

```javascript
// ETH→Token: Check ETH + gas cost
totalEthNeeded = ethAmount + estimatedGas
if (totalEthNeeded > userBalance) → Prevent transaction

// Token→ETH: Check token balance
if (tokenAmount > tokenBalance) → Prevent transaction
```

### 4. **Network Validation**

- Checks user is on Base network (chainId: 8453)
- Prompts network switch if needed
- Prevents executing transactions on wrong chain

### 5. **Allowance Validation**

- Checks current token allowance before Token→ETH swap
- Requests approval only if needed
- Validates token address format (checksum)

---

## Transaction Flow Diagram

```
┌─────────────────────────────────────────┐
│   User Enters Amount & Clicks Swap      │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Validation Checks  │
        │  - Wallet Connected │
        │  - Correct Network  │
        │  - Valid Amounts    │
        │  - Sufficient Balance
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────────────┐
        │  Reversed Mode Check        │
        └──────────┬────────────────┬─┘
                   │                │
        ┌──────────▼────────┐    ┌──▼────────────────┐
        │  ETH → Token      │    │  Token → ETH      │
        │  (Direct)         │    │  (Needs Approval) │
        └──────────┬────────┘    └──┬───────────┬────┘
                   │                │           │
                   │         ┌──────▼────┐     │
                   │         │ Check    │     │
                   │         │ Allowance│     │
                   │         └──────┬────┘     │
                   │                │          │
                   │         ┌──────▼────┐     │
                   │         │Insufficient?    │
                   │         │  YES → Approve  │
                   │         │       Process   │
                   │         └──────┬────┘     │
                   │                │          │
        ┌──────────▼─────────────────▼──────────▼──┐
        │     Execute Swap Transaction             │
        │  - Build swap parameters                 │
        │  - Call Router smart contract            │
        │  - Wait for transaction hash             │
        └──────────┬──────────────────────────────┘
                   │
        ┌──────────▼──────────────┐
        │  Wait for Confirmation  │
        │  (60 second timeout)    │
        └──────────┬──────────────┘
                   │
        ┌──────────▼────────────────┐
        │  Check Receipt Status     │
        ├──────────┬────────────────┤
        │ SUCCESS  │    FAILURE     │
        └──────────┼────────────────┘
           ✓ Reset │ ✗ Show Error
             Inputs│   Message
```

---

## Console Logging

The implementation includes detailed console logging for debugging:

```javascript
// ETH → Token Example
console.log("🔄 Initiating ETH -> Token swap...");
console.log("📊 Swap Details:");
console.log(`  Input: 1 ETH (1000000000000000000)`);
console.log(`  Min Output: 2450 TOKEN (2450000000000000000000)`);
console.log(`  Path: WETH -> TOKEN`);
console.log(`  Slippage: 0.5%`);
console.log("✅ Transaction submitted: 0x123abc...");
console.log("🎉 Swap successful! Transaction confirmed.");
```

---

## Error Recovery

If a transaction fails:

1. **Wallet Rejection**: User rejected transaction → Show "Transaction rejected by wallet"
2. **Insufficient Funds**: Balance check before transaction → Prevent submission
3. **Slippage Exceeded**: Output less than min → Increase slippage tolerance
4. **Network Issue**: RPC timeout → Retry or check connection
5. **Gas Estimation Fails**: Use default (0.005 ETH) → May cause transaction failure

---

## Testing Checklist

- [ ] Connect wallet to Base network
- [ ] Fetch a token address (ensure it has liquidity)
- [ ] Enter ETH amount and verify token calculation
- [ ] Adjust slippage tolerance
- [ ] Execute ETH → Token swap
- [ ] Monitor transaction in console
- [ ] Verify tokens received in wallet
- [ ] Try Token → ETH swap (should prompt approval first)
- [ ] Test error cases (insufficient balance, etc.)

---

## Gas Optimization Tips

1. **Slippage Setting**: Lower slippage = higher chance of failure, try 0.5-1%
2. **Gas Price**: On Base, gas is typically <1 cent, but check current rates
3. **Approval Caching**: Approve once for large amount, multiple swaps won't need re-approval
4. **Time-of-Day**: Swap during low network congestion for cheaper gas

---

## Smart Contract Addresses (Base Network)

| Contract           | Address                                    |
| ------------------ | ------------------------------------------ |
| Uniswap V2 Router  | 0x4752ba5dbc23f44d87826276bf6d2a606c4e5001 |
| WETH (Wrapped ETH) | 0x4200000000000000000000000000000000000006 |

---

## Dependencies

```json
{
  "wagmi": "^2.19.4", // Wallet connection
  "viem": "^2.39.3", // Ethereum interactions
  "ethers": "^6.15.0", // Utility functions
  "axios": "^1.13.2" // Price API calls
}
```

---

## Future Enhancements

1. **Multi-hop Swaps**: Support direct token-to-token swaps
2. **Price Impact Display**: Show expected price movement
3. **Historical Prices**: Track swap history and prices
4. **Advanced Settings**: Custom gas limits, priority fees
5. **Swap Aggregation**: Compare prices across DEXes
6. **Transaction Notifications**: Toast alerts for events

---

## Troubleshooting

### Transaction Fails with "insufficient output amount"

→ Increase slippage tolerance (market volatility)

### No tokens received

→ Check Router has approval to transfer tokens
→ Verify token has liquidity in Uniswap pool

### Stuck "Processing Swap"

→ Check transaction on Base Scan
→ Refresh page and check wallet balance
→ May have succeeded but UI didn't update

### "Switch to Base Network"

→ Ensure wallet is set to Base mainnet (Chain ID 8453)
→ Not the Base Sepolia testnet

---

## References

- [Uniswap V2 Router](https://docs.uniswap.org/contracts/v2/reference/smart-contracts/router-02)
- [Wagmi Documentation](https://wagmi.sh/)
- [Viem Documentation](https://viem.sh/)
- [Base Network Info](https://www.base.org/)
