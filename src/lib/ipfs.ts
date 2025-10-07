// api/pinata-upload.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import FormData from "form-data"; // npm i form-data

// Small helper to read the raw body (binary) from the incoming request stream
async function readBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (optional; useful during local testing from different origins)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    if (!PINATA_JWT) {
      return res.status(500).json({ error: "Missing PINATA_JWT env" });
    }

    // Read the raw file bytes sent from the browser
    const buf = await readBody(req);

    // Build multipart form for Pinata
    const form = new FormData();
    form.append("file", buf, { filename: `upload-${Date.now()}.bin` });
    form.append("pinataMetadata", JSON.stringify({ name: `cert-${Date.now()}` }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    // Post to Pinata with Axios
    const pinataResp = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      form,
      {
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          ...form.getHeaders(), // important in Node!
        },
        maxBodyLength: Infinity,
      }
    );

    const cid: string = pinataResp.data.IpfsHash;
    const gatewayBase =
      (process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/+$/, "") + "/";

    return res.status(200).json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${gatewayBase}${cid}`,
    });
  } catch (e: any) {
    const msg = e?.response?.data || e?.message || String(e);
    return res.status(500).json({ error: msg });
  }
}
