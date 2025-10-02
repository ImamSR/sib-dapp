// src/lib/rpc.js
import { web3 } from "@coral-xyz/anchor";

const HELIUS_DEVNET = "https://devnet.helius-rpc.com/?api-key=89fe1bc8-7c91-47f6-8d41-ec55c34c19be";
// Or use the unified endpoint:
// const HELIUS_DEVNET = "https://rpc.helius.xyz/?api-key=YOUR_KEY&cluster=devnet";

const withTimeout = (p, ms = 6000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("RPC timeout")), ms))]);

export const DEVNET_RPC_CANDIDATES = [
  HELIUS_DEVNET,                       // ✅ correct Helius devnet first
  "https://api.devnet.solana.com",     // fallback
  "https://rpc-devnet.aws.metaplex.com"
];

let _conn = null;
let _endpoint = null;

export async function chooseWorkingEndpoint(list = DEVNET_RPC_CANDIDATES) {
  for (const url of list) {
    try {
      const c = new web3.Connection(url, { commitment: "confirmed" });
      await withTimeout(c.getVersion(), 4000);
      console.info("[RPC] ✅ Using", url);
      return url;
    } catch (e) {
      console.warn("[RPC] ❌", url, e.message || e);
    }
  }
  throw new Error("No devnet RPC endpoint is responding");
}

export async function makeConnection(force = false) {
  if (_conn && !force) return _conn;
  _endpoint = await chooseWorkingEndpoint();
  _conn = new web3.Connection(_endpoint, { commitment: "confirmed" });
  if (typeof window !== "undefined") window.__RPC__ = { endpoint: _endpoint, connection: _conn };
  return _conn;
}

export function getCachedConnection() {
  return _conn;
}
