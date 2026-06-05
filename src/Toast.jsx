import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

let toastId = 0
let addToastFn = null

export function useToast() {
  const toast = useCallback((message, type = 'success') => {
    addToastFn?.({ id: ++toastId, message, type })
  }, [])
  return toast
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    addToastFn = (t) => {
      try {
        const prefs = JSON.parse(localStorage.getItem('pf_prefs') || '{}')
        const toastOnSave = prefs.toastOnSave !== undefined ? prefs.toastOnSave : true
        if (!toastOnSave && t.type === 'success') return
      } catch {}
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000)
    }
    return () => { addToastFn = null }
  }, [])

  if (!toasts.length) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success'
            ? <CheckCircle size={14} color="var(--green)" />
            : <XCircle size={14} color="var(--red)" />}
          {t.message}
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="icon-btn" style={{ marginLeft: 4 }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
