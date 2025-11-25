// src/components/WalletConnect.jsx
import React from "react";
import { ConnectKitButton } from "connectkit";
import Balance from "./Balance";

export default function WalletConnect() {
  return (
    <div className="flex flex-col justify-around  w-32 gap-0.5">
      <div className="w-full">
        <ConnectKitButton />
      </div>
      <div className="">
        <Balance />
      </div>
    </div>
  );
}