// src/components/WalletSessionGuard.jsx
import { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/** Change this if you use a different prefix for app keys */
const APP_PREFIX = "sib:";

/** Remove all app-specific cache; optionally remove per-wallet key first */
function clearAppCache(pubkey58) {
  try {
    if (pubkey58) localStorage.removeItem(`${APP_PREFIX}isAdmin:${pubkey58}`);
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(APP_PREFIX)) toDelete.push(k);
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export default function WalletSessionGuard() {
  const { connected, publicKey, wallet } = useWallet();
  const pubkey58 = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);
  const adapterName = wallet?.adapter?.name ?? "";

  // Track last known session
  const lastConnectedRef = useRef(false);
  const lastPubkeyRef = useRef("");
  const lastAdapterRef = useRef("");
  const reloadingRef = useRef(false); // prevent double reloads in fast transitions

  // Keep a tiny debounce so multiple events don't cause multiple reloads
  const reloadOnce = () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    // Small timeout to allow wallet adapter state to settle
    setTimeout(() => {
      window.location.reload();
    }, 0);
  };

  // Listen to explicit adapter disconnects (e.g., button in wallet UI)
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) return;

    const onDisconnect = () => {
      clearAppCache(lastPubkeyRef.current || pubkey58);
      reloadOnce();
    };
    const onConnect = () => {
      // If adapter reconnects to a different account, the state effect below will handle it
    };

    adapter.on("disconnect", onDisconnect);
    adapter.on("connect", onConnect);
    return () => {
      adapter.off("disconnect", onDisconnect);
      adapter.off("connect", onConnect);
    };
    // We intentionally don't depend on pubkey here to keep the same listeners
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  // Respond to state transitions: disconnects and wallet/account switches
  useEffect(() => {
    const wasConnected = lastConnectedRef.current;
    const prevPubkey = lastPubkeyRef.current;
    const prevAdapter = lastAdapterRef.current;

    // Case 1: went from connected -> disconnected
    if (wasConnected && !connected) {
      clearAppCache(prevPubkey);
      reloadOnce();
    }

    // Case 2: still connected, but public key changed (account switch)
    if (connected && wasConnected && prevPubkey && pubkey58 && prevPubkey !== pubkey58) {
      clearAppCache(prevPubkey);
      reloadOnce();
    }

    // Case 3: still connected, adapter changed (Solflare -> Phantom, etc.)
    if (connected && wasConnected && prevAdapter && adapterName && prevAdapter !== adapterName) {
      clearAppCache(prevPubkey || pubkey58);
      reloadOnce();
    }

    // Update refs
    lastConnectedRef.current = connected;
    lastPubkeyRef.current = pubkey58;
    lastAdapterRef.current = adapterName;
  }, [connected, pubkey58, adapterName]);

  return null;
}
