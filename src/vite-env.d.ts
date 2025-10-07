/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_UPLOAD_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
