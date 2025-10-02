// src/routes/RequireAdmin.jsx
import { Navigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAdmin } from "../hooks/useAdmin";

export default function RequireAdmin({ children }) {
  const wallet = useWallet();
  const { loading, initialized, isAdmin } = useAdmin();

  if (!wallet.connected) {
    return <div className="mx-auto max-w-md rounded border bg-white p-4 text-sm">
      Please connect a wallet to access the admin area.
    </div>;
  }

  if (loading) {
    return <div className="mx-auto max-w-md rounded border bg-white p-4 text-sm">
      Checking admin permission…
    </div>;
  }

  if (initialized === false) {
    return <div className="mx-auto max-w-md rounded border bg-white p-4 text-sm">
      Admin registry is not initialized on Devnet.
    </div>;
  }

  if (!isAdmin) {
    return <Navigate to="/verify" replace />;
  }

  return children;
}
