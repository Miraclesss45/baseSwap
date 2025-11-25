import React from "react";
import { useAccount, useBalance } from "wagmi";
import { base } from "wagmi/chains";

export default function Balance() {
  const { address, isConnected } = useAccount();

  // Fetch BASE ETH balance
  const { data, isLoading } = useBalance({
    address,
    chainId: base.id, // 👈 FETCH BALANCE ON BASE NETWORK
  });

  if (!isConnected) {
    return <p className="text-white text-center font-semibold  text-sm">Connect wallet.</p>;
  }

  if (isLoading) {
    return <p className="text-white text-center font-semibold text-sm">Fetching Eth balance...</p>;
  }

  return <p className="text-white text-center font-semibold text-sm"> {data?.formatted} {data?.symbol}</p>;
}
