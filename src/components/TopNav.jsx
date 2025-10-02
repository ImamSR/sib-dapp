// src/components/TopNav.jsx
import { useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAdmin } from "../hooks/useAdmin";

const navLinkBase =
  "relative inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition";
const navIdle =
  "text-gray-700 hover:text-gray-900 hover:bg-gray-900/5 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/5";
const navActive =
  "text-white before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-gradient-to-r before:from-indigo-600 before:via-violet-600 before:to-cyan-500 before:shadow before:shadow-indigo-600/40";

export default function TopNav() {
  const { publicKey } = useWallet();
  const walletKey = publicKey?.toBase58() ?? "";
  const { loading, isAdmin } = useAdmin();

  // Persist admin per-wallet (sticky)
  const lsKey = useMemo(
    () => (walletKey ? `sib:isAdmin:${walletKey}` : ""),
    [walletKey]
  );

  useEffect(() => {
    if (lsKey && isAdmin) {
      try {
        localStorage.setItem(lsKey, "1");
      } catch {}
    }
  }, [lsKey, isAdmin]);

  // Read cached admin (for instant render without reloads)
  const cachedAdmin = useMemo(() => {
    if (!lsKey) return false;
    try {
      return localStorage.getItem(lsKey) === "1";
    } catch {
      return false;
    }
  }, [lsKey]);

  // Final visibility: show Admin if runtime says true OR cache says true.
  // (Loading won't hide it once we've ever confirmed admin for this wallet.)
  const showAdmin = isAdmin || cachedAdmin;

  return (
    <header className="sticky top-0 z-[70] border-b border-white/20 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <NavLink to="/" className="group flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-sm shadow-indigo-600/30">
            🎓
          </div>
          <div className="flex items-end gap-2">
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-lg font-extrabold text-transparent">
              CertChain
            </span>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 shadow-sm dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-300">
              Devnet
            </span>
            {loading && !showAdmin && (
              <span className="ml-2 rounded-full border border-gray-400/30 bg-gray-400/10 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                checking…
              </span>
            )}
          </div>
        </NavLink>

        {/* Nav & Wallet */}
        <nav className="flex items-center gap-2 sm:gap-3">
          <NavLink
            to="/verify"
            className={({ isActive }) =>
              `${navLinkBase} ${isActive ? navActive : navIdle}`
            }
          >
            <svg
              className="h-4 w-4 opacity-80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 7l-8 10-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verify
          </NavLink>

          {showAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${navLinkBase} ${isActive ? navActive : navIdle}`
              }
            >
              <svg
                className="h-4 w-4 opacity-80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 6v12m6-6H6" strokeLinecap="round" />
              </svg>
              Admin
            </NavLink>
          )}

          {/* Wallet */}
          <WalletMultiButton
            className="!ml-2 !rounded-lg !bg-gradient-to-r !from-indigo-600 !via-violet-600 !to-cyan-500 !px-3.5 !py-2 !text-sm !font-semibold !text-white hover:!brightness-110 focus:!ring-2 focus:!ring-cyan-400/60 focus:!ring-offset-2 focus:!ring-offset-white dark:focus:!ring-offset-slate-900"
            style={{ minWidth: "auto" }}
          />
        </nav>
      </div>

      {/* subtle gradient underline */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
    </header>
  );
}
