/**
 * KhanNetra — Offline / Sync Indicator
 * Shows connection status, pending sync count, and a sync button.
 * Used in the Navbar and the Field Dashboard.
 */
import { FiWifi, FiWifiOff, FiRefreshCw, FiAlertOctagon } from 'react-icons/fi';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function OfflineIndicator({ compact = false }) {
  const {
    isOnline, syncing, pendingCount, failedCount, syncAll,
  } = useOfflineQueue();

  const handleSync = async () => {
    if (!isOnline) {
      toast('No internet connection — records will sync automatically when online', { icon: '📡' });
      return;
    }
    const result = await syncAll();
    if (result) {
      if (result.synced > 0) toast.success(`${result.synced} record${result.synced !== 1 ? 's' : ''} synced`);
      if (result.failed > 0) toast.error(`${result.failed} record${result.failed !== 1 ? 's' : ''} failed — will retry`);
      if (result.synced === 0 && result.failed === 0) toast('Nothing to sync', { icon: 'ℹ️' });
    }
  };

  const total = pendingCount + failedCount;

  /* ── Nothing to show when online and nothing pending ── */
  if (isOnline && total === 0 && !syncing) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-coal-800/40 border border-coal-700/30">
        <FiWifi size={12} className="text-success-400"/>
        <span className="text-[10px] text-coal-500 font-medium">Online</span>
      </div>
    );
  }

  return (
    <div className={clsx(
      'flex items-center gap-1.5 rounded-xl border text-[10px] font-semibold',
      compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
      !isOnline
        ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
        : failedCount > 0
          ? 'bg-danger-600/10 border-danger-500/25 text-danger-400'
          : 'bg-info-600/10 border-info-500/25 text-info-400',
    )}>
      {/* Connection icon */}
      {!isOnline
        ? <FiWifiOff size={11}/>
        : failedCount > 0
          ? <FiAlertOctagon size={11}/>
          : <FiWifi size={11}/>}

      {/* Label */}
      {!isOnline ? (
        <span>
          Offline{total > 0 ? ` · ${total} pending` : ''}
        </span>
      ) : syncing ? (
        <span className="flex items-center gap-1">
          <FiRefreshCw size={10} className="animate-spin"/>
          Syncing…
        </span>
      ) : failedCount > 0 ? (
        <span>{failedCount} failed</span>
      ) : pendingCount > 0 ? (
        <span>{pendingCount} pending</span>
      ) : null}

      {/* Sync button — only when online and something to sync */}
      {isOnline && total > 0 && !syncing && (
        <button
          type="button"
          onClick={handleSync}
          className="ml-0.5 p-0.5 rounded hover:opacity-70 transition-opacity"
          title="Sync now"
        >
          <FiRefreshCw size={10}/>
        </button>
      )}
    </div>
  );
}
