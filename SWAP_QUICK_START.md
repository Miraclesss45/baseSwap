# 🚀 BaseSwap - Developer Quick Reference

## What's Implemented

Your `Swap.jsx` component now has **production-grade swap logic** that:

✅ **Swaps ETH ↔ Tokens** on Base network  
✅ **Interacts directly with smart contracts** (Uniswap V2 Router)  
✅ **Handles wallet approvals** automatically for Token→ETH swaps  
✅ **Validates all transactions** before submission  
✅ **Estimates gas costs** accurately  
✅ **Protects against slippage** with user-adjustable tolerance  
✅ **Monitors transaction status** with 60-second timeout  
✅ **Provides detailed error messages** for debugging

---

## How to Use

### 1. **For ETH → Token Swap (Direct)**

```javascript
// User enters ETH amount → Token amount auto-calculated
// Click "Execute Swap"
// → No approval needed
// → Tokens received instantly (after block confirmation)
```

**Flow:**

- ETH is sent directly to Router
- Router swaps to tokens via Uniswap liquidity pool
- Tokens sent to user wallet

---

### 2. **For Token → ETH Swap (Requires Approval)**

```javascript
// User enters Token amount → ETH amount auto-calculated
// Click "Execute Swap"
// → Approval prompt appears (first time only)
// → User confirms approval
// → Swap executes
// → ETH received instantly
```

**Flow:**

1. Check if Router has permission to spend your tokens
2. If NO → Request approval (separate transaction)
3. Once approved → Execute swap transaction
4. User receives ETH

---

## Key Features

### 🔐 **Slippage Control**

```
Default: 0.5%
Range: 0-50%
Effect: Higher slippage = higher chance of swap success
        Lower slippage = protect against price movement
```

You can now **adjust slippage in the UI** before swapping.

---

### ⚡ **Gas Estimation**

```
Auto-calculates gas cost based on:
- Current gas price on Base network
- Swap complexity (ETH→Token or Token→ETH)
- Transaction parameters

Displayed in ETH (e.g., 0.001234 ETH)
```

---

### 🛡️ **Security Validations**

```
Before Each Swap:
✓ Wallet connected?
✓ On Base network?
✓ Valid amounts entered?
✓ Sufficient ETH balance (including gas)?
✓ Sufficient token balance (if Token→ETH)?
✓ Slippage tolerance reasonable?
```

---

### 📊 **Price Calculations**

**Real-time price sync** using provided prices:

- ETH Price: Fetched from CoinGecko
- Token Price: From your TokenInfo component

**Formula:**

```
Amount Out = (Amount In × Input Price) / Output Price
Min Received = Amount Out × (1 - Slippage/100)
```

---

## Code Flow - How It Works

### Step 1: User Input

```javascript
User enters: 1 ETH
System calculates: 1 * $3500 / $1.50 = 2333.33 tokens
```

### Step 2: Validation

```javascript
Check: Do you have 1 ETH + gas cost?
Check: Are you on Base network?
Check: Is the amount valid?
```

### Step 3: Build Transaction

```javascript
For ETH → Token:
  - Parse ETH amount to wei
  - Parse min tokens with slippage
  - Set 10-minute deadline
  - Prepare Router call

For Token → ETH:
  - Check approval
  - Request if needed
  - Parse token amount
  - Parse min ETH with slippage
  - Prepare Router call
```

### Step 4: Execute & Confirm

```javascript
1. Send transaction to wallet
2. User confirms in wallet UI
3. Transaction broadcast to network
4. Wait for block confirmation (up to 60 seconds)
5. Display success/error message
```

---

## Testing Your Swaps

### Test ETH → Token

```
1. Have 1-2 ETH in wallet on Base
2. Go to app, paste a token address
3. Enter 0.1 ETH
4. Verify token amount calculated
5. Click "Execute Swap"
6. Confirm in wallet
7. Wait ~15-30 seconds
8. Check wallet for tokens
```

### Test Token → ETH

```
1. First, do ETH → Token swap above
2. Reverse direction (click arrow)
3. Enter token amount
4. Verify ETH amount calculated
5. Click "Execute Swap"
6. If first time: confirm approval first
7. Then confirm swap
8. Wait ~15-30 seconds
9. Check wallet for ETH
```

---

## Error Messages & Solutions

| Error                            | Cause                       | Solution                             |
| -------------------------------- | --------------------------- | ------------------------------------ |
| "Connect wallet first"           | Wallet not connected        | Click wallet connect button          |
| "Please switch to Base network"  | Wrong network               | Click prompt to switch to Base       |
| "Insufficient ETH balance"       | Not enough ETH+gas          | Add more ETH to wallet               |
| "Insufficient TOKEN balance"     | Not enough tokens           | Reduce token amount or get more      |
| "Transaction rejected by wallet" | User rejected in wallet UI  | Try again, check wallet settings     |
| "Slippage exceeded"              | Price moved too much        | Increase slippage tolerance          |
| "Transaction timeout"            | Took >60 seconds to confirm | Try again, check network status      |
| "Approval failed"                | Approval transaction failed | Check ETH balance for gas, try again |

---

## Console Logging

Run your app with browser DevTools open (F12) to see detailed logs:

```javascript
// ETH → Token example:
🔄 Initiating ETH -> Token swap...
📊 Swap Details:
  Input: 1 ETH (1000000000000000000)
  Min Output: 2333 TOKEN (2333333333333333333333)
  Path: WETH -> TOKEN
  Slippage: 0.5%
✅ Transaction submitted: 0x123abc...
✓ Swap successful!
```

These logs help debug if something goes wrong!

---

## Smart Contract Calls Made

### ETH → Token Call

```javascript
router.swapExactETHForTokens(
  2333e18, // Min tokens (with slippage)
  [WETH, token], // Swap path
  userAddress, // Recipient
  1709581234 + 600, // 10-min deadline
);
{
  value: 1e18;
} // Sending 1 ETH
```

### Token → ETH Call

```javascript
// First (if needed):
token.approve(router, 1000e18);

// Then:
router.swapExactTokensForETH(
  1000e18, // Exact tokens to send
  2.3e18, // Min ETH (with slippage)
  [token, WETH], // Swap path
  userAddress, // Recipient
  1709581234 + 600, // 10-min deadline
);
```

---

## Performance Tips

### ⚡ Gas Optimization

- **Slippage 0.5-1%**: Optimal for stable pools
- **Slippage 2-5%**: For volatile tokens
- **Slippage >5%**: May indicate liquidity issues
- Base network: ~100x cheaper than Ethereum!

### 💨 Speed Optimization

- Swaps confirm in **15-30 seconds** typically
- If taking >45 seconds: Network congestion
- If >60 seconds: Transaction may have failed

### 💰 Cost Examples (Rough Estimates)

```
ETH → Token swap gas: ~0.0008 ETH (~$2.80)
Token → ETH (first time, with approval): ~0.002 ETH (~$7)
Token → ETH (approved already): ~0.0008 ETH (~$2.80)
```

---

## Advanced: Customizing Swap Logic

### Change Default Slippage

```javascript
const [slippage, setSlippage] = useState(0.5); // ← Change from 0.5 to desired %
```

### Change Gas Estimate Default

```javascript
const DEFAULT_GAS_ESTIMATE = "0.005"; // ← Adjust if Base gas changes
```

### Change Transaction Deadline

```javascript
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // ← Change 600 to seconds
// 600 = 10 minutes, 1800 = 30 minutes, etc.
```

### Change Router Address (For Different DEX)

```javascript
// Only if you want to use a different DEX!
const ROUTER_ADDRESS = getAddress("0x[NEW_ADDRESS]");
```

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│      React Component (Swap.jsx)        │
├─────────────────────────────────────────┤
│  ✓ Price Calculations                   │
│  ✓ Form State Management                │
│  ✓ Validation Logic                     │
│  ✓ Error Handling                       │
└──────────┬────────────────┬─────────────┘
           │                │
    ┌──────▼────┐     ┌─────▼──────┐
    │   wagmi   │     │   viem     │
    │ (Wallet)  │     │ (Blockchain
    └──────┬────┘     └─────┬──────┘
           │                │
    ┌──────▼──────────────────▼──────┐
    │   Base Network (RPC Provider)  │
    ├───────────────────────────────┤
    │  ✓ Read balances              │
    │  ✓ Estimate gas               │
    │  ✓ Send transactions          │
    │  ✓ Confirm receipts           │
    └──────┬───────────────────┬────┘
           │                   │
    ┌──────▼──┐    ┌──────────▼──────┐
    │ Router  │    │  Token Contract │
    │(Uniswap)│    │   (ERC20)       │
    └─────────┘    └─────────────────┘
```

---

## What's Next?

To extend functionality, consider adding:

1. **Multi-hop Swaps**: Token A → Token B → Token C (single transaction)
2. **Price Impact Display**: Show slippage effect visually
3. **Transaction History**: Store and display past swaps
4. **Wallet Integration**: Save preferred slippage settings
5. **Alerts**: Toast notifications instead of error boxes
6. **DEX Comparison**: Show best prices across different DEXes

---

## Documentation Files

- 📄 **[SWAP_LOGIC_DOCUMENTATION.md](./SWAP_LOGIC_DOCUMENTATION.md)** - Complete technical documentation
- 📝 **[This file]** - Quick reference guide
- 🔗 **[Swap.jsx](./src/components/Swap.jsx)** - Source code with inline comments

---

## Support & Debugging

If something goes wrong:

1. **Check console** (F12) for detailed logs
2. **Verify wallet** is connected and on Base network
3. **Check balance** has enough ETH for swap + gas
4. **Increase slippage** if transaction fails
5. **Check Base Scan** with transaction hash
6. **Review error message** in the UI

---

**Happy Swapping!** 🎉

Your swap infrastructure is now ready for real transactions. Test thoroughly with small amounts first!
