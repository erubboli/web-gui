"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/interfaces-progress";

interface Props {
  initialWalletHeight: number;
  initialNodeHeight: number;
  initialIsSyncing: boolean;
  indexerEnabled?: boolean;
}

export default function SyncStatus({ initialWalletHeight, initialNodeHeight, initialIsSyncing, indexerEnabled = true }: Props) {
  const [walletHeight, setWalletHeight] = useState(initialWalletHeight);
  const [nodeHeight,   setNodeHeight]   = useState(initialNodeHeight);
  const [publicTip,    setPublicTip]    = useState<number | null>(null);
  const [isSyncing,    setIsSyncing]    = useState(initialIsSyncing);
  const [connected,    setConnected]    = useState(false);

  const [indexerHeight,  setIndexerHeight]  = useState<number | null>(null);
  const [indexerChecked, setIndexerChecked] = useState(false);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchPublicTip = async () => {
    try {
      const res = await fetch('/api/chain-tip');
      if (!res.ok) return;
      const data = await res.json() as { height?: number };
      if (typeof data.height === 'number') setPublicTip(data.height);
    } catch { /* network unavailable */ }
  };

  const fetchLocalHeights = async () => {
    try {
      const [walletRes, chainstateRes] = await Promise.all([
        fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'wallet_best_block', params: {} }) }),
        fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'node_chainstate_info', params: {} }) }),
      ]);
      const [walletData, chainstateData] = await Promise.all([
        walletRes.json() as Promise<{ ok: boolean; result?: { height: number } }>,
        chainstateRes.json() as Promise<{ ok: boolean; result?: { best_block_height: number; is_initial_block_download: boolean } }>,
      ]);
      if (walletData.ok && walletData.result)
        setWalletHeight(walletData.result.height);
      if (chainstateData.ok && chainstateData.result) {
        setNodeHeight(chainstateData.result.best_block_height);
        setIsSyncing(chainstateData.result.is_initial_block_download);
      }
    } catch { /* ignore */ }
  };

  const fetchIndexerStatus = async () => {
    try {
      const res  = await fetch('/api/indexer-status');
      const data = await res.json() as { up: boolean; height: number | null };
      setIndexerHeight(data.up ? data.height : null);
    } catch {
      setIndexerHeight(null);
    } finally {
      setIndexerChecked(true);
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPublicTip();
    if (indexerEnabled) fetchIndexerStatus();
    else setIndexerChecked(true);

    const tipInterval     = setInterval(fetchPublicTip,      60_000);
    const indexerInterval = indexerEnabled ? setInterval(fetchIndexerStatus, 15_000) : null;

    const es = new EventSource('/api/block-stream');
    es.onopen    = () => setConnected(true);
    es.onerror   = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string };
        if (msg.type === 'NewBlock') fetchLocalHeights();
      } catch { /* ignore */ }
    };

    return () => {
      clearInterval(tipInterval);
      if (indexerInterval) clearInterval(indexerInterval);
      es.close();
    };
  }, [indexerEnabled]);

  // ── Derived sync state ─────────────────────────────────────────────────────

  // Node: progress against public chain tip (best available reference)
  const nodeTip      = publicTip ?? nodeHeight;
  const nodeProgress = nodeTip > 0 ? Math.min(100, Math.round((nodeHeight / nodeTip) * 100)) : null;
  const nodeInSync   = !isSyncing && (nodeProgress === null || nodeProgress >= 99);

  // Wallet: progress against local node (wallet tracks the node, not the network)
  const walletProgress = nodeHeight > 0 ? Math.min(100, Math.round((walletHeight / nodeHeight) * 100)) : null;
  const walletInSync   = walletHeight >= nodeHeight - 1 && nodeInSync;

  // Indexer: progress against local node
  const indexerProgress = (indexerHeight !== null && nodeHeight > 0)
    ? Math.min(100, Math.round((indexerHeight / nodeHeight) * 100))
    : null;
  const indexerInSync = indexerHeight !== null && indexerHeight >= nodeHeight - 2 && nodeInSync;

  // All synced: node+wallet done, and indexer either synced or not applicable
  const allSynced = indexerChecked
    && nodeInSync
    && walletInSync
    && (!indexerEnabled || indexerHeight === null || indexerInSync);

  // ── Collapsed view ─────────────────────────────────────────────────────────

  if (allSynced) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-5 py-3 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-mint-400">✓</span>
          <span className="text-sm text-gray-200 font-medium">All systems in sync</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-gray-500">#{nodeHeight.toLocaleString()}</span>
          <LiveDot connected={connected} />
        </div>
      </div>
    );
  }

  // ── Expanded view ──────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">System Status</p>
        <LiveDot connected={connected} />
      </div>

      <SyncRow
        label="Node"
        current={nodeHeight}
        target={publicTip ?? null}
        progress={nodeProgress ?? (nodeInSync ? 100 : 0)}
        synced={nodeInSync}
      />

      <SyncRow
        label="Wallet"
        current={walletHeight}
        target={nodeHeight}
        progress={walletProgress ?? 0}
        synced={walletInSync}
      />

      {indexerEnabled && (
        !indexerChecked ? (
          <SyncRow label="Indexer" current={0} target={null} progress={0} synced={false} loading />
        ) : indexerHeight === null ? (
          <SyncRow label="Indexer" current={0} target={null} progress={0} synced={false} offline />
        ) : (
          <SyncRow
            label="Indexer"
            current={indexerHeight}
            target={nodeHeight}
            progress={indexerProgress ?? 0}
            synced={indexerInSync}
          />
        )
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-mint-400 animate-pulse' : 'bg-gray-600'}`} />
      <span className="text-xs text-gray-500">{connected ? 'live' : 'connecting…'}</span>
    </div>
  );
}

function SyncRow({
  label, current, target, progress, synced, offline = false, loading = false,
}: {
  label: string;
  current: number;
  target: number | null;
  progress: number;
  synced: boolean;
  offline?: boolean;
  loading?: boolean;
}) {
  const statusText  = loading ? '…' : offline ? 'offline' : synced ? 'in sync' : `${progress}%`;
  const statusColor = loading ? 'text-gray-600' : offline ? 'text-red-400' : synced ? 'text-mint-400' : 'text-yellow-400';
  const labelColor  = offline ? 'text-red-400' : 'text-gray-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className={`uppercase tracking-wider ${labelColor}`}>{label}</span>
        <span className="font-mono">
          {!offline && !loading && (
            <>
              <span className="text-gray-200">#{current.toLocaleString()}</span>
              {target !== null && (
                <span className="text-gray-500"> / #{target.toLocaleString()}</span>
              )}
            </>
          )}
          <span className={`ml-2 ${statusColor}`}>{statusText}</span>
        </span>
      </div>
      {!offline && (
        <Progress value={loading ? 0 : progress} />
      )}
    </div>
  );
}
