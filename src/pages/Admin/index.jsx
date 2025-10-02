import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram, getProvider } from "../../lib/program";
import ManageAdmins from "./ManageAdmins";
import AdminAddCertificate from "./AdminAddCertificate";
import AdminDashboard from "./AdminDashboard";

const container = "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8";
const panel =
  "rounded-2xl border border-white/20 bg-white/60 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";

export default function AdminIndex() {
  const wallet = useWallet();
  const provider = useMemo(() => getProvider(wallet), [wallet]);
  const program = useMemo(() => getProgram(provider), [provider]);

  const [tab, setTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7V12h-7v9zM14 3h7v7h-7V3z" />
      </svg>
    )},
    { id: "add", label: "Add Certificate", icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14m7-7H5" strokeLinecap="round" />
      </svg>
    )},
    { id: "admins", label: "Manage Admins", icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4zM8 13c-2.761 0-5 2.91-5 6v2h10v-2c0-3.09-2.239-6-5-6z" />
      </svg>
    )},
  ];

  return (
    <div className={container}>
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-2xl font-extrabold sm:text-3xl ${headingGrad}`}>Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Manage certificates, admins, and system settings.
        </p>
      </div>

      {/* Wallet Not Connected */}
      {!wallet.publicKey ? (
        <div className={`${panel} text-center`}>
          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
            🔌 Connect an admin wallet to access the admin panel.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className={`${panel} mb-6`}>
            <nav className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={[
                      "group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                      active
                        ? "text-white"
                        : "text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white",
                    ].join(" ")}
                  >
                    {/* background pill */}
                    <span
                      className={[
                        "absolute inset-0 -z-10 rounded-xl transition",
                        active
                          ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 shadow-md shadow-indigo-600/30"
                          : "bg-white/40 ring-1 ring-inset ring-white/20 dark:bg-slate-900/40 dark:ring-white/10",
                      ].join(" ")}
                    />
                    {t.icon("h-4 w-4")}
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content – let inner components render their own matching panels */}
          <div className="space-y-6">
            {tab === "dashboard" && <AdminDashboard program={program} />}
            {tab === "add" && <AdminAddCertificate program={program} />}
            {tab === "admins" && <ManageAdmins program={program} />}
          </div>
        </>
      )}
    </div>
  );
}
