// src/components/TokenInfo.jsx
import React from "react";

export default function TokenInfo({ tokenData }) {
  if (!tokenData) return null;

  return (
    <div className="p-4 border rounded-2xl shadow mb-4 bg-gray-600 font-bold">
      <h2 className="text-m md:text-xl font-bold mb-2 text-amber-50 border-b-2 border-gray-600">
        {tokenData.name} ({tokenData.symbol})
      </h2>
      <h3 className="mb-1 text-white">
          <span className="text-gray-400">Price:</span> ${tokenData.priceUsd != null ? tokenData.priceUsd : "0"}
      </h3>
      <h3 className="mb-1 text-white">
       <span className="text-gray-400">Liquidity: </span> ${tokenData.liquidityUsd != null ? tokenData.liquidityUsd : "0"}
      </h3>
    </div>
  );
}
