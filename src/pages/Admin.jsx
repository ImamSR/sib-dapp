import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProvider, getProgram } from "../lib/program";
import { useAdmin } from "../hooks/useAdmin";

import AdminAddCertificate from "./Admin/AdminAddCertificate.jsx";
import AdminDashboard from "./Admin/AdminDashboard.jsx";
import ManageAdmins from "./Admin/ManageAdmins.jsx";

const wrapper = "space-y-4";
const headerCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const contentCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
const tabButtonBase =
  "group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition";
const tabActive =
  "text-white";
const tabIdle =
  "text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white";

function TabButton({ id, active, onClick, children, icon }) {
  return (
    <button onClick={() => onClick(id)} className={`${tabButtonBase} ${active ? tabActive : tabIdle}`}>
      <span
        className={[
          "absolute inset-0 -z-10 rounded-xl transition",
          active
            ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 shadow-md shadow-indigo-600/30"
            : "bg-white/40 ring-1 ring-inset ring-white/20 dark:bg-slate-900/40 dark:ring-white/10",
        ].join(" ")}
      />
      {icon ? icon("h-4 w-4") : null}
      {children}
    </button>
  );
}

export default function AdminIndex() {
  const wallet = useWallet();
  const { loading, initialized, isAdmin, superAdmin, admins, reload, error } = useAdmin();

  const program = useMemo(() => {
    if (!wallet?.connected) return null;
    const provider = getProvider(wallet);
    return getProgram(provider);
  }, [wallet]);

  const [tab, setTab] = useState("add"); // 'add' | 'list' | 'admins'

  return (
    <div className={wrapper}>
      {/* Header */}
      <div className={` items-center justify-between  ${headerCard}`} >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-2xl font-extrabold ${headingGrad}`}>Admin Dashboard</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Manage certificates and admin wallets on <span className="font-semibold">Devnet</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/60 px-3 py-1.5 text-xs text-gray-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200">
            <span className="text-gray-600 dark:text-gray-300">Super Admin:</span>
            <span className="font-mono">{superAdmin ? short(superAdmin) : "—"}</span>
          </div>
        </div>

        {/* Status / errors */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {loading && (
            <span className="rounded-xl border border-white/20 bg-white/60 px-2 py-1 text-gray-700 backdrop-blur dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200">
              Checking permissions…
            </span>
          )}
          {initialized === false && (
            <span className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-2 py-1 text-yellow-800 dark:text-yellow-200">
              Admin registry is not initialized.
            </span>
          )}
          {error && (
            <span className="rounded-xl border border-red-400/30 bg-red-500/10 px-2 py-1 text-red-800 dark:border-red-400/20 dark:text-red-200">
              {error}
            </span>
          )}
          {!loading && initialized && isAdmin && (
            <span className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-800 dark:text-emerald-200">
              You are an admin.
            </span>
          )}
          <button
            onClick={reload}
            className="ml-auto inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-2 py-1 text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
          >
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          <TabButton
            id="add"
            active={tab === "add"}
            onClick={setTab}
            icon={(cls) => (
              <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14m7-7H5" strokeLinecap="round" />
              </svg>
            )}
          >
            Add Certificate
          </TabButton>
          <TabButton
            id="list"
            active={tab === "list"}
            onClick={setTab}
            icon={(cls) => (
              <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7V12h-7v9zM14 3h7v7h-7V3z" />
              </svg>
            )}
          >
            Certificates
          </TabButton>
          {/* <TabButton
            id="admins"
            active={tab === "admins"}
            onClick={setTab}
            icon={(cls) => (
              <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4zM8 13c-2.761 0-5 2.91-5 6v2h10v-2c0-3.09-2.239-6-5-6z" />
              </svg>
            )}
          >
            Manage Admins
          </TabButton> */}
        </div>
      </div>

      {/* Content */}
      <div className={contentCard}>
        {!wallet?.connected && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Please connect a wallet to use the admin features.
          </div>
        )}

        {wallet?.connected && !program && (
          <div className="text-sm text-gray-700 dark:text-gray-300">Preparing program…</div>
        )}

        {wallet?.connected && program && (
          <>
            {tab === "add" && <AdminAddCertificate program={program} />}
            {tab === "list" && <AdminDashboard program={program} />}
            {tab === "admins" && <ManageAdmins program={program} />}
          </>
        )}
      </div>

      {/* Small summary of current admins */}
      {initialized && admins?.length > 0 && (
        <div className={contentCard}>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Current Admins</div>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2 md:grid-cols-3">
            {admins.map((a) => (
              <li key={a} className="font-mono text-gray-900 dark:text-gray-100">
                {short(a)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function short(k) {
  return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "";
}
