import { FiInbox } from 'react-icons/fi';

export default function EmptyState({
  icon: Icon = FiInbox,
  title = 'No data found',
  message = '',
  description = '',
  action,
}) {
  const text = message || description;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}
      >
        <Icon size={24} style={{ color:'var(--text-muted)' }}/>
      </div>
      <h3 className="text-base font-semibold mb-1.5" style={{ color:'var(--text-primary)' }}>{title}</h3>
      {text && <p className="text-sm max-w-xs leading-relaxed" style={{ color:'var(--text-muted)' }}>{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
