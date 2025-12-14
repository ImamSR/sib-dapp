import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import idl from "../idl/sib.json";
import CertificateDetailsCard from "./CertificateDetailsCard.jsx";

const RPC = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
const connection = new web3.Connection(RPC, "confirmed");
const LS_CAMERA_KEY = "qr_last_camera_id";

// UI tokens (same family as other pages)
const panelCard =
  "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
const subPanel =
  "rounded-xl border border-white/20 bg-white/50 p-5 backdrop-blur dark:border-white/10 dark:bg-slate-900/30";
const headingGrad =
  "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
const softButton =
  "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200 dark:focus:ring-offset-slate-900";
const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900";
const pillBase =
  "relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition";
const pillActive =
  "text-white before:absolute before:inset-0 before:-z-10 before:rounded-xl before:bg-gradient-to-r before:from-indigo-600 before:via-violet-600 before:to-cyan-500 before:shadow-md before:shadow-indigo-600/30";
const pillIdle =
  "text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white";

export default function VerifyCertificate() {
  const [mode, setMode] = useState("camera"); // 'camera' | 'file' | 'manual'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [scannedAddr, setScannedAddr] = useState("");

  // camera state
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [startNonce, setStartNonce] = useState(0);

  // html5-qrcode instances
  const camQrRef = useRef(null);
  const fileQrRef = useRef(null);

  // serialize ops to avoid transition errors
  const opQueue = useRef(Promise.resolve());
  const runSerial = (fn) =>
    (opQueue.current = opQueue.current.then(fn).catch(() => { }));

  const scanRegionId = "qr-region";
  const fileRegionId = "qr-file-region";

  // Anchor provider/program (read-only)
  const provider = useMemo(() => {
    const dummy = {
      publicKey: new web3.PublicKey("11111111111111111111111111111111"),
      signAllTransactions: async (txs) => txs,
      signTransaction: async (tx) => tx,
    };
    return new AnchorProvider(connection, dummy, {});
  }, []);
  const program = useMemo(() => new Program(idl, provider), [provider]);

  const ensureHttpsOrLocal = () => {
    if (typeof window === "undefined") return true;
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return isLocal || window.location.protocol === "https:";
  };

  const bestBackCameraId = (devices) => {
    const lower = (s) => (s || "").toLowerCase();
    const back = devices.find((d) => /back|rear|environment/.test(lower(d.label)));
    return back?.id || devices[devices.length - 1]?.id || "";
  };

  const handleDecodedText = useCallback(async (decodedText) => {
    setBusy(true);
    setError("");
    setData(null);
    setScannedAddr("");
    try {
      const pk = new web3.PublicKey(String(decodedText).trim());
      const cert = await program.account.certificate.fetch(pk);
      setScannedAddr(pk.toBase58());
      setData(cert);
    } catch (e) {
      console.error(e);
      setError("Certificate not found or invalid QR payload.");
    } finally {
      setBusy(false);
    }
  }, [program]);

  // enumerate cameras on camera mode
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mode !== "camera") return;

      setError("");
      setData(null);
      setScannedAddr("");

      if (!ensureHttpsOrLocal()) {
        setError("Camera requires HTTPS or http://localhost.");
        return;
      }

      try {
        const list = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setCams(list || []);
        const stored = localStorage.getItem(LS_CAMERA_KEY);
        const pick =
          list.find((c) => c.id === stored)?.id ||
          bestBackCameraId(list) ||
          list[0]?.id ||
          "";
        setCamId(pick);
      } catch (e) {
        console.error("Camera enumeration failed:", e);
        setError("Unable to access cameras. Check permissions and reload.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // start/stop camera (serialized)
  useEffect(() => {
    if (!camId) {
      if (cams.length > 0) setError("No camera Selected.");
      return;
    }
    setError("");

    let cancelled = false;

    runSerial(async () => {
      if (cancelled) return;
      // stop previous
      if (camQrRef.current?.isScanning) await camQrRef.current.stop();
      if (!camQrRef.current)
        camQrRef.current = new Html5Qrcode(scanRegionId, { verbose: false });
      try { await camQrRef.current?.stop(); } catch { /* ignore */ }
      try { await camQrRef.current?.clear(); } catch { /* ignore */ }
      if (!camQrRef.current) {
        camQrRef.current = new Html5Qrcode(scanRegionId, { verbose: false });
      } else {
        await camQrRef.current.clear();
      }

      const config = {
        fps: 12,
        qrbox: 240,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };

      const onSuccess = async (decodedText) => {
        try {
          if (camQrRef.current?.isScanning) await camQrRef.current.stop();
          try { await camQrRef.current?.stop(); } catch { /* ignore */ }
        } catch { /* ignore */ }
        setIsRunning(false);
        await handleDecodedText(decodedText);
      };
      const onFailure = () => { };

      localStorage.setItem(LS_CAMERA_KEY, camId);

      try {
        await camQrRef.current.start(
          { deviceId: { exact: camId } },
          config,
          onSuccess,
          onFailure
        );
      } catch {
        try {
          await camQrRef.current.start(
            { facingMode: "environment" },
            config,
            onSuccess,
            onFailure
          );
        } catch {
          await camQrRef.current.start({ deviceId: camId }, config, onSuccess, onFailure);
        }
      }
      if (!cancelled) setIsRunning(true);
    });

    return () => {
      cancelled = true;
      runSerial(async () => {
        if (camQrRef.current?.isScanning) await camQrRef.current.stop();
        if (camQrRef.current) await camQrRef.current.clear();
        try { await camQrRef.current?.stop(); } catch { /* ignore */ }
        try { await camQrRef.current?.clear(); } catch { /* ignore */ }
        camQrRef.current = null;
        setIsRunning(false);
      });
    };
  }, [mode, camId, startNonce, cams.length, handleDecodedText]); // Added cams.length per lint

  // file mode helpers
  const clearFilePreview = () =>
    runSerial(async () => {
      if (fileQrRef.current) {
        try {
          await fileQrRef.current.clear();
        } catch { /* ignore */ }
        fileQrRef.current = null;
      }
    });

  const onFileSelected = (file) =>
    runSerial(async () => {
      if (!file) return;
      setError("");
      setData(null);
      setScannedAddr("");
      setBusy(true);

      if (camQrRef.current?.isScanning) await camQrRef.current.stop();

      try {
        if (!fileQrRef.current) {
          fileQrRef.current = new Html5Qrcode(fileRegionId, { verbose: false });
        } else {
          try {
            await fileQrRef.current.clear();
          } catch { /* ignore */ }
          fileQrRef.current = new Html5Qrcode(fileRegionId, { verbose: false });
        }

        let decodedText = "";
        if (typeof fileQrRef.current.scanFileV2 === "function") {
          const result = await fileQrRef.current.scanFileV2(file, {
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          });
          decodedText = result?.decodedText || "";
        } else {
          decodedText = await fileQrRef.current.scanFile(file, true);
        }

        if (!decodedText) throw new Error("No QR detected.");
        await handleDecodedText(decodedText);
      } catch (e) {
        console.error("Image scan failed:", e);
        setError("Could not read a QR from this image. Try a clearer, larger QR.");
      } finally {
        setBusy(false);
      }
    });

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG/JPG).");
      return;
    }
    onFileSelected(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please drop an image file (PNG/JPG).");
      return;
    }
    onFileSelected(file);
  };
  const onDragOver = (e) => e.preventDefault();

  // manual verify
  async function verifyManual(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = String(form.get("pda") || "").trim();
    setError("");
    setData(null);
    setScannedAddr("");
    setBusy(true);
    try {
      const pubkey = new web3.PublicKey(input);
      const cert = await program.account.certificate.fetch(pubkey);
      setScannedAddr(pubkey.toBase58());
      setData(cert);
    } catch (e2) {
      console.error(e2);
      setError("Account not found or invalid address.");
    } finally {
      setBusy(false);
    }
  }

  const copyAddr = async () => {
    if (!scannedAddr) return;
    try {
      await navigator.clipboard.writeText(scannedAddr);
    } catch { /* ignore */ }
  };
  const clearResult = () => {
    setData(null);
    setScannedAddr("");
    setError("");
  };
  const restartScan = () => setStartNonce((n) => n + 1);

  const flipCamera = () => {
    if (cams.length < 2) return;
    const idx = cams.findIndex((c) => c.id === camId);
    const next = cams[(idx + 1) % cams.length]?.id;
    if (next) setCamId(next);
  };

  // ---------- UI ----------
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      {/* Header */}
      <div className="mb-4 mt-4">
        <h1 className={`text-2xl  font-extrabold tracking-tight md:text-3xl ${headingGrad}`}>
          Verify Certificate
        </h1>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Scan a QR (PDA) with your camera or upload an image, or paste the PDA to fetch on-chain
          data from <span className="font-semibold">Solana Devnet</span>.
        </p>
      </div>

      {/* Segmented control (glass gradient pills) */}
      <div className={`${panelCard} mb-4 p-2`}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode("file")}
            className={`${pillBase} ${mode === "file" ? pillActive : pillIdle}`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h10a2 2 0 0 0 2-2V8l-6-6z" />
            </svg>
            Upload Image
          </button>
          <button
            onClick={() => setMode("camera")}
            className={`${pillBase} ${mode === "camera" ? pillActive : pillIdle}`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Use Camera
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`${pillBase} ${mode === "manual" ? pillActive : pillIdle}`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16 4h5v5" />
              <path d="M21 3l-7.5 7.5" />
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Paste PDA
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-800 dark:border-red-400/20 dark:text-red-200">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {/* Camera mode */}
      {mode === "camera" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select
              className="w-full rounded-lg border border-white/20 bg-white/70 px-2 py-2 text-sm text-gray-900 shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-cyan-400/60 dark:border-white/10 dark:bg-slate-900/50 dark:text-white"
              value={camId}
              onChange={(e) => setCamId(e.target.value)}
            >
              {cams.length === 0 && <option value="">No cameras found</option>}
              {cams.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.id}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={flipCamera}
              className={softButton}
              disabled={cams.length < 2}
              title="Flip camera"
            >
              🔄
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={() =>
                  runSerial(async () => {
                    if (camQrRef.current?.isScanning) await camQrRef.current.stop();
                    setIsRunning(false);
                  })
                }
                className={softButton}
              >
                Stop
              </button>
            ) : (
              <button type="button" onClick={restartScan} className={primaryButton}>
                Start
              </button>
            )}
          </div>

          <div
            id={scanRegionId}
            className="qr-scan-surface relative overflow-hidden rounded-2xl border border-white/20 bg-black/90 backdrop-blur-sm dark:border-white/10"
            style={{ width: "100%", minHeight: 360 }}
          >
            {/* overlay frame */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="qr-scan-frame h-[62%] w-[62%] rounded-2xl" />
            </div>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400">
            Tip: Laptop webcams are often low-res. Try <span className="font-medium">Upload Image</span> if scanning struggles.
          </p>
        </div>
      )}

      {/* File mode */}
      {mode === "file" && (
        <div className={subPanel}>
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
            Upload a QR image (PNG/JPG)
          </label>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="mt-2 grid place-items-center rounded-xl border-2 border-dashed border-white/30 bg-white/40 p-6 text-center transition hover:border-cyan-400/60 hover:bg-white/60 dark:border-white/10 dark:bg-slate-900/30"
          >
            <input
              type="file"
              accept="image/*"
              onChange={onFileInputChange}
              className="mx-auto block w-full cursor-pointer rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-sm text-gray-900 shadow-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:via-violet-600 file:to-cyan-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:brightness-110 dark:border-white/10 dark:bg-slate-900/50 dark:text-white"
            />
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">or drag & drop an image here</p>
          </div>

          <div className="mt-4">
            <div
              id={fileRegionId}
              className="relative overflow-hidden rounded-2xl border border-white/20 bg-black/90 backdrop-blur-sm dark:border-white/10"
              style={{ width: "100%", minHeight: 260 }}
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={clearFilePreview} className={softButton}>
                Clear Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual mode */}
      {mode === "manual" && (
        <form onSubmit={verifyManual} className={subPanel}>
          <label htmlFor="pda" className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
            Certificate Account (PDA)
          </label>
          <input
            id="pda"
            name="pda"
            placeholder="Paste PDA address, e.g. 9x5K...AbcD"
            className="mt-2 block w-full rounded-lg border border-white/20 bg-white/70 px-3 py-2 text-gray-900 shadow-sm backdrop-blur placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 dark:border-white/10 dark:bg-slate-900/50 dark:text-white"
            required
          />
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy && (
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Verify
            </button>
          </div>
        </form>
      )}

      {/* Loading skeleton */}
      {busy && (
        <div className={`${subPanel} mt-4`}>
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-white/10" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 rounded bg-gray-200 dark:bg-white/10" />
              <div className="h-16 rounded bg-gray-200 dark:bg-white/10" />
            </div>
            <div className="h-24 rounded bg-gray-200 dark:bg-white/10" />
          </div>
        </div>
      )}

      {/* Last scanned */}
      {scannedAddr && !busy && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-700 dark:text-gray-300">
            Last address: <span className="font-mono">{scannedAddr}</span>
          </span>
          <button onClick={copyAddr} className={softButton}>
            Copy
          </button>
          <button onClick={clearResult} className={softButton}>
            Clear
          </button>
        </div>
      )}

      {/* Result */}
      {data && (
        <div className="mt-6">
          <CertificateDetailsCard addr={scannedAddr} data={data} />
        </div>
      )}

      {/* Empty state */}
      {!busy && !data && !error && (
        <div className={`${panelCard} mt-6 text-center text-sm text-gray-700 dark:text-gray-300`}>
          Use <span className="font-semibold">Upload Image</span> or Camera to read a QR, or paste a PDA address.
        </div>
      )}
    </div>
  );
}
