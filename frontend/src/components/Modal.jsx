import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();
    document.body.classList.add('modal-open');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const items = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('modal-open');
      previousFocusRef.current?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>{title}</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
