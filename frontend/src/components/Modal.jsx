import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// Native dialogs contain focus and make background content inert.
export default function Modal({ title, onClose, children, wide, busy = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    dialog.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={ref} className={`modal app-dialog${wide ? ' wide' : ''}`}
      aria-labelledby={titleId} aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const elements = [...ref.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="modal-head">
        <h3 id={titleId}>{title}</h3>
        <button type="button" className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>, document.body,
  );
}
