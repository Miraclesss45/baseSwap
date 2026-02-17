// src/components/WalletConnect.jsx
import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";

export default function WalletConnect({ setMessage }) {
  const { address } = useAccount();

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => {
        // ── Connected ──────────────────────────────────────────────────
        if (isConnected) {
          return (
            <button
              onClick={show}
              className="group flex items-center gap-2 h-9 pl-2 pr-3.5 rounded-xl
                         bg-cyan-500/[0.06] border border-cyan-400/[0.18]
                         hover:bg-cyan-500/10 hover:border-cyan-400/30
                         transition-all duration-200 active:scale-[0.97] select-none"
            >
              {/* Avatar circle */}
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 shrink-0 flex items-center justify-center">
                <span className="font-mono text-[9px] font-bold text-white">
                  {address ? address.slice(2, 4).toUpperCase() : "??"}
                </span>
              </div>

              {/* Address */}
              <span className="font-mono text-[11px] font-semibold text-cyan-300 tabular-nums tracking-wide">
                {ensName ?? truncatedAddress ?? short}
              </span>

              {/* Caret */}
              <svg
                className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors duration-200 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          );
        }

        // ── Connecting ─────────────────────────────────────────────────
        if (isConnecting) {
          return (
            <button
              disabled
              className="flex items-center gap-2 h-9 px-4 rounded-xl
                         bg-white/[0.03] border border-white/[0.06]
                         font-mono text-[11px] font-semibold text-slate-500
                         tracking-widest uppercase cursor-not-allowed select-none"
            >
              <div className="w-3.5 h-3.5 rounded-full border border-white/10 border-t-slate-400 animate-spin shrink-0" />
              <span>Connecting…</span>
            </button>
          );
        }

        // ── Disconnected ───────────────────────────────────────────────
        return (
          <button
            onClick={show}
            className="relative flex items-center gap-2 h-9 px-4 rounded-xl
                       bg-gradient-to-br from-cyan-600 to-blue-600
                       hover:from-cyan-500 hover:to-blue-500
                       hover:-translate-y-px
                       font-mono text-[11px] font-bold text-white
                       tracking-widest uppercase
                       shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40
                       transition-all duration-200 active:scale-[0.97] select-none overflow-hidden"
          >
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />

            <svg
              className="relative w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span className="relative">Connect</span>
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}
