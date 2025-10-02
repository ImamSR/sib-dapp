// src/hooks/useAdmin.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Program, web3 } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { connection, getReadOnlyProvider, getProgram, findAdminPda } from "../lib/program";

/** ======= Tunables ======= */
const CACHE_TTL_MS = 5 * 60 * 1000;      // 5 minutes "fresh" window
const RPC_TIMEOUT_MS = 5000;             // 5s per attempt
const RETRY_DELAYS_MS = [500, 1500, 3000]; // exponential-ish backoff

type AdminState = {
  program: Program | null;
  adminPda: web3.PublicKey | null;
  loading: boolean;
  initialized: boolean | null;
  isAdmin: boolean;
  superAdmin: string;
  admins: string[];
  error: string;
  reload: () => Promise<void>;
};

/** Small helpers */
const timeout = <T,>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("RPC timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useAdmin(): AdminState {
  const wallet = useWallet();
  const me58 = useMemo(() => wallet.publicKey?.toBase58() ?? "", [wallet.publicKey]);

  // Program & PDA (read-only)
  const roProgram = useMemo(() => {
    const p = getReadOnlyProvider();
    return getProgram(p);
  }, []);
  const adminPda = useMemo(() => findAdminPda()[0], []);

  // State
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [superAdmin, setSuperAdmin] = useState("");
  const [admins, setAdmins] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Sticky & control refs
  const lastWalletRef = useRef<string>("");
  const stickyAdminRef = useRef(false);     // once true for this wallet, keep true (unless proven otherwise)
  const inFlightRef = useRef(false);
  const unmountedRef = useRef(false);

  // Cache keys (bind to endpoint + PDA)
  const endpoint = (connection as any)?._rpcEndpoint || "unknown";
  const cacheKey = useMemo(() => {
    const pda = adminPda?.toBase58() ?? "no-pda";
    return `sib-admin-registry:${endpoint}:${pda}:v1`;
  }, [endpoint, adminPda]);

  // --- Cache helpers ---
  type CacheShape = { superAdmin: string; admins: string[]; updatedAt: number };
  const loadCache = useCallback((): CacheShape | null => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as CacheShape;
    } catch { return null; }
  }, [cacheKey]);

  const saveCache = useCallback((data: CacheShape) => {
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
  }, [cacheKey]);

  const cacheIsFresh = useCallback((c: CacheShape | null) =>
    !!c && Date.now() - c.updatedAt <= CACHE_TTL_MS, []);

  // Derive admin from a registry & wallet
  const computeIsAdmin = useCallback((super58: string, list58: string[], who: string) => {
    if (!who) return false;
    return who === super58 || list58.includes(who);
  }, []);

  // If wallet changed, un-sticky
  useEffect(() => {
    if (lastWalletRef.current !== me58) {
      lastWalletRef.current = me58;
      stickyAdminRef.current = false;
      // Don't reset isAdmin immediately; allow cache to provide continuity
    }
  }, [me58]);

  // Core fetch with retries (bounded by timeout)
  const fetchRegistry = useCallback(async () => {
    // 1) Quick existence check
    const info = await timeout(connection.getAccountInfo(adminPda!), RPC_TIMEOUT_MS);
    if (!info) {
      // Registry not initialized
      return { initialized: false, super58: "", list58: [] as string[] };
    }

    // 2) Fetch data
    const reg: any = (roProgram as any).account.adminRegistry
      ? await timeout((roProgram as any).account.adminRegistry.fetch(adminPda!), RPC_TIMEOUT_MS)
      : await timeout((roProgram as any).account["adminRegistry"].fetch(adminPda!), RPC_TIMEOUT_MS);

    const super58 = reg.superAdmin.toBase58();
    const list58: string[] = (reg.admins || []).map((k: any) =>
      k?.toBase58 ? k.toBase58() : new web3.PublicKey(k).toBase58()
    );

    return { initialized: true, super58, list58 };
  }, [roProgram, adminPda]);

  const fetchWithRetry = useCallback(async () => {
    try {
      return await fetchRegistry();
    } catch (e) {
      for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
        await sleep(RETRY_DELAYS_MS[i]);
        try {
          return await fetchRegistry();
        } catch {}
      }
      throw new Error("RPC failed after retries");
    }
  }, [fetchRegistry]);

  const reload = useCallback(async () => {
    // If already sticky admin for this wallet, do nothing.
    if (stickyAdminRef.current && lastWalletRef.current === me58) {
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    setError("");

    try {
      // 1) Use cache first (instant UI), then revalidate in background
      const cached = loadCache();
      if (cached) {
        setInitialized(true);
        setSuperAdmin(cached.superAdmin);
        setAdmins(cached.admins);
        const cachedIsAdmin = computeIsAdmin(cached.superAdmin, cached.admins, me58);
        // Display cached truth immediately; never downgrade to false due to network errors later
        setIsAdmin((prev) => prev || cachedIsAdmin);
        if (cachedIsAdmin) stickyAdminRef.current = true;
        // If cache is fresh, we can skip network entirely
        if (cacheIsFresh(cached)) {
          setLoading(false);
          inFlightRef.current = false;
          return;
        }
      }

      // 2) If offline, keep what we have (don’t flip to false)
      if (typeof navigator !== "undefined" && navigator && !navigator.onLine) {
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      // 3) Fetch with timeout + retry
      const res = await fetchWithRetry();

      if (!res.initialized) {
        setInitialized(false);
        // Only set false if we weren’t previously true/sticky
        if (!stickyAdminRef.current) setIsAdmin(false);
        setSuperAdmin("");
        setAdmins([]);
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      // Success path: update state & cache
      setInitialized(true);
      setSuperAdmin(res.super58);
      setAdmins(res.list58);
      saveCache({ superAdmin: res.super58, admins: res.list58, updatedAt: Date.now() });

      const nowIsAdmin = computeIsAdmin(res.super58, res.list58, me58);

      // IMPORTANT RULES:
      // - If we were already true, stay true unless this successful fetch proves false.
      // - Network failures never flip us to false; only a successful fetch may.
      setIsAdmin((prev) => (prev ? (nowIsAdmin ? true : false) : nowIsAdmin));
      if (nowIsAdmin) stickyAdminRef.current = true;
    } catch (e: any) {
      // On error: never demote a true admin; just surface error string
      setError(e?.message || String(e));
      if (initialized === null) setInitialized(null); // unknown
      // keep isAdmin as-is
    } finally {
      if (!unmountedRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, [
    me58,
    initialized,
    loadCache,
    saveCache,
    cacheIsFresh,
    fetchWithRetry,
    computeIsAdmin,
  ]);

  // Initial load + wallet change
  useEffect(() => {
    reload();
  }, [reload]);

  // Revalidate when we come back online or tab becomes visible
  useEffect(() => {
    const onOnline = () => reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  useEffect(() => () => { unmountedRef.current = true; }, []);

  return {
    program: roProgram,
    adminPda,
    loading,
    initialized,
    isAdmin,
    superAdmin,
    admins,
    error,
    reload,
  };
}
