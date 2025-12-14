// src/App.jsx
import "@solana/wallet-adapter-react-ui/styles.css";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Routes, Route, Navigate } from "react-router-dom";
import { getRpcEndpoint } from "./lib/rpc.js";
import { getWallets } from "@wallet-standard/app";
import './polyfills'

import TopNav from "./components/TopNav.jsx";
import VerifyCertificate from "./components/VerifyCertificate.jsx";
import AdminIndex from "./pages/Admin";
import RequireAdmin from "./routes/RequireAdmin";
import WalletSessionGuard from "./components/WalletSessionGuard.jsx";

// ✅ RPC from Vite env
const RPC = import.meta.env.VITE_RPC_URL;

export default function App() {
  // Build wallets array:
  // - If Phantom is already registered via Wallet Standard, pass []
  // - Else, provide the legacy Phantom adapter as a fallback
  const wallets = useMemo(() => {
    try {
      const std = getWallets().get(); // array of Wallet Standard wallets
      const hasStandardPhantom = std.some(
        (w) => (w.name || "").toLowerCase().includes("phantom")
      );
      return hasStandardPhantom ? [] : [new PhantomWalletAdapter()];
    } catch {
      // If Wallet Standard API isn't available for some reason, fallback to legacy adapter.
      return [new PhantomWalletAdapter()];
    }
  }, []);

  if (!RPC) {
    // Optional: warn once in dev if env not set
    // Optional: warn once in dev if env not set
    console.warn(
      "VITE_RPC_URL is not set. Define it in your .env (e.g., VITE_RPC_URL=https://api.devnet.solana.com)"
    );
  }

  return (
    <div style={{ backgroundColor: "darkslateblue", minHeight: "100vh" }}>
      <ConnectionProvider endpoint={getRpcEndpoint()} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <TopNav />
            <WalletSessionGuard />
            <Routes>
              <Route path="/" element={<Navigate to="/verify" replace />} />
              <Route path="/verify" element={<VerifyCertificate />} />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminIndex />
                  </RequireAdmin>
                }
              />
              {/* <Route path="/admin/list" element={<AdminList />} /> */}
            </Routes>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </div>
  );
}
