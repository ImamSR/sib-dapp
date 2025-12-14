// /api/certs/save.js
import { getDb } from "../_lib/mongo.js";

// CORS helper (dev-friendly)
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "auto").trim();

function setCors(res, req) {
  if (CORS_ORIGIN === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (CORS_ORIGIN === "auto") {
    const origin = req?.headers?.origin;
    if (origin && origin.startsWith("http://localhost")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-file-name, x-solana-pubkey, x-solana-message, x-solana-signature"
  );
}

export default async function handler(req, res) {


  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { pda, nomor_ijazah, cid, filename, sha256, operator, note } = body;


    if (!pda || !nomor_ijazah || !cid) {
      return res.status(400).json({ ok: false, error: "Missing required fields: pda, nomor_ijazah, cid" });
    }


    let db;
    try {
      db = await getDb(process.env.MONGODB_DB || "sib");

    } catch (err) {

      return res.status(500).json({ ok: false, error: "Database not configured: " + String(err?.message || err) });
    }

    const coll = db.collection("certs");

    const doc = {
      pda: String(pda),
      nomor_ijazah: String(nomor_ijazah),
      cid: String(cid),
      filename: filename ? String(filename) : null,
      sha256: sha256 ? String(sha256) : null,
      operator: operator ? String(operator) : null,
      note: note ? String(note) : null,
      updatedAt: new Date(),
    };


    await coll.updateOne({ pda: doc.pda }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });


    return res.status(200).json({ ok: true, ipfsUri: `ipfs://${doc.cid}` });
  } catch (err) {

    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
