const GATEWAY =
  (import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/")
    .replace(/\/+$/, "") + "/";

// RELATIVE by default, so Vite proxy + Vercel both work
const UPLOAD_ENDPOINT =
  import.meta.env.VITE_UPLOAD_ENDPOINT || "/api/pinata-upload";

// src/lib/ipfs-vercel.ts
export async function uploadFileToIpfsViaVercel(file: File | Blob) {
  const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT || "/api/pinata-upload";
  const buf = await (file as File).arrayBuffer();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: buf,
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json() as Promise<{ cid: string; ipfsUri: string; gatewayUrl: string }>;
}



export function toGatewayUrl(uri: string) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice("ipfs://".length);
    return `${GATEWAY}${cid}`;
  }
  return uri;
}
