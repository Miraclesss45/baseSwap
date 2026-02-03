# 🧪 BaseSwap - Testing Scenarios & Examples

## Scenario 1: Simple ETH → Token Swap

**Setup:**

- Wallet: 5 ETH on Base network
- Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)

**Test Steps:**

```
1. Connect wallet to app
2. Paste USDC address
3. Click "Fetch Token" - wait for data to load
4. Enter 0.5 in ETH field
5. Observe: ~1,650 USDC calculated (example)
6. Observe: ~0.0008 ETH gas fee
7. Keep slippage at 0.5%
8. Click "Execute Swap"
9. Confirm transaction in wallet
10. Wait 20-30 seconds
11. ✅ Check wallet for USDC
```

**Expected Result:**

- Your ETH decreases by ~0.5008 (including gas)
- USDC balance increases by ~1,640+

**If Fails:**

- Check if USDC has liquidity in Uniswap pool
- Try smaller amount
- Check Base Scan with transaction hash

---

## Scenario 2: Token → ETH Swap (With Approval)

**Setup:**

- Wallet: 2000 USDC, 0.2 ETH on Base
- (Continue from Scenario 1)

**Test Steps:**

```
1. App still open from previous swap
2. Click "Swap direction arrow" button
3. Now shows "Swap TOKEN ↔ ETH"
4. Enter 1000 in top field (now TOKEN field)
5. Observe: ~0.6 ETH calculated
6. Observe: ~0.0008 ETH gas fee
7. Total ETH needed: ~0.61 (have 0.2 - INSUFFICIENT!)
```

**Expected Behavior:**

- ❌ Red warning: "Insufficient ETH Balance"
- Button shows "❌ Insufficient ETH"
- Cannot execute

**Fix:**

- Transfer 0.5 ETH to wallet from exchange
- Try again

**Test Steps (Continued):**

```
1. Now have 0.7 ETH in wallet
2. Click "Execute Swap"
3. 🔐 Approval window appears (first time only!)
4. Confirm approval in wallet
5. Wait 15-20 seconds
6. 🔄 Second confirm appears for actual swap
7. Confirm swap in wallet
8. Wait 20-30 seconds
9. ✅ Check wallet for ETH increase
```

**Expected Result:**

- First TX: Approval (token.approve)
- Second TX: Swap (router.swapExactTokensForETH)
- ETH balance increases by ~0.59 (0.6 minus gas)
- USDC balance decreases by 1000

---

## Scenario 3: Insufficient Balance Error

**Setup:**

- Wallet: 0.05 ETH on Base (very low)
- Token: Any token with liquidity

**Test Steps:**

```
1. Connect wallet
2. Paste token address
3. Enter 1 ETH
4. Observe: Button disabled with ❌ Insufficient ETH
5. Error shows: "Need: 1.0015 ETH | Have: 0.05 ETH"
```

**Expected Behavior:**

- Button prevented from clicking
- Clear error message shown
- No transaction sent

**This is a security feature!**

---

## Scenario 4: Wrong Network Error

**Setup:**

- Wallet connected to Ethereum network (NOT Base)

**Test Steps:**

```
1. Connect wallet to Ethereum mainnet
2. Go to app
3. Observe red banner: "You're on Ethereum"
4. Button shows "⚠️ Switch to Base"
5. Click banner button
6. Approve network switch in wallet
7. ✅ Banner disappears, now on Base
```

**Expected Behavior:**

- Clear network warning
- One-click network switch
- No accidental cross-chain transactions

---

## Scenario 5: Slippage Adjustment

**Setup:**

- Wallet: 2 ETH on Base
- Token: A volatile/low-liquidity token

**Test Steps:**

```
1. Enter 0.1 ETH → See 50,000 TOKEN calculated
2. Try to swap with 0.5% slippage
3. ❌ Fails: "Slippage exceeded"
```

**Solution:**

```
1. Go back and increase slippage to 2%
2. Min Received updates: 49,000 TOKEN (lower)
3. Try swap again
4. ✅ Should succeed
```

**What's Happening:**

- Low-liquidity tokens have high price impact
- Higher slippage protection helps volatile tokens
- But be careful: higher slippage = worse price!

---

## Scenario 6: Transaction Timeout (Network Congestion)

**Setup:**

- Wallet ready, all checks pass
- Network experiencing high load

**Test Steps:**

```
1. Execute swap
2. Transaction submitted ✅
3. Waiting for confirmation...
4. After 60 seconds: ⏱️ Timeout error
```

**What Happened:**

- Transaction sent to network ✅
- Block not mined within 60 seconds
- Might still succeed later!

**Next Steps:**

```
1. Check Base Scan with the transaction hash shown
2. If "Pending" - wait, it might confirm
3. If "Failed" - check why on Base Scan
4. If "Success" - check wallet, swap completed!
5. Try again with higher slippage if needed
```

---

## Scenario 7: Price Change (Slippage Protection Works)

**Setup:**

- Wallet: 1 ETH on Base
- High slippage setting: 10%

**Situation:**

```
You: Set slippage to 10%, click Execute
Market: While waiting for confirmation, USDC/ETH price drops 15%
Result: Your transaction reverts with "insufficient output amount"
```

**Why This is Good:**

- Your min amount was still protected
- You didn't lose ETH to bad price
- Revert happened before token transfer
- You pay gas but keep your ETH

**What To Do:**

- Accept the gas loss and try again
- Or wait for better prices
- Or accept lower slippage (get fewer tokens)

---

## Scenario 8: Double Swap (Token A → Token B)

**Current Setup:**

- App only supports ETH ↔ Token direct swaps
- To swap Token A → Token B:

**Workaround:**

```
1. Swap Token A → ETH ✅
2. Then Swap ETH → Token B ✅
```

**Better Solution (Future):**

```
// Would support direct Token A → Token B
// Via multi-hop: Token A → WETH → Token B
// Future enhancement!
```

---

## Scenario 9: Approving Spender (Understanding the Process)

**Setup:**

- First Token → ETH swap for a new token

**Behind the Scenes:**

```
1. App checks: Can Router spend my tokens?
2. Smart contract call: token.allowance(user, router)
3. Result: 0 (no allowance)
4. App automatically: Request approval
5. Approval TX: Grants Router permission to spend tokens
6. Router limit: 1000 tokens (the amount you're swapping)
7. After approval: Can execute the swap
```

**Why Separate?**

- ERC20 standard requires two-step process
- First approve, then transfer
- Safer than allowing unlimited access

**For Next Swap (Same Token):**

```
1. Execute Token → ETH again with same token
2. App checks allowance
3. Router already has permission
4. ✅ No approval needed, just execute swap!
```

---

## Scenario 10: Complete Trading Session

**Time: 2PM UTC**

**Setup:**

```
Wallet: 10 ETH, 0 USDC
Goal: Buy 5000 USDC, hold, then sell back to ETH
```

**Trade 1: ETH → USDC (2:15 PM)**

```
1. Enter 2 ETH
2. Calculated: 6,600 USDC (~$3,300)
3. Gas: 0.0008 ETH
4. Slippage: 0.5%
5. Execute ✅
6. Confirm 🔐
7. Status: Wait 20 seconds...
8. ✅ Success: 6,600 USDC received
9. New balance: ~7.999 ETH, 6,600 USDC
```

**Holding Period (2:15 PM - 3:45 PM)**

```
- Monitor market in wallet
- Price fluctuates
- USDC value goes up to $3,500
```

**Trade 2: USDC → ETH (3:50 PM)**

```
1. Reverse to Token → ETH mode
2. Enter 3000 USDC
3. Calculated: 1.9 ETH (~$3,300 at current price)
4. Gas: 0.0008 ETH
5. No approval needed (already approved!)
6. Execute ✅
7. Confirm 🔐
8. Status: Wait 20 seconds...
9. ✅ Success: 1.9 ETH received
10. New balance: ~9.899 ETH, 3,600 USDC
```

**Result:**

- Started: 10 ETH
- Ended: ~9.899 ETH + 3,600 USDC
- Profit: USDC up in value! 📈
- Cost: ~0.0016 ETH total gas (~$5.60)

---

## Scenario 11: Emergency! Wrong Token Address

**Test Steps:**

```
1. Paste random contract address
2. Click Fetch Token
3. ❌ Error: "Invalid Token Address"
4. App blocks you from proceeding
5. Prevents accidental scam/phishing
```

**Safety Feature:**

- App validates token format
- Prevents typos from creating losses
- You can only swap with valid ERC20 tokens

---

## Scenario 12: Multiple Attempts (Retry Logic)

**First Attempt:**

```
1. Execute swap
2. Network hiccup
3. Transaction reverts
4. ❌ Error shown
```

**Second Attempt (Right After):**

```
1. Same setup as before
2. Slippage prices may have changed
3. Click Execute again
4. ✅ Succeeds!
```

**Gas Cost:**

- Failed TX: You still paid gas (~$5)
- Successful TX: You paid gas again (~$5)
- Total: ~$10 for the swap

**Lesson:** Sometimes retries work, sometimes not. Check what failed first!

---

## Scenario 13: Very Small Amounts (Dust)

**Setup:**

```
Wallet: 0.001 ETH
Token: Any token

Action: Try to swap 0.0001 ETH
```

**What Happens:**

```
1. Gas estimation: ~0.0008 ETH
2. Total needed: 0.0001 + 0.0008 = 0.0009 ETH
3. You have: 0.001 ETH
4. ✅ Just barely enough!
5. Execute
6. You get some tokens (very few)
```

**Practical Issue:**

- Not worth the gas cost
- Better to accumulate more ETH first
- Swap only when you have $50+ to swap

---

## Scenario 14: Real-Time Price Monitoring

**Setup:**

```
Slippage: 1%
Watching prices update in real-time
```

**What You See:**

```
ETH Price: $3,500 ↓ $3,498 ↓ $3,495 ↑ $3,510 ↑ $3,520
Token Amount: 2333 ↑ 2335 ↑ 2338 ↓ 2320 ↓ 2310
Min Received: 2310 ↑ 2312 ↑ 2315 ↓ 2297 ↓ 2287
```

**Result:**

- Your min received updates automatically
- Always protected by slippage setting
- Fair execution at market time

---

## Key Takeaways for Testing

| Test Case      | What to Watch                 | Success Indicator                     |
| -------------- | ----------------------------- | ------------------------------------- |
| ETH→Token      | Gas cost, token received      | Tokens in wallet +15 sec              |
| Token→ETH      | Approval, ETH received        | ETH in wallet +15 sec                 |
| Low balance    | Error message, blocked button | Can't execute                         |
| Wrong network  | Network banner appears        | Clickable switch button               |
| High slippage  | Min amount shows lower        | Swap succeeds despite volatility      |
| Timeout        | Transaction hash shown        | Check Base Scan later                 |
| Volatile token | Higher slippage needed        | Swap succeeds with adjusted tolerance |

---

## Pro Tips

✅ **Always test with small amounts first**

```
0.01 ETH swap → $30-50 value
Much safer than 1 ETH ($3500+)
```

✅ **Monitor gas prices**

```
Low activity: 1-2 gwei/gas (cheapest)
High activity: 5-10 gwei/gas (slower)
Peak: 20+ gwei/gas (should wait)
```

✅ **Batch your swaps**

```
Instead of: 0.1 ETH 10 times = 10 gas fees
Do: 1 ETH once = 1 gas fee
Save 90% on gas!
```

✅ **Use Base network**

```
Base: $2-5 per swap
Ethereum: $50-500 per swap!
100x cheaper!
```

---

## Troubleshooting Checklist

- [ ] Wallet connected?
- [ ] On Base network? (chainId 8453)
- [ ] Valid token address pasted?
- [ ] Token has liquidity in Uniswap?
- [ ] Sufficient ETH balance (including gas)?
- [ ] Amount entered > 0?
- [ ] Slippage reasonable (0.5-5%)?
- [ ] Not on testnet (use mainnet)?
- [ ] Checked Base Scan with tx hash?

---

Happy Testing! 🎉
