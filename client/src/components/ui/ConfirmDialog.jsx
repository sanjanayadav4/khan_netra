import Modal from './Modal';
import { FiAlertTriangle } from 'react-icons/fi';

export default function ConfirmDialog({
  isOpen, onClose, onConfirm,
  title = 'Confirm Action', message, confirmText = 'Confirm',
  loading = false, danger = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={danger ? 'btn-danger' : 'btn-primary'}>
            {loading ? 'Processing…' : confirmText}
          </button>
        </div>
      }>
      <div className="flex gap-4">
        <div className={`p-3 rounded-xl shrink-0 ${danger ? 'bg-danger-600/15 text-danger-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <FiAlertTriangle size={22} />
        </div>
        <p className="text-coal-400 text-sm leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}
