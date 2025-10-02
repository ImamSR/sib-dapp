import { useEffect, useMemo, useState } from "react";
import { web3 } from "@coral-xyz/anchor";
import { connection, findAdminPda } from "../../lib/program";

const panelCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
const softButton =
  "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200 dark:focus:ring-offset-slate-900";
const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900";

export default function ManageAdmins({ program }) {
  // ✅ correct: memoize and take [0]
  const adminPda = useMemo(() => findAdminPda()[0], []);
  const [reg, setReg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newAdmin, setNewAdmin] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      if (!program) {
        // program not ready yet (wallet not connected?)
        setReg(null);
        return;
      }

      // ✅ use the imported connection (lowercase)
      const info = await connection.getAccountInfo(adminPda);
      if (!info) {
        setReg(null); // not initialized
      } else {
        // Anchor fetch
        const data = await program.account.adminRegistry.fetch(adminPda);
        const admins = (data.admins || []).map((k) =>
          k?.toBase58?.() ? k.toBase58() : String(k)
        );
        setReg({
          superAdmin: data.superAdmin.toBase58(),
          admins,
          bump: data.bump,
        });
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  async function initRegistry() {
    setBusy(true);
    setError("");
    try {
      if (!program) throw new Error("Program not ready");
      const me = program.provider.wallet.publicKey;
      await program.methods
        .initAdminRegistry(me)
        .accounts({
          adminRegistry: adminPda,
          payer: me,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addAdmin() {
    setBusy(true);
    setError("");
    try {
      if (!program) throw new Error("Program not ready");
      const pk = new web3.PublicKey(newAdmin.trim());
      await program.methods
        .addAdmin(pk)
        .accounts({
          adminRegistry: adminPda,
          superAdmin: program.provider.wallet.publicKey, // must be super_admin signer
        })
        .rpc();
      setNewAdmin("");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeAdmin(pkStr) {
    setBusy(true);
    setError("");
    try {
      if (!program) throw new Error("Program not ready");
      const pk = new web3.PublicKey(pkStr);
      await program.methods
        .removeAdmin(pk)
        .accounts({
          adminRegistry: adminPda,
          superAdmin: program.provider.wallet.publicKey, // must be super_admin signer
        })
        .rpc();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const me = program?.provider?.wallet?.publicKey?.toBase58() || "";

  return (
    <div className={panelCard}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-lg font-extrabold ${headingGrad}`}>Admin Registry</h2>
          <p className="mt-1 break-all text-sm text-gray-600 dark:text-gray-300">
            PDA: <span className="font-mono">{adminPda.toBase58()}</span>
          </p>
          {me && (
            <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
              Your wallet: <span className="font-mono">{me}</span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/20 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">Loading…</div>
      ) : !reg ? (
        <div className="mt-5">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AdminRegistry is not initialized yet.
          </p>
          <button onClick={initRegistry} disabled={busy || !program} className={`${primaryButton} mt-3`}>
            Initialize (set me as Super Admin)
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-white/20 bg-white/50 p-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/30">
            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Super Admin</div>
            <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{reg.superAdmin}</div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/50 p-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/30">
            <div className="mb-2 text-xs uppercase text-gray-500 dark:text-gray-400">Admins</div>
            {(reg.admins?.length || 0) === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">No admins</div>
            )}
            <ul className="space-y-2">
              {reg.admins?.map((a) => (
                <li key={a} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{a}</span>
                  <button onClick={() => removeAdmin(a)} disabled={busy} className={softButton}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex gap-2">
              <input
                placeholder="New admin pubkey"
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-sm text-gray-900 shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-cyan-400/60 dark:border-white/10 dark:bg-slate-900/50 dark:text-white"
              />
              <button onClick={addAdmin} disabled={busy || !newAdmin || !program} className={primaryButton}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
