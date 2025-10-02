import { useEffect, useState, useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

const short = (s, head = 4, tail = 4) =>
  s ? `${String(s).slice(0, head)}…${String(s).slice(-tail)}` : "";

const ts = (unix) => {
  if (!unix) return "—";
  const d = new Date(Number(unix) * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

function normalizeCert(a) {
  return {
    management: a.management?.toBase58?.() || a.management,
    operatorPubkey:
      a.operatorPubkey?.toBase58?.() ||
      a.operator_pubkey?.toBase58?.() ||
      a.operator_pubkey ||
      a.operatorPubkey,
    operatorName: a.operatorName || a.operator_name,
    programStudi: a.programStudi || a.program_studi,
    universitas: a.universitas,
    kodeBatch: a.kodeBatch || a.kode_batch,
    waktuMasuk: Number(a.waktuMasuk ?? a.waktu_masuk ?? 0),
    nim: a.nim,
    nama: a.nama,
    nomorIjazah: a.nomorIjazah || a.nomor_ijazah,
    fileUri: a.fileUri || a.file_uri,
    fileHash: a.fileHash || a.file_hash,
    bump: a.bump,
  };
}

const panelCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
const softButton =
  "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3.5 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200 dark:focus:ring-offset-slate-900";
const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900";

export default function AdminDashboard({ program }) {
  const wallet = program.provider.wallet;
  const [onlyMine, setOnlyMine] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    setBusy(true);
    try {
      if (onlyMine) {
        const mine = await program.account.certificate.all([
          { memcmp: { offset: 8, bytes: wallet.publicKey.toBase58() } },
        ]);
        const mapped = mine.map((a) => ({
          pubkey: a.publicKey.toBase58(),
          ...normalizeCert(a.account),
        }));
        setRows(
          mapped.sort((a, b) => (a.nomorIjazah || "").localeCompare(b.nomorIjazah || ""))
        );
      } else {
        const all = await program.account.certificate.all();
        const mapped = all.map((a) => ({
          pubkey: a.publicKey.toBase58(),
          ...normalizeCert(a.account),
        }));
        setRows(
          mapped.sort((a, b) => (a.nomorIjazah || "").localeCompare(b.nomorIjazah || ""))
        );
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyMine, program]);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const svgRef = useRef();

  const openQrModal = (pubkey) => {
    setQrValue(pubkey);
    setQrModalOpen(true);
  };

  const downloadQr = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob(
        (pngBlob) => {
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = `certificate-qr-${qrValue.substring(0, 8)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
        },
        "image/png",
        1
      );
    };
    img.src = url;
  };

  return (
    <div className={`${panelCard}`}>
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className={`text-xl font-extrabold ${headingGrad}`}>Certificate Dashboard</h2>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="h-4 w-4 rounded border-white/30 text-indigo-600 focus:ring-cyan-400/60 dark:border-white/20"
            />
            Only My Entries
          </label>

          <button onClick={load} className={primaryButton}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="-ml-0.5 mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/20 dark:text-red-200">
          {err}
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-auto rounded-2xl border border-white/20 bg-white/50 backdrop-blur dark:border-white/10 dark:bg-slate-900/30">
        <table className="min-w-full divide-y divide-white/20 text-sm dark:divide-white/10">
          <thead className="sticky top-0 z-10 bg-white/70 text-xs uppercase tracking-wide text-gray-700 backdrop-blur dark:bg-slate-900/60 dark:text-gray-300">
            <tr>
              {[
                "Nomor Ijazah",
                "Nama",
                "NIM",
                "Program Studi",
                "Universitas",
                "Operator",
                "Waktu Masuk",
                "PDA",
                "QR",
                "File",
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20 bg-white/50 dark:divide-white/10 dark:bg-slate-900/30">
            {busy ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-gray-600 dark:text-gray-300">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <span>Loading certificates…</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-gray-600 dark:text-gray-300">
                  No certificates found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.pubkey} className="transition-colors hover:bg-white/60 dark:hover:bg-slate-900/40">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-900 dark:text-gray-100">
                    {r.nomorIjazah || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.nama || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-900 dark:text-gray-100">
                    {r.nim || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.programStudi || "—"}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{r.universitas || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[160px] truncate text-gray-900 dark:text-gray-100">
                      {r.operatorName || "—"}
                    </div>
                    <div className="mt-0.5 max-w-[160px] truncate font-mono text-xs text-gray-500" title={r.operatorPubkey}>
                      {short(r.operatorPubkey)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-900 dark:text-gray-100">
                    {ts(r.waktuMasuk)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://explorer.solana.com/address/${r.pubkey}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block max-w-[140px] truncate font-mono text-xs text-indigo-600 underline decoration-dotted underline-offset-2 hover:text-indigo-800 dark:text-indigo-400"
                      title={r.pubkey}
                    >
                      {short(r.pubkey)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openQrModal(r.pubkey)} className={`${softButton} p-1`}>
                      <QRCodeCanvas value={r.pubkey} size={64} includeMargin level="M" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {r.fileUri ? (
                      <a
                        href={r.fileUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-black dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* QR Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className={`${panelCard} relative w-full max-w-md`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Certificate QR Code</h3>
              <button
                onClick={() => setQrModalOpen(false)}
                className="text-gray-400 transition hover:text-gray-600 focus:outline-none dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 flex justify-center">
              <div ref={svgRef} className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
                <QRCodeSVG value={qrValue} size={256} level="M" includeMargin />
              </div>
            </div>

            <div className="flex justify-center">
              <button onClick={downloadQr} className={primaryButton}>
                <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Save QR Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
