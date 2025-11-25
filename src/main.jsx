// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Wagmi & viem
import { WagmiConfig, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// React Query
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ConnectKit
import { ConnectKitProvider } from "connectkit";

// -------------------
// Wagmi config
// -------------------
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: [injected({ shimDisconnect: true })],
  chains: [base],
  transports: {
    [base.id]: http("https://mainnet.base.org"), // replace with your RPC if needed
  },
});

// -------------------
// React Query client
// -------------------
const queryClient = new QueryClient();

// -------------------
// Render App
// -------------------
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={wagmiConfig}>
        <ConnectKitProvider>
          <App />
        </ConnectKitProvider>
      </WagmiConfig>
    </QueryClientProvider>
  </React.StrictMode>
);
