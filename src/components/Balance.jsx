// src/components/Balance.jsx
import { useAccount, useBalance } from "wagmi";
import { base } from "wagmi/chains";

export default function Balance() {
  const { address, isConnected } = useAccount();

  const { data, isLoading, isError } = useBalance({
    address,
    chainId: base.id,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 30_000,
      staleTime: 15_000,
    },
  });

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
        <span className="font-mono text-[11px] text-slate-600 tracking-wider">
          Not connected
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        <div className="w-3 h-3 rounded-full border border-white/10 border-t-cyan-400 animate-spin shrink-0" />
        <span className="font-mono text-[11px] text-slate-600 tracking-wider">
          Loading…
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        <span className="font-mono text-[11px] text-red-400 tracking-wider">
          Balance unavailable
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-400/[0.04] border border-cyan-400/[0.12]">
      {/* Live indicator */}
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      <span className="font-mono text-[11px] text-slate-500 tracking-wider uppercase shrink-0">
        {data.symbol}
      </span>
      <span className="font-mono text-xs font-semibold text-cyan-400 tabular-nums">
        {Number(data.formatted).toFixed(5)}
      </span>
    </div>
  );
}