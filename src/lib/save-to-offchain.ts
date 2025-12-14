// src/lib/save-to-offchain.ts
type SaveCertPayload = {
  pda: string;
  nomor_ijazah: string;
  cid: string;
  filename?: string | null;
  sha256?: string | null;
  operator?: string | null;
  note?: string | null;
};

function joinUrl(base: string, path: string) {
  const b = (base || '').replace(/\/+$/, '');
  const p = (path || '').trim();           // guard undefined
  const pp = p.startsWith('/') ? p : `/${p}`;
  return b ? `${b}${pp}` : pp;
}

const API_BASE = (import.meta.env.VITE_API_BASE || '');     // e.g. http://localhost:3000
const SAVE_PATH = '/api/certs/save';

export async function saveCertMetaToApi(payload: SaveCertPayload) {
  // minimal required fields
  if (!payload?.pda || !payload?.nomor_ijazah || !payload?.cid) {
    throw new Error('saveCertMetaToApi: pda, nomor_ijazah, cid are required');
  }

  const url = joinUrl(API_BASE, SAVE_PATH);


  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });



  const txt = await res.text().catch(() => '');
  let body: any = txt;
  try { body = JSON.parse(txt); } catch { }

  if (!res.ok) {
    console.error(`[Frontend-MongoDB] ❌ Save failed:`, body);
    throw new Error(`Save metadata failed: ${res.status} ${res.statusText} — ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }


  return body;
}
