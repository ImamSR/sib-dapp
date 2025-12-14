// /api/pinata-upload.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/mongo.js";

export const config = {
  api: {
    bodyParser: false, // we read the raw stream ourselves
  },
};

async function readBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for browser dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-file-name");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    if (!PINATA_JWT) {
      return res.status(500).json({ error: "Missing PINATA_JWT env var" });
    }

    const buf = await readBody(req);
    if (!buf?.length) {
      return res.status(400).json({ error: "Empty body (0 bytes)" });
    }

    const fileNameHeader = (req.headers["x-file-name"] as string) || `upload-${Date.now()}.bin`;
    const fileName = decodeURIComponent(fileNameHeader);

    const form = new FormData();
    form.append("file", new Blob([buf as any]), fileName);
    form.append("pinataMetadata", JSON.stringify({ name: fileName }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        // ❗ DO NOT set Content-Type – fetch + FormData will handle boundary
      },
      body: form,
    });

    const bodyText = await pinataRes.text();

    if (!pinataRes.ok) {
      // Surface Pinata error to frontend so you can see it
      return res.status(500).json({
        error: "Pinata error",
        status: pinataRes.status,
        body: bodyText,
      });
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return res.status(500).json({
        error: "Unexpected Pinata response (not JSON)",
        body: bodyText,
      });
    }

    const cid: string = data.IpfsHash;
    const gwBase =
      (process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/")
        .replace(/\/+$/, "") + "/";

    // --- MongoDB Save (Hybrid Storage) ---
    const pda = req.headers["x-pda"];
    if (pda && typeof pda === "string") {
      try {
        const db = await getDb(process.env.MONGODB_DB || "sib");
        const coll = db.collection("certs");
        await coll.updateOne(
          { pda },
          {
            $set: {
              cid,
              filename: fileName,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );

      } catch (dbErr) {
        console.error("[pinata-upload] ⚠️ Failed to save to Mongo:", dbErr);
        // We do NOT fail the request, just log it. The file is on IPFS.
      }
    }
    // -------------------------------------

    return res.status(200).json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${gwBase}${cid}`,
    });
  } catch (e: any) {

    return res.status(500).json({
      error: e?.message || String(e),
    });
  }
}
