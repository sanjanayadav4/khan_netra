/**
 * KhanNetra — Offline Queue Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses IndexedDB to queue records created while offline.
 * When connectivity returns (manually or automatically), pending records are
 * submitted to the real backend API and removed from the queue on success.
 *
 * Supported record types:
 *   'field_report'  → POST /api/v1/field-reports   (multipart FormData)
 *   'incident'      → POST /api/v1/incidents        (JSON)
 *   'inspection'    → POST /api/v1/inspections      (JSON)
 *   'attendance'    → POST /api/v1/attendance       (JSON)
 *
 * Each queued item has a client-generated UUID so the server can detect
 * duplicate submissions (idempotency key sent as X-Idempotency-Key header).
 *
 * NOTE: No sensitive credentials are stored in IndexedDB.
 * The JWT token is read from localStorage at sync time (not stored in IDB).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const DB_NAME    = 'khannetra_offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_records';

/* ── IndexedDB helpers ───────────────────────────────────────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_id' });
        store.createIndex('type',       'type',       { unique: false });
        store.createIndex('status',     'status',     { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll() {
  const db    = await openDB();
  const tx    = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(record) {
  const db    = await openDB();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(client_id) {
  const db    = await openDB();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.delete(client_id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ── API submit per record type ─────────────────────────────────────────── */

async function submitRecord(record, token) {
  const headers = {
    Authorization:      `Bearer ${token}`,
    'X-Idempotency-Key': record.client_id,   // server dedup
  };

  const BASE = '/api/v1';

  switch (record.type) {
    case 'observation':
    case 'safety_observation': {
      const fd = new FormData();
      Object.entries(record.payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
      });
      const res = await fetch(`${BASE}/safety/observations`, {
        method:  'POST',
        headers: { Authorization: headers.Authorization, 'X-Idempotency-Key': headers['X-Idempotency-Key'] },
        body:    fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    case 'document': {
      const fd = new FormData();
      Object.entries(record.payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, v);
      });
      const res = await fetch(`${BASE}/documents`, {
        method:  'POST',
        headers: { Authorization: headers.Authorization, 'X-Idempotency-Key': headers['X-Idempotency-Key'] },
        body:    fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    case 'field_report': {
      const fd = new FormData();
      Object.entries(record.payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, v);
      });
      const res = await fetch(`${BASE}/field-reports`, {
        method:  'POST',
        headers: { Authorization: headers.Authorization, 'X-Idempotency-Key': headers['X-Idempotency-Key'] },
        body:    fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    case 'incident': {
      const res = await fetch(`${BASE}/incidents`, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify(record.payload),
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    case 'inspection': {
      const res = await fetch(`${BASE}/inspections`, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify(record.payload),
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    case 'attendance': {
      const res = await fetch(`${BASE}/attendance`, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify(record.payload),
      });
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`);
      return res.json();
    }

    default:
      throw new Error(`Unknown record type: ${record.type}`);
  }
}

/* ── useOfflineQueue hook ────────────────────────────────────────────────── */

export function useOfflineQueue() {
  const [pending,   setPending]   = useState([]);   // queued items
  const [syncing,   setSyncing]   = useState(false);
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const syncingRef  = useRef(false);

  /* Load queue from IDB on mount */
  const refreshQueue = useCallback(async () => {
    try {
      const items = await idbGetAll();
      setPending(items.sort((a, b) => a.created_at - b.created_at));
    } catch (e) {
      console.error('[OfflineQueue] IDB read failed:', e.message);
    }
  }, []);

  useEffect(() => {
    refreshQueue();

    const onOnline  = () => { setIsOnline(true);  };
    const onOffline = () => { setIsOnline(false); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshQueue]);

  /* Auto-sync when connection restored */
  useEffect(() => {
    if (isOnline && pending.length > 0) {
      syncAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  /**
   * Queue a record for later sync.
   * @param {'field_report'|'incident'|'inspection'|'attendance'} type
   * @param {object} payload  — the form data to POST
   */
  const enqueue = useCallback(async (type, payload) => {
    const record = {
      client_id:  crypto.randomUUID(),    // idempotency key
      type,
      payload,
      status:     'pending',              // pending | syncing | failed
      error:      null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await idbPut(record);
    await refreshQueue();
    return record.client_id;
  }, [refreshQueue]);

  /**
   * Attempt to sync all pending records.
   * Records are processed sequentially to avoid race conditions.
   */
  const syncAll = useCallback(async () => {
    if (syncingRef.current) return;
    const token = localStorage.getItem('token');
    if (!token) return;   // not authenticated — can't sync
    if (!navigator.onLine) return;

    syncingRef.current = true;
    setSyncing(true);

    const items = await idbGetAll();
    const toSync = items.filter(i => i.status !== 'syncing');
    let synced = 0, failed = 0;

    for (const record of toSync) {
      // Mark as syncing
      await idbPut({ ...record, status: 'syncing', updated_at: Date.now() });
      await refreshQueue();

      try {
        await submitRecord(record, token);
        // Success — remove from queue
        await idbDelete(record.client_id);
        synced++;
      } catch (err) {
        // Failure — mark as failed, keep in queue for retry
        await idbPut({
          ...record,
          status:     'failed',
          error:      err.message || 'Unknown error',
          updated_at: Date.now(),
        });
        failed++;
        console.warn(`[OfflineQueue] Sync failed for ${record.client_id}:`, err.message);
      }
    }

    await refreshQueue();
    syncingRef.current = false;
    setSyncing(false);
    return { synced, failed };
  }, [refreshQueue]);

  /**
   * Remove a single record from the queue (discard).
   */
  const discard = useCallback(async (client_id) => {
    await idbDelete(client_id);
    await refreshQueue();
  }, [refreshQueue]);

  /**
   * Reset a failed record back to 'pending' so it will retry on next sync.
   */
  const retry = useCallback(async (client_id) => {
    const items = await idbGetAll();
    const rec   = items.find(i => i.client_id === client_id);
    if (rec) {
      await idbPut({ ...rec, status: 'pending', error: null, updated_at: Date.now() });
      await refreshQueue();
    }
  }, [refreshQueue]);

  const pendingCount = pending.filter(i => i.status === 'pending').length;
  const failedCount  = pending.filter(i => i.status === 'failed').length;

  return {
    pending,        // all queued items
    pendingCount,   // items waiting to sync
    failedCount,    // items that failed last sync
    syncing,        // currently syncing
    isOnline,       // network connectivity
    enqueue,        // add to queue
    syncAll,        // attempt sync now
    discard,        // remove from queue
    retry,          // reset failed → pending
    refreshQueue,
  };
}

export default useOfflineQueue;
