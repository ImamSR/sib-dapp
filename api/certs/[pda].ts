// /api/certs/[pda].js
import { getDb } from "../_lib/mongo.js";

const rawGw = process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
const GATEWAY = (rawGw.startsWith("http") ? rawGw : `https://${rawGw}`).replace(/\/+$/, "") + "/";

// Basic CORS for local dev
function setCors(res, req) {
  const origin = req?.headers?.origin;
  res.setHeader("Access-Control-Allow-Origin", origin?.startsWith("http://localhost") ? origin : "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  const { pda } = req.query || {};
  if (!pda) return res.status(400).json({ ok: false, error: "Missing pda" });

  try {
    const db = await getDb(process.env.MONGODB_DB || "sib");
    // ⬅️ you save into the "certs" collection in /api/certs/save.js
    const doc = await db.collection("certs").findOne({ pda: String(pda) });
    if (!doc) return res.status(404).json({ ok: false, error: "not found" });

    const cid = String(doc.cid);
    return res.status(200).json({
      ok: true,
      pda: doc.pda,
      nomor_ijazah: doc.nomor_ijazah,
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${GATEWAY}${cid}`,
      filename: doc.filename || null,
      sha256: doc.sha256 || null,
      operator: doc.operator || null,
      updatedAt: doc.updatedAt,
    });
  } catch (e) {
    console.error("/api/certs/[pda] error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
