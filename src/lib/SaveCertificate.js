import { web3 } from "@coral-xyz/anchor";

/** ---------- small utils ---------- */

const DEFAULT_UPLOADER = "http://localhost:8787/upload";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withTimeout(promise, ms = 30000, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function zero32() {
  return new Uint8Array(32);
}

export async function sha256File(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(hash);
}

function bytesToHex(u8) {
  return Array.from(u8 || [])
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadToArLocal(file, endpoint = DEFAULT_UPLOADER) {
  const fd = new FormData();
  fd.append("file", file);
  const resp = await withTimeout(fetch(endpoint, { method: "POST", body: fd }), 20000, "upload");
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ArLocal upload failed (${resp.status}): ${text || resp.statusText}`);
  }
  const json = await resp.json();
  if (!json?.url) throw new Error("Uploader did not return url");
  return { id: json.id, url: json.url };
}

/** Build + sign + send a transaction containing given instructions */
async function signAndSend({ connection, wallet, ixs, label = "transaction" }) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");

  const tx = new web3.Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash });
  ixs.forEach((ix) => tx.add(ix));

  // This SHOULD trigger Phantom’s popup
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });

  // confirm
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

  return sig;
}

/**
 * High-level orchestration:
 * 1) (optional) hash file
 * 2) Ask user to sign + send add_certificate with empty URI (so we don't upload yet)
 * 3) After confirmed, upload file to ArLocal
 * 4) Ask user to sign + send update_file with URI + hash
 *
 * If user rejects the FIRST signature -> NOTHING is uploaded (your requirement).
 *
 * @param {object} opts
 * @param {import("@coral-xyz/anchor").Program} opts.program  - Anchor program (already constructed with programID)
 * @param {import("@solana/web3.js").Connection} opts.connection
 * @param {import("@solana/wallet-adapter-base").WalletAdapter} opts.wallet
 * @param {object} opts.fields - certificate fields
 * @param {string} opts.fields.program_studi
 * @param {string} opts.fields.universitas
 * @param {string} opts.fields.kode_batch
 * @param {string} opts.fields.nim
 * @param {string} opts.fields.nama
 * @param {string} opts.fields.nomor_ijazah
 * @param {string} opts.fields.operator_name
 * @param {File|null} opts.file - optional ijazah file (PDF/image)
 * @param {string} [opts.uploaderEndpoint] - ArLocal uploader endpoint
 *
 * @returns {Promise<{ pda: string, addSig: string, updateSig?: string, fileUri: string, fileHashHex: string }>}
 */
export async function saveCertificateWithFile({
  program,
  connection,
  wallet,
  fields,
  file,
  uploaderEndpoint = DEFAULT_UPLOADER,
}) {
  const {
    program_studi,
    universitas,
    kode_batch,
    nim,
    nama,
    nomor_ijazah,
    operator_name,
  } = fields;

  if (!wallet?.publicKey) throw new Error("Wallet not connected");
  if (!program) throw new Error("Program not ready");

  // Derive PDA
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("cert"), Buffer.from(nomor_ijazah)],
    program.programId
  );

  // Preflight RPC so UI doesn't spin forever
  await connection.getLatestBlockhash("confirmed");

  // Prepare file hash (if any) — but DO NOT upload yet
  let fileHash = zero32();
  if (file) {
    fileHash = await sha256File(file);
  }

  // 1) Build add_certificate instruction with EMPTY URI (atomic-ish behavior)
  const ixAdd = await program.methods
    .addCertificate(
      program_studi,
      universitas,
      kode_batch,
      nim,
      nama,
      nomor_ijazah,
      operator_name,
      "",                     // file_uri EMPTY on purpose
      Array.from(fileHash)    // store expected hash (optional; can be zeros)
    )
    .accounts({
      certificate: pda,
      operator: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .instruction();

  // 2) Ask user to sign + send the add_certificate tx
  // If they reject here, we STOP and DO NOT upload.
  let addSig;
  try {
    addSig = await withTimeout(
      signAndSend({ connection, wallet, ixs: [ixAdd], label: "add_certificate" }),
      45000,
      "add_certificate"
    );
  } catch (e) {
    // user rejection or RPC failure -> nothing uploaded
    throw new Error(`Transaction (add_certificate) failed/rejected: ${e.message || e}`);
  }

  // 3) If there's no file, we're done
  if (!file) {
    return {
      pda: pda.toBase58(),
      addSig,
      fileUri: "",
      fileHashHex: bytesToHex(fileHash),
    };
  }

  // 4) Upload to ArLocal NOW (only after on-chain success)
  let fileUri = "";
  try {
    const { url } = await uploadToArLocal(file, uploaderEndpoint);
    fileUri = url;
  } catch (e) {
    // We already have a cert without file; report clearly so UI can show "attach later"
    throw new Error(`File upload failed AFTER on-chain create (certificate exists). Error: ${e.message || e}`);
  }

  // 5) Update the cert with URI + hash (second tx; requires another approval)
  const ixUpdate = await program.methods
    .updateFile(fileUri, Array.from(fileHash))
    .accounts({
      certificate: pda,
      operator: wallet.publicKey,
    })
    .instruction();

  let updateSig;
  try {
    updateSig = await withTimeout(
      signAndSend({ connection, wallet, ixs: [ixUpdate], label: "update_file" }),
      45000,
      "update_file"
    );
  } catch (e) {
    // Upload succeeded but update failed; you can show a button "Retry attach file"
    throw new Error(
      `update_file transaction failed after upload (you can retry attaching the file). Error: ${e.message || e}`
    );
  }

  return {
    pda: pda.toBase58(),
    addSig,
    updateSig,
    fileUri,
    fileHashHex: bytesToHex(fileHash),
  };
}
