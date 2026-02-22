// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

// Wagmi v2 — correct imports (WagmiConfig was v1, now WagmiProvider)
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";

// React Query
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ConnectKit v2 — getDefaultConfig wires up connectors, WalletConnect, etc.
import { ConnectKitProvider, getDefaultConfig } from "connectkit";

// ---------------------------------------------------------------------------
// Wagmi / ConnectKit config
// ---------------------------------------------------------------------------
// Required env vars (add to your .env):
//   VITE_ALCHEMY_KEY     — Alchemy API key for Base RPC
//   VITE_WC_PROJECT_ID   — WalletConnect Cloud project ID (https://cloud.walletconnect.com)
// ---------------------------------------------------------------------------
const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http(
        `https://base-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_KEY}`
      ),
    },
    walletConnectProjectId: import.meta.env.VITE_WC_PROJECT_ID ?? "",
    appName: "baseSwap",
    appDescription: "Swap ERC-20 tokens on Base with real-time pricing",
    appUrl: typeof window !== "undefined" ? window.location.origin : "",
  })
);

// ---------------------------------------------------------------------------
// React Query client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent aggressive refetching on window focus – reduces RPC load
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ---------------------------------------------------------------------------
// Provider order for wagmi v2 + ConnectKit:
//   WagmiProvider > QueryClientProvider > ConnectKitProvider > App
// ---------------------------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider
            theme="midnight"
            options={{
              hideBalance: false,
              hideNoWalletCTA: false,
              walletConnectName: "WalletConnect",
            }}
          >
            <App />
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);