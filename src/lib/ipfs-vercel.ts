export function toGatewayUrl(ipfsUriOrCid: string) {
  const BASE =
    (import.meta.env.VITE_IPFS_GATEWAY ||
      "https://gateway.pinata.cloud/ipfs/")
      .replace(/\/+$/, "") + "/";

  const cid = ipfsUriOrCid.startsWith("ipfs://")
    ? ipfsUriOrCid.slice(7)
    : ipfsUriOrCid;

  const token = (import.meta.env.VITE_PINATA_GATEWAY_TOKEN || "").trim();
  const url = `${BASE}${cid}`;
  return token
    ? `${url}?pinataGatewayToken=${encodeURIComponent(token)}`
    : url;
}

// src/lib/ipfs-vercel.ts
export async function uploadFileToIpfsViaVercel(file: File, pda?: string) {
  if (!file) throw new Error("File is required");

  const endpoint =
    import.meta.env.VITE_UPLOAD_ENDPOINT || "/api/pinata-upload";

  const arrayBuf = await file.arrayBuffer();

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "x-file-name": encodeURIComponent(file.name),
  };
  if (pda) {
    headers["x-pda"] = pda;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: arrayBuf,
  });

  const txt = await res.text();
  if (!res.ok) {
    console.error("[Frontend-IPFS] ❌ Upload failed", res.status, "-", txt);
    throw new Error(`Upload failed: ${res.status} - ${txt.slice(0, 500)}`);
  }


  return JSON.parse(txt);
}
