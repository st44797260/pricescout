import Modal from './Modal.jsx'

/** 删除确认对话框（复用 Modal） */
export default function ConfirmDialog({
  open,
  title = '确认操作',
  description,
  confirmText = '删除',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-sm">
      <p className="text-sm leading-6 text-ink-muted">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button
          type="button"
          className="btn bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? '删除中…' : confirmText}
        </button>
      </div>
    </Modal>
  )
}
