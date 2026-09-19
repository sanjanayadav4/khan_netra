import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { FiBell, FiCheck, FiTrash2 } from 'react-icons/fi';
import { notificationsApi } from '../../services/api';
import { timeAgo } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const TYPE_STYLE = {
  alert:     { bar: 'bg-danger-500',  bg: 'hover:bg-danger-600/8  border-l-danger-500' },
  incident:  { bar: 'bg-danger-500',  bg: 'hover:bg-danger-600/8  border-l-danger-500' },
  violation: { bar: 'bg-safety-500',  bg: 'hover:bg-safety-600/8  border-l-safety-500' },
  warning:   { bar: 'bg-amber-500',   bg: 'hover:bg-amber-500/8   border-l-amber-500'  },
  deadline:  { bar: 'bg-amber-400',   bg: 'hover:bg-amber-500/8   border-l-amber-400'  },
  info:      { bar: 'bg-info-500',    bg: 'hover:bg-info-600/8    border-l-info-500'   },
  success:   { bar: 'bg-success-500', bg: 'hover:bg-success-600/8 border-l-success-500'},
};
const TYPE_BADGE = { alert:'red', incident:'red', violation:'orange', warning:'yellow', deadline:'yellow', info:'blue', success:'green' };

export default function Notifications() {
  const [notifs,     setNotifs]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...(filter === 'unread' ? { is_read: false } : filter === 'read' ? { is_read: true } : {}) };
      const r = await notificationsApi.getAll(params);
      setNotifs(r.data);
      setPagination(r.pagination);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter, page]);

  const markRead = async (id) => {
    try { await notificationsApi.markRead(id); setNotifs(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n)); }
    catch {}
  };

  const markAllRead = async () => {
    try { await notificationsApi.markAllRead(); toast.success('All marked as read'); load(); }
    catch {}
  };

  const del = async (id) => {
    try { await notificationsApi.delete(id); setNotifs(prev => prev.filter(n => n.id !== id)); }
    catch {}
  };

  const unread = notifs.filter(n => !n.is_read).length;

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiBell className="text-amber-400" /> Notifications
            {unread > 0 && (
              <span className="px-2 py-0.5 bg-danger-500 text-white text-xs font-black rounded-full shadow-[0_0_8px_rgba(239,68,68,.5)]">
                {unread}
              </span>
            )}
          </h1>
          <p className="page-subtitle">System alerts, compliance deadlines and incident notifications</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-outline btn-sm">
            <FiCheck size={13}/> Mark All Read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="tab-bar">
        {['all','unread','read'].map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={clsx('tab-item capitalize', filter === f && 'active')}>
            {f}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : notifs.length === 0 ? (
        <EmptyState icon={FiBell} title="No notifications" message="You're all caught up!" />
      ) : (
        <div className="space-y-1.5">
          {notifs.map(n => {
            const style = TYPE_STYLE[n.type] || TYPE_STYLE.info;
            return (
              <div key={n.id}
                className={clsx(
                  'flex items-start gap-4 p-4 rounded-xl border-l-4 transition-all',
                  'bg-coal-900/60 border border-coal-700/40',
                  style.bg,
                  !n.is_read && 'bg-coal-800/60',
                )}>
                {/* Left bar color */}
                <div className={clsx('w-1 self-stretch rounded-full shrink-0 -ml-2', style.bar)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-sm text-coal-100">{n.title}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,.6)] shrink-0" />}
                    <Badge color={TYPE_BADGE[n.type] || 'gray'}>{n.type}</Badge>
                    {n.mine_name && <span className="text-[11px] text-coal-600">· {n.mine_name}</span>}
                  </div>
                  <p className="text-sm text-coal-400 leading-relaxed">{n.message}</p>
                  <p className="text-[11px] text-coal-600 mt-1.5">{timeAgo(n.created_at)}</p>
                </div>

                <div className="flex gap-1.5 shrink-0">
                  {!n.is_read && (
                    <button onClick={() => markRead(n.id)}
                      className="p-1.5 rounded-lg text-coal-600 hover:text-success-400 hover:bg-success-600/10 transition-colors" title="Mark read">
                      <FiCheck size={14} />
                    </button>
                  )}
                  <button onClick={() => del(n.id)}
                    className="p-1.5 rounded-lg text-coal-600 hover:text-danger-400 hover:bg-danger-600/10 transition-colors" title="Delete">
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-coal-600">Page {page} of {pagination.pages} · {pagination.total} total</p>
          <div className="flex gap-1.5">
            {page > 1 && <button onClick={() => setPage(p => p-1)} className="btn-outline btn-sm">← Prev</button>}
            {page < pagination.pages && <button onClick={() => setPage(p => p+1)} className="btn-primary btn-sm">Next →</button>}
          </div>
        </div>
      )}
    </div>
  );
}
