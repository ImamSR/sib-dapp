// ping.ts

import { getDb } from "../_lib/mongo.js";

export default async function handler(req, res) {
  try {
    const db = await getDb();
    const col = db.collection("cert_files");
    const count = await col.countDocuments();
    res.status(200).json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
