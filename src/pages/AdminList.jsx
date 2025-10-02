// src/pages/AdminList.jsx
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";
import idl from "../idl/sib.json";

const programID = new web3.PublicKey("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");
const connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");

function toDate(i64) {
  const n = typeof i64?.toNumber === "function" ? i64.toNumber() : Number(i64 || 0);
  return n ? new Date(n * 1000).toLocaleString() : "-";
}

export default function AdminList() {
  const wallet = useWallet();
  const provider = useMemo(() => new AnchorProvider(connection, wallet, {}), [wallet]);
  const program = useMemo(() => new Program(idl, provider), [provider]);

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    setBusy(true);
    setError("");
    try {
      // Fetch all Certificate accounts
      const all = await program.account.certificate.all();
      // Map for table
      const mapped = all.map(({ publicKey, account }) => ({
        pda: publicKey.toBase58(),
        nomor_ijazah: account.nomorIjazah,
        nama: account.nama,
        nim: account.nim,
        program_studi: account.programStudi,
        universitas: account.universitas,
        kode_batch: account.kodeBatch,
        operator_name: account.operatorName,
        operator_pubkey: account.operatorPubkey?.toBase58?.() || "",
        waktu_masuk: toDate(account.waktuMasuk),
        file_uri: account.fileUri || "",
      }));
      // newest first by waktu_masuk
      mapped.sort((a, b) => (a.waktu_masuk < b.waktu_masuk ? 1 : -1));
      setRows(mapped);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load certificates");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="rounded-xl bg-white p-6 shadow ring-1 ring-gray-200">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Certificates</h2>
        <button
          onClick={reload}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="px-3 py-2">Nomor Ijazah</th>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">NIM</th>
              <th className="px-3 py-2">Program Studi</th>
              <th className="px-3 py-2">Universitas</th>
              <th className="px-3 py-2">Waktu Masuk</th>
              <th className="px-3 py-2">Operator</th>
              <th className="px-3 py-2">PDA</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">QR</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.pda} className="align-top">
                <td className="px-3 py-2">{r.nomor_ijazah}</td>
                <td className="px-3 py-2">{r.nama}</td>
                <td className="px-3 py-2">{r.nim}</td>
                <td className="px-3 py-2">{r.program_studi}</td>
                <td className="px-3 py-2">{r.universitas}</td>
                <td className="px-3 py-2">{r.waktu_masuk}</td>
                <td className="px-3 py-2">
                  <div className="max-w-[200px] truncate" title={r.operator_pubkey}>
                    {r.operator_name} <span className="text-gray-500">({r.operator_pubkey.slice(0,4)}…{r.operator_pubkey.slice(-4)})</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://explorer.solana.com/address/${r.pda}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-indigo-700 underline decoration-dotted"
                    title="Open in Solana Explorer"
                  >
                    {r.pda.slice(0, 6)}…{r.pda.slice(-6)}
                  </a>
                </td>
                <td className="px-3 py-2">
                  {r.file_uri ? (
                    <a
                      href={r.file_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`/verify?pda=${encodeURIComponent(r.pda)}`}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    title="Open verify page with PDA"
                  >
                    Show QR
                  </a>
                </td>
              </tr>
            ))}
            {!rows.length && !busy && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  No certificates on-chain yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {busy && (
        <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          Loading…
        </div>
      )}
    </div>
  );
}