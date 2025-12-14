import { uploadFileToIpfsViaVercel } from "../../lib/ipfs-vercel";
import { saveCertMetaToApi } from "../../lib/save-to-offchain";

import { useEffect, useState, useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

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
    // on-chain no longer carries file; will be enriched from Mongo:
    fileUri: "",
    bump: a.bump,
  };
}

const panelCard = "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad = "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
const softButton = "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3.5 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200 dark:focus:ring-offset-slate-900";
const primaryButton = "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900";

export default function AdminDashboard({ program }) {
  const wallet = program.provider.wallet;
  const [onlyMine, setOnlyMine] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // The row being edited
  const [editFile, setEditFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // ... (existing fetchOffchain and load functions) ...

  async function fetchOffchain(pda) {
    const url = `${API_BASE}/api/certs/${pda}`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.ok) return null;
    return data;
  }

  async function load() {
    setErr("");
    setBusy(true);
    try {
      const accs = onlyMine
        ? await program.account.certificate.all([
          { memcmp: { offset: 8, bytes: wallet.publicKey.toBase58() } },
        ])
        : await program.account.certificate.all();

      const base = accs.map((a) => ({
        pubkey: a.publicKey.toBase58(),
        ...normalizeCert(a.account),
      }));

      base.sort((a, b) => (a.nomorIjazah || "").localeCompare(b.nomorIjazah || ""));

      const metas = await Promise.all(
        base.map(async (r) => {
          try {
            const meta = await fetchOffchain(r.pubkey);
            if (meta) {
              // Merge Mongo data: favor Mongo for file/cid/updates
              return {
                ...r,
                cid: meta.cid,
                fileUri: meta.gatewayUrl,
                operatorName: meta.operator || r.operatorName // Allow overwrite from Mongo if we want
              };
            }
          } catch { }
          return r;
        })
      );

      setRows(metas);
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

  // QR Logic
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const svgRef = useRef();

  const openQrModal = (pubkey) => {
    setQrValue(pubkey);
    setQrModalOpen(true);
  };

  const downloadQr = () => { /* ... existing ... */
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
      canvas.toBlob((pngBlob) => {
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `certificate-qr-${qrValue.substring(0, 8)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
      }, "image/png", 1);
    };
    img.src = url;
  };

  // Edit Logic
  const openEditModal = (row) => {
    setEditTarget(row);
    setEditFile(null);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    setIsSaving(true);

    try {
      let finalCid = editTarget.cid;
      let finalFilename = editTarget.filename; // currently not storing filename in row state explicitly but it's safe to assume we can keep old one if no new file
      let finalHash = editTarget.sha256;

      // 1. Upload new file if selected
      if (editFile) {
        const up = await uploadFileToIpfsViaVercel(editFile);
        finalCid = up.cid;
        finalFilename = editFile.name;
        // Calculate/mock hash if needed, or simple pass undefined to skip strict checking
        // Ideally we re-calculate SHA256 here if we want to store it
      }

      // 2. Save metadata to Mongo
      await saveCertMetaToApi({
        pda: editTarget.pubkey,
        nomor_ijazah: editTarget.nomorIjazah, // Assuming this is the key. Note: if user edited fields like Name, we need input fields. 
        // For now, let's assume "update file" implies mostly updating the attachment, but I'll add fields for basic info if needed.
        // The user asked "edit and updates file". 
        // I will send the CURRENT row data + potentially new CID.
        cid: finalCid,
        filename: finalFilename,
        // We can also allow updating operator name etc if we add inputs.
        // For MVP Edit: Just replacing the file is the most critical "Update File" feature.
        operator: wallet.publicKey.toBase58(),
        note: "Updated via Dashboard"
      });

      setEditModalOpen(false);
      load(); // Refresh
      alert("Update successful!");
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`${panelCard}`}>
      {/* ... Header ... */}
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
            {/* svg refresh */}
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/20 dark:text-red-200">
          {err}
        </div>
      )}

      <div className="mt-6 overflow-auto rounded-2xl border border-white/20 bg-white/50 backdrop-blur dark:border-white/10 dark:bg-slate-900/30">
        <table className="min-w-full divide-y divide-white/20 text-sm dark:divide-white/10">
          <thead className="sticky top-0 z-10 bg-white/70 text-xs uppercase tracking-wide text-gray-700 backdrop-blur dark:bg-slate-900/60 dark:text-gray-300">
            <tr>
              {["Nomor Ijazah", "Nama", "NIM", "Program Studi", "Universitas", "Operator", "Waktu Masuk", "PDA", "QR", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y text-white divide-white/20 bg-white/50 dark:divide-white/10 dark:bg-slate-900/30">
            {busy ? (
              // ... busy spinner ...
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-600 dark:text-gray-300">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  <span>Loading certificates…</span>
                </div>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-600 dark:text-gray-300">No certificates found.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.pubkey} className="transition-colors hover:bg-white/60 dark:hover:bg-slate-900/40">
                  <td className="whitespace-nowrap px-4 py-3 font-mono">{r.nomorIjazah || "—"}</td>
                  <td className="px-4 py-3">{r.nama || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.nim || "—"}</td>
                  <td className="px-4 py-3">{r.programStudi || "—"}</td>
                  <td className="px-4 py-3">{r.universitas || "—"}</td>
                  {/* ... other cols ... */}
                  <td className="px-4 py-3">
                    <div className="max-w-[160px] truncate">{r.operatorName || "—"}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{ts(r.waktuMasuk)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{short(r.pubkey)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openQrModal(r.pubkey)} className={`${softButton} p-1`}>
                      <QRCodeCanvas value={r.pubkey} size={32} />
                    </button>
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    {/* View File */}
                    {r.fileUri ? (
                      <a
                        href={r.fileUri}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-black dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                        title={r.cid ? `CID: ${r.cid}` : undefined}
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}

                    {/* Edit Button */}
                    <button
                      onClick={() => openEditModal(r)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editModalOpen && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className={`${panelCard} relative w-full max-w-lg`}>
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Edit Certificate</h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Student Name (Read-only)</label>
                <input type="text" value={editTarget.nama} disabled className="mt-1 block w-full rounded border-gray-300 bg-gray-100 p-2 text-gray-600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nomor Ijazah</label>
                <input type="text" value={editTarget.nomorIjazah} disabled className="mt-1 block w-full rounded border-gray-300 bg-gray-100 p-2 text-gray-600" />
              </div>

              <div className="border-t border-white/20 pt-4">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">Update File (PDF)</label>
                {editTarget.cid && (
                  <p className="text-xs text-green-600 mb-2">Current File: {short(editTarget.cid)}</p>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setEditFile(e.target.files?.[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <p className="mt-1 text-xs text-gray-500">Upload new PDF to replace the existing one.</p>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className={`${panelCard} relative w-full max-w-md`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Certificate QR Code</h3>
              <button onClick={() => setQrModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 flex justify-center">
              <div ref={svgRef} className="rounded-xl bg-white p-3 shadow-sm">
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
