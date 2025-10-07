// api/pinata-upload.ts
export const config = { runtime: "edge" };

type PinataOk = { IpfsHash: string; PinSize?: number; Timestamp?: string };
type PinataErr = { error?: string; message?: string; error_message?: string };

export default async function handler(req: Request) {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const jwt = process.env.PINATA_JWT;
    if (!jwt) return new Response("PINATA_JWT is missing", { status: 500 });

    const gateway =
      (process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/")
        .replace(/\/+$/, "") + "/";

    // Read the raw bytes from the client (we'll wrap them into FormData)
    const blob = await req.blob();

    // Build the multipart form that Pinata expects:
    // - field name MUST be "file"
    // - pinataMetadata and pinataOptions may be JSON strings (or JSON blobs)
    const form = new FormData();
    form.append("file", blob, "upload.bin");
    form.append("pinataMetadata", JSON.stringify({ name: `cert-${Date.now()}` }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    // If Pinata returns an error, include their message so debugging is easy
    if (!pinataRes.ok) {
      let detail = await pinataRes.text();
      // try to pretty print if it's JSON
      try {
        const j = JSON.parse(detail) as PinataErr;
        detail = j.error || j.message || j.error_message || detail;
      } catch {}
      return new Response(
        JSON.stringify({ error: detail || "Pinata upload failed" }),
        { status: pinataRes.status, headers: { "content-type": "application/json" } }
      );
    }

    // Type the JSON so TS knows IpfsHash exists
    const json = (await pinataRes.json()) as PinataOk;
    const cid = json.IpfsHash;

    return new Response(
      JSON.stringify({
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `${gateway}${cid}`,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(e?.message || "Internal Error", { status: 500 });
  }
}
