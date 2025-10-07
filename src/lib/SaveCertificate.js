// src/lib/SaveCertificate.js (or .ts)
import { web3 } from "@coral-xyz/anchor";
import { uploadFileToIpfsViaApi } from "./ipfs";

export async function saveCertificateWithFile({
  program,
  connection,
  wallet,
  adminPda,
  fields,
  file, // File | null
}) {
  let fileUri = "";
  let fileHash = new Uint8Array(32); // zeros if no file

  if (file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    fileHash = new Uint8Array(hash);

    const up = await uploadFileToIpfsViaApi(file);
    fileUri = up.ipfsUri; // store ipfs://CID on-chain
  }

  const {
    program_studi, universitas, kode_batch,
    nim, nama, nomor_ijazah, operator_name,
  } = fields;

  const [certPda] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("cert"), Buffer.from(nomor_ijazah)],
    program.programId
  );

  await program.methods
    .addCertificate(
      program_studi,
      universitas,
      kode_batch,
      nim,
      nama,
      nomor_ijazah,
      operator_name,
      fileUri,
      Array.from(fileHash)
    )
    .accounts({
      certificate: certPda,
      adminRegistry: adminPda,
      operator: wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  return { pda: certPda.toBase58(), fileUri };
}
