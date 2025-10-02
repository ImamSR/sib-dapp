/* Reusable details card for a verified certificate (web3-glass themed) */
export default function CertificateDetailsCard({ addr, data }) {
  // waktuMasuk can be BN, number, or undefined
  const issuedSec = data?.waktuMasuk?.toNumber
    ? data.waktuMasuk.toNumber()
    : Number(data?.waktuMasuk ?? 0);
  const issuedStr = issuedSec ? new Date(issuedSec * 1000).toLocaleString() : "-";

  const toHex = (arr) => {
    try {
      const u8 =
        arr instanceof Uint8Array
          ? arr
          : Array.isArray(arr)
          ? Uint8Array.from(arr)
          : arr?.data
          ? Uint8Array.from(arr.data)
          : new Uint8Array(0);
      return Array.from(u8).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  };

  const toBase58 = (k) => {
    if (!k) return "";
    try {
      return typeof k === "string" ? k : k.toBase58?.() || "";
    } catch {
      return "";
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* no-op */
    }
  };

  // Normalize possible field variants
  const operatorName = data?.operatorName ?? data?.operator_name ?? "-";
  const operatorPub =
    toBase58(data?.operatorPubkey) || toBase58(data?.operator) || "";

  const panelCard =
    "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40";
  const subPanel =
    "rounded-xl border border-white/20 bg-white/50 p-4 backdrop-blur dark:border-white/10 dark:bg-slate-900/30";
  const headingGrad =
    "bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent";
  const softButton =
    "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/60 px-2.5 py-1 text-xs font-medium text-gray-800 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-2 focus:ring-offset-white dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-200 dark:focus:ring-offset-slate-900";
  const primaryButton =
    "inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black dark:bg-white/10 dark:text-white dark:hover:bg-white/20";

  return (
    <div className={panelCard}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/40">
            ✓
          </span>
          <h3 className={`text-lg font-extrabold ${headingGrad}`}>Certificate Verified</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Authentic
          </span>
          {data?.fileUri && (
            <span className="inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Attachment Linked
            </span>
          )}
        </div>
      </div>

      {/* Quick facts (address + issued) */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={subPanel}>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Account (PDA)
          </div>
          <div className="mt-1 flex items-start gap-2">
            <code className="block flex-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
              {addr || "—"}
            </code>
            {addr && (
              <button onClick={() => copy(addr)} className={softButton} title="Copy PDA">
                Copy
              </button>
            )}
          </div>
        </div>

        <div className={subPanel}>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Issued
          </div>
          <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {issuedStr}
          </div>
        </div>
      </div>

      {/* Grid details */}
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Nama
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.nama || "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            NIM
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.nim || "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Program Studi
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.programStudi ?? data?.program_studi ?? "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Universitas
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.universitas || "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Kode Batch
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.kodeBatch ?? data?.kode_batch ?? "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Nomor Ijazah
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {data?.nomorIjazah ?? data?.nomor_ijazah ?? "—"}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Nama Operator
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
            {operatorName}
          </dd>
        </div>

        <div className={subPanel}>
          <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Operator Wallet
          </dt>
          <dd className="mt-1 flex items-start gap-2">
            <code className="block flex-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
              {operatorPub || "—"}
            </code>
            {!!operatorPub && (
              <button onClick={() => copy(operatorPub)} className={softButton} title="Copy operator wallet">
                Copy
              </button>
            )}
          </dd>
        </div>

        {/* Attachment */}
        <div className="sm:col-span-2">
          <div className={subPanel}>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ijazah File
            </dt>
            <dd className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {data?.fileUri ? (
                <>
                  <a
                    href={data.fileUri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
                  >
                    Open File
                  </a>
                  {Array.isArray(data.fileHash) && data.fileHash.length > 0 && (
                    <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300">
                      sha256: {toHex(data.fileHash)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-gray-600 dark:text-gray-400">—</span>
              )}
            </dd>
          </div>
        </div>
      </dl>

      {/* Explorer link */}
      {addr && (
        <div className="mt-6">
          <a
            href={`https://explorer.solana.com/address/${addr}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className={primaryButton}
          >
            View on Solana Explorer
          </a>
        </div>
      )}
    </div>
  );
}
