// src/pages/AdminAddCertificate.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import "@solana/wallet-adapter-react-ui/styles.css";

import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import idl from "../../idl/sib.json";
import { QRCodeCanvas } from "qrcode.react";
import * as XLSX from "xlsx";

import { useAdmin } from "../../hooks/useAdmin";
import { uploadFileToIpfsViaApi, toGatewayUrl } from "../../lib/ipfs";

import { Buffer } from "buffer";

const RPC = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
const connection = new web3.Connection(RPC, "confirmed");

// use the address embedded in your IDL
const PROGRAM_ID = new web3.PublicKey(idl.address);

const shorten = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "");
const isImage = (type) => /^image\//.test(type || "");

const panelCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";

export default function AdminAddCertificate() {
  const wallet = useWallet();

  // Provider/Program (memoized)
  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  }, [wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    // new Program(idl, provider) is okay, but ensure the Program has PROGRAM_ID implicitly
    // using explicit PROGRAM_ID is also fine:
    return new Program(idl, provider);
  }, [provider]);

  const { adminPda, isAdmin, initialized } = useAdmin();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    nama: "",
    nim: "",
    program_studi: "",
    universitas: "",
    kode_batch: "",
    nomor_ijazah: "",
    operator_name: "",
  });

  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");
  const [fileHashHex, setFileHashHex] = useState("");

  const [pda, setPda] = useState(null);
  const [fileUriSaved, setFileUriSaved] = useState("");     // ipfs://CID
  const [fileUrlGateway, setFileUrlGateway] = useState(""); // https://gateway/.../CID

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);

  const [nowPreview, setNowPreview] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowPreview(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // PDA preview — FIX: use PROGRAM_ID
  const pdaPreview = useMemo(() => {
    try {
      if (!form.nomor_ijazah) return "";
      const [certPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("cert"), Buffer.from(String(form.nomor_ijazah), "utf8")],
        PROGRAM_ID
      );
      return certPda.toBase58();
    } catch {
      return "";
    }
  }, [form.nomor_ijazah]);

  const pdaStr = useMemo(
    () => (typeof pda === "string" ? pda : pda?.toBase58?.() || ""),
    [pda]
  );

  // hash helper (hex)
  async function sha256FileHex(f) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // hash helper (bytes)
  async function sha256FileBytes(f) {
    const buf = await f.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return new Uint8Array(hash);
  }

  async function onPickFile(f) {
    if (!f) {
      setFile(null);
      setFilePreview("");
      setFileHashHex("");
      return;
    }
    setFile(f);

    if (isImage(f.type)) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result?.toString() || "");
      reader.readAsDataURL(f);
    } else {
      setFilePreview("");
    }

    try {
      const hex = await sha256FileHex(f);
      setFileHashHex(hex);
    } catch {
      setFileHashHex("");
    }
  }
  const onFileInput = (e) => onPickFile(e.target.files?.[0]);
  const onDrop = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) await onPickFile(f);
  };
  const onDragOver = (e) => e.preventDefault();

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // ---- VALIDATION
  const validateStep0 = () => {
    const req = [
      ["nama", "Nama"],
      ["nim", "NIM"],
      ["program_studi", "Program Studi"],
      ["universitas", "Universitas"],
      ["kode_batch", "Kode Batch"],
      ["nomor_ijazah", "Nomor Ijazah"],
      ["operator_name", "Nama Operator"],
    ];
    for (const [key, label] of req) {
      if (!String(form[key] ?? "").trim()) {
        return `Field "${label}" is required.`;
      }
    }
    return "";
  };
  const canNextFromStep0 = validateStep0() === "";

  const goNext = () => {
    if (step === 0) {
      const err = validateStep0();
      if (err) {
        setError(err);
        return;
      }
    }
    setError("");
    setStep((s) => Math.min(2, s + 1));
  };
  const goBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  // ---- SUBMIT (IPFS + on-chain)
  async function handleSubmit() {
    setError("");
    setSuccessMsg("");
    setIsSubmitting(true);
    try {
      if (!program) throw new Error("Program not ready");
      if (!wallet?.publicKey) throw new Error("Connect a wallet");
      if (initialized === false) throw new Error("Admin registry not initialized");
      if (!isAdmin) throw new Error("Not authorized (wallet is not admin)");
      if (!adminPda) throw new Error("Admin PDA not available");

      // prepare file hash bytes (zeros if no file)
      let fileHashBytes = new Uint8Array(32); // default zeros
      let ipfsUri = "";
      let gatewayUrl = "";

      if (file && file.size) {
        fileHashBytes = await sha256FileBytes(file);

        // Upload to IPFS (Pinata) via API route
        const up = await uploadFileToIpfsViaApi(file);
        ipfsUri = up.ipfsUri;        // ipfs://CID (to store on-chain)
        gatewayUrl = up.gatewayUrl;  // https link for UI
      }

      // derive cert PDA
      const [certPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("cert"), Buffer.from(String(form.nomor_ijazah), "utf8")],
        PROGRAM_ID
      );

      // call program
      await program.methods
        .addCertificate(
          form.program_studi,
          form.universitas,
          form.kode_batch,
          form.nim,
          form.nama,
          String(form.nomor_ijazah),
          form.operator_name,
          ipfsUri,                    // <- store ipfs://CID
          Array.from(fileHashBytes)   // <- 32 bytes
        )
        .accounts({
          certificate: certPda,
          adminRegistry: adminPda,
          operator: wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      setPda(certPda);
      setFileUriSaved(ipfsUri);
      setFileUrlGateway(gatewayUrl || toGatewayUrl(ipfsUri));
      setSuccessMsg("Certificate saved to Solana 🎉");
      setStep(2);
    } catch (e2) {
      setError(e2.message || "Failed to save the certificate.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const copyPda = async () => {
    if (!pdaStr) return;
    await navigator.clipboard.writeText(pdaStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `certificate-${(pdaStr || "unknown").slice(0, 8)}.png`;
    link.click();
  };

  const resetAll = () => {
    setForm({
      nama: "",
      nim: "",
      program_studi: "",
      universitas: "",
      kode_batch: "",
      nomor_ijazah: "",
      operator_name: "",
    });
    setFile(null);
    setFilePreview("");
    setFileHashHex("");
    setPda(null);
    setFileUriSaved("");
    setFileUrlGateway("");
    setError("");
    setSuccessMsg("");
    setStep(0);
  };

  // Excel helpers
  const [excelRows, setExcelRows] = useState([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const handleExcelImport = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          alert("File must contain at least one header row and one data row.");
          return;
        }

        const headers = jsonData[0].map((h) => h?.toString().trim() || "");
        const rows = jsonData.slice(1).map((row) => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? row[i] : "";
          });
          return obj;
        });

        setExcelRows(rows);
        setSelectedRowIndex(-1);
        setTimeout(() => {
          document.getElementById("excel-preview")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } catch (err) {
        console.error(err);
        alert("❌ Failed to parse Excel file. Please check format.");
      }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = null; // allow re-upload
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-extrabold tracking-tight ${headingGrad}`}>
            Add Academic Certificate
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Store a student certificate on <span className="font-semibold">Solana</span>.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/60 px-3 py-1 text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_theme(colors.emerald.500)]" />
          Connected
        </span>
      </div>

      {/* Excel Preview */}
      {excelRows.length > 0 && (
        <div
          id="excel-preview"
          className="mb-6 rounded-2xl border border-white/20 bg-white/60 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40"
        >
          <h3 className="mb-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-sm font-extrabold text-transparent">
            📌 Excel Data Preview
          </h3>

          <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/50 backdrop-blur dark:border-white/10 dark:bg-slate-900/30">
            <table className="min-w-full divide-y divide-white/20 text-sm dark:divide-white/10">
              <thead className="sticky top-0 z-10 bg-white/70 text-xs uppercase tracking-wide text-gray-700 backdrop-blur dark:bg-slate-900/60 dark:text-gray-300">
                <tr>
                  {Object.keys(excelRows[0]).map((key) => (
                    <th key={key} className="px-3 py-2 text-left font-semibold" title={key}>
                      {key}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/20 bg-white/50 dark:divide-white/10 dark:bg-slate-900/30">
                {excelRows.map((row, idx) => {
                  const isSelected = selectedRowIndex === idx;
                  return (
                    <tr
                      key={idx}
                      onClick={() => {
                        setSelectedRowIndex(idx);
                        const mapped = {
                          nama: String(row["Nama"] ?? row["nama"] ?? "").trim(),
                          nim: String(row["Nim"] ?? row["nim"] ?? "").trim(),
                          program_studi: String(row["Program Studi"] ?? row["program studi"] ?? "").trim(),
                          universitas: String(row["Universitas"] ?? row["universitas"] ?? "").trim(),
                          kode_batch: String(row["Kode Batch"] ?? row["kode batch"] ?? "").trim(),
                          nomor_ijazah: String(row["Nomor Ijasah"] ?? row["nomor ijasah"] ?? "").trim(),
                          operator_name: String(row["Petugas Operator"] ?? row["petugas operator"] ?? "").trim(),
                        };
                        setForm((prev) => ({ ...prev, ...mapped }));
                      }}
                      className={[
                        "cursor-pointer transition-colors",
                        "hover:bg-white/60 dark:hover:bg-slate-900/50",
                        isSelected && "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/30",
                      ].join(" ")}
                    >
                      {Object.values(row).map((val, i) => (
                        <td key={i} className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                          {val}
                        </td>
                      ))}

                      <td className="px-3 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRowIndex(idx);
                            const mapped = {
                              nama: String(row["Nama"] ?? row["nama"] ?? "").trim(),
                              nim: String(row["Nim"] ?? row["nim"] ?? "").trim(),
                              program_studi: String(row["Program Studi"] ?? row["program studi"] ?? "").trim(),
                              universitas: String(row["Universitas"] ?? row["universitas"] ?? "").trim(),
                              kode_batch: String(row["Kode Batch"] ?? row["kode batch"] ?? "").trim(),
                              nomor_ijazah: String(row["Nomor Ijazah"] ?? row["nomor ijazah"] ?? row["nomor ijasah"] ?? "").trim(),
                              operator_name: String(row["Petugas Operator"] ?? row["petugas operator"] ?? "").trim(),
                            };
                            setForm((prev) => ({ ...prev, ...mapped }));
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                        >
                          Use This Row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            Click any row to auto-fill the form. Selected row is highlighted.
          </div>
        </div>
      )}

      {/* Import Excel Button */}
      <label className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Import from Excel
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} className="hidden" />
      </label>

      {/* Wallet panel */}
      <div className={`${panelCard} mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center`}>
        <div className="text-sm">
          <p className="font-semibold text-gray-900 dark:text-white">Wallet</p>
          <p className="text-gray-700 dark:text-gray-300">
            {wallet.publicKey ? (
              <>
                Connected as{" "}
                <span className="font-mono">{shorten(wallet.publicKey.toBase58())}</span>
              </>
            ) : (
              "No wallet connected"
            )}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mt-6">
        <ol className="grid grid-cols-3 gap-3 text-sm">
          {["Details", "Attachment", "Review"].map((label, i) => (
            <li
              key={label}
              className={[
                "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                i === step
                  ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                  : i < step
                  ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-white/20 bg-white/40 text-gray-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-300",
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-5 w-5 place-items-center rounded-full text-xs",
                  i === step
                    ? "bg-indigo-600 text-white"
                    : i < step
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-300 text-gray-800 dark:bg-slate-700 dark:text-white",
                ].join(" ")}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <div className="mt-2 h-1 w-full rounded bg-gray-200/60 dark:bg-white/10">
          <div
            className="h-1 rounded bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 transition-all"
            style={{ width: `${((step + 1) / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/20 dark:text-red-200">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}
      {successMsg && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:border-emerald-400/20 dark:text-emerald-200">
          <div className="font-semibold">Success</div>
          <div className="mt-1">{successMsg}</div>
        </div>
      )}

      {/* Step card */}
      <div className={`${panelCard} mt-6`}>
        {/* STEP 0 */}
        {step === 0 && (
         <form
            onSubmit={(e) => {
              e.preventDefault();
              goNext();
            }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* Nama */}
              <div>
                <label htmlFor="nama" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Nama
                </label>
                <input
                  id="nama"
                  name="nama"
                  value={form.nama}
                  onChange={onChange}
                  placeholder="Nama lengkap"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Gunakan nama sesuai ijazah.</p>
              </div>

              {/* NIM */}
              <div>
                <label htmlFor="nim" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  NIM
                </label>
                <input
                  id="nim"
                  name="nim"
                  value={form.nim}
                  onChange={onChange}
                  placeholder="e.g. 21-IF-001"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Alfanumerik, boleh titik/dash/underscore.
                </p>
              </div>

              {/* Program Studi */}
              <div>
                <label htmlFor="program_studi" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Program Studi
                </label>
                <input
                  id="program_studi"
                  name="program_studi"
                  value={form.program_studi}
                  onChange={onChange}
                  placeholder="Informatika / Akuntansi / ..."
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
              </div>

              {/* Universitas */}
              <div>
                <label htmlFor="universitas" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Universitas
                </label>
                <input
                  id="universitas"
                  name="universitas"
                  value={form.universitas}
                  onChange={onChange}
                  placeholder="Nama kampus"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
              </div>

              {/* Kode Batch */}
              <div>
                <label htmlFor="kode_batch" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Kode Batch
                </label>
                <input
                  id="kode_batch"
                  name="kode_batch"
                  value={form.kode_batch}
                  onChange={onChange}
                  placeholder="e.g. 2024A"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
              </div>

              {/* Nomor Ijazah */}
              <div>
                <label htmlFor="nomor_ijazah" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Nomor Ijazah
                </label>
                <input
                  id="nomor_ijazah"
                  name="nomor_ijazah"
                  value={form.nomor_ijazah}
                  onChange={onChange}
                  placeholder="Nomor unik di ijazah"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
                {pdaPreview && (
                  <p className="mt-1 break-all font-mono text-xs text-gray-600 dark:text-gray-400">
                    PDA (preview): {pdaPreview}
                  </p>
                )}
              </div>

              {/* Nama Operator */}
              <div className="sm:col-span-2">
                <label htmlFor="operator_name" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Nama Operator
                </label>
                <input
                  id="operator_name"
                  name="operator_name"
                  value={form.operator_name}
                  onChange={onChange}
                  placeholder="Petugas PDDikti / Admin BAAK / ..."
                  required
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/50 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
              </div>

              {/* Waktu Masuk */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Waktu Masuk (Auto)
                </label>
                <input
                  value={nowPreview.toLocaleString()}
                  readOnly
                  title="Ditentukan otomatis oleh program saat transaksi."
                  className="mt-1 block w-full cursor-not-allowed rounded-lg border border-white/10 bg-gray-100/70 px-3 py-2 text-gray-700 backdrop-blur dark:bg-slate-800/70 dark:text-gray-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    nama: "Budi Santoso",
                    nim: "21-IF-001",
                    program_studi: "Informatika",
                    universitas: "Universitas Nusantara",
                    kode_batch: "2024A",
                    nomor_ijazah: "IJZ-2024-0001",
                    operator_name: "Admin BAAK",
                  })
                }
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                title="Fill with example data"
              >
                Fill example data
              </button>

              <button
                type="submit"
                disabled={!canNextFromStep0}
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </form>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className={`text-base font-semibold ${headingGrad}`}>Attachment (Optional)</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Attach a PDF/Image of the certificate. Hash is computed client-side before upload.
              </p>
            </div>

            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 bg-white/40 p-6 text-center transition hover:border-cyan-400/60 hover:bg-white/60 dark:border-white/10 dark:bg-slate-900/30 dark:hover:border-cyan-400/40"
              onClick={() => document.getElementById("fileInputHidden")?.click()}
            >
              <input
                id="fileInputHidden"
                name="file"
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={onFileInput}
              />
              <svg className="h-8 w-8 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5" />
              </svg>
              <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
                Drag & drop or <span className="font-semibold text-indigo-600 dark:text-indigo-400">browse</span>
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PDF or image files are supported.</p>
            </div>

            {file && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className={`${panelCard} p-4`}>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">Selected File</div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Name</dt>
                        <dd className="mt-0.5 break-all text-gray-900 dark:text-gray-100">{file.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Type</dt>
                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{file.type || "Unknown"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Size</dt>
                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{(file.size / 1024).toFixed(1)} KB</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">SHA-256</dt>
                        <dd className="mt-0.5 break-all font-mono text-xs text-gray-800 dark:text-gray-200">
                          {fileHashHex || "Computing…"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <button
                        onClick={() => onPickFile(null)}
                        className="rounded-lg border border-white/20 bg-white/60 px-3 py-1.5 text-sm text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`${panelCard} p-2`}>
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl">
                    {isImage(file?.type) && filePreview ? (
                      <img src={filePreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                        {file?.type?.includes("pdf") ? "PDF selected" : "No image preview"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-6">
            <div className={`${panelCard} p-4`}>
              <h3 className={`text-base font-semibold ${headingGrad}`}>Review</h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ["Nama", form.nama],
                  ["NIM", form.nim],
                  ["Program Studi", form.program_studi],
                  ["Universitas", form.universitas],
                  ["Kode Batch", form.kode_batch],
                  ["Nomor Ijazah", form.nomor_ijazah],
                  ["Nama Operator", form.operator_name],
                  ["Waktu Masuk (Auto)", `${nowPreview.toLocaleString()} (preview)`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="mt-0.5 text-gray-900 dark:text-gray-100">{v}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">PDA (Preview)</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                    {pdaPreview || "-"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Attachment</dt>
                  <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                    {file ? (
                      <div>
                        {file.name} • {(file.size / 1024).toFixed(1)} KB • {file.type || "file"}
                        {fileHashHex && (
                          <>
                            <br />
                            <span className="break-all font-mono text-xs">SHA-256: {fileHashHex}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">None</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {!pda && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !wallet.publicKey}
                  onClick={handleSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {isSubmitting ? "Saving…" : "Save to Blockchain"}
                </button>
              </div>
            )}

            {pda && (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className={`${panelCard}`}>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">✅ Certificate Stored</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    PDA (account address) where the certificate is stored:
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-gray-900 dark:text-gray-100">{pdaStr}</p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={copyPda}
                      className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
                    >
                      {copied ? "Copied!" : "Copy PDA"}
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${pdaStr}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white/10 dark:hover:bg-white/20"
                    >
                      View on Explorer
                    </a>
                    {fileUriSaved && (
                      <a
                        href={fileUrlGateway}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-3 py-2 text-sm font-medium text-white hover:brightness-110"
                      >
                        Open File
                      </a>
                    )}
                    <button
                      onClick={resetAll}
                      className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200"
                    >
                      New Entry
                    </button>
                  </div>
                </div>

                <div className={`${panelCard} text-center`}>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">QR Code</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Scan to verify on your verification page.
                  </p>
                  <div ref={qrRef} className="mt-3 inline-block rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
                    <QRCodeCanvas value={pdaStr} size={320} level="Q" includeMargin />
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={downloadQR}
                      className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-3 py-2 text-sm font-medium text-white hover:brightness-110"
                    >
                      Download PNG
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
