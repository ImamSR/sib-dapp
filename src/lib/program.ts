import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";
import idl from "../idl/sib.json";

export const PROGRAM_ID = new web3.PublicKey(
  "HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F"
);

// Safe getter for RPC endpoint in the browser
function getFrontendRpc(): string {
  try {
    // Vite environment (browser)
    // @ts-ignore - types come from "vite/client"
    const fromVite = import.meta?.env?.VITE_RPC_URL;
    if (fromVite) return fromVite;
  } catch {}
  return "https://api.devnet.solana.com"; // fallback
}

export const RPC_ENDPOINT = getFrontendRpc();
export const connection = new web3.Connection(RPC_ENDPOINT, "confirmed");

export function getProvider(wallet: any) {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function getReadOnlyProvider() {
  const dummy = {
    publicKey: new web3.PublicKey("11111111111111111111111111111111"),
    signAllTransactions: async (txs: any) => txs,
    signTransaction: async (tx: any) => tx,
  };
  return new AnchorProvider(connection, dummy as any, { commitment: "confirmed" });
}

export function getProgram(provider: AnchorProvider) {
  return new Program(idl as any,provider);
}

export function findAdminPda() {
  return web3.PublicKey.findProgramAddressSync([Buffer.from("admin")], PROGRAM_ID);
}
export function findCertPda(nomorIjazah: string) {
  return web3.PublicKey.findProgramAddressSync([Buffer.from("cert"), Buffer.from(nomorIjazah)], PROGRAM_ID);
}
