const STYLES = `
.ag-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  animation: ag-fade-in 0.18s ease;
}
@keyframes ag-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.ag-modal {
  background: var(--ag-bg, #fff);
  border-radius: 20px;
  /* 3:4 portrait — height drives the size, width is derived */
  height: 90svh;
  width: min(calc(90svh * 3 / 4), calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ag-pop-in 0.22s cubic-bezier(0.34,1.2,0.64,1);
  position: relative;
}
@media (prefers-color-scheme: dark) {
  .ag-modal { --ag-bg: #1c1c1e; }
}
@keyframes ag-pop-in {
  from { transform: scale(0.93); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.ag-modal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0;
  flex-shrink: 0;
}
.ag-modal-title {
  font: 600 17px/1 system-ui,-apple-system,sans-serif;
  color: var(--ag-text, #000);
  letter-spacing: -0.2px;
}
@media (prefers-color-scheme: dark) {
  .ag-modal-title { --ag-text: #fff; }
}
.ag-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(120,120,128,0.16);
  color: var(--ag-text2, #3c3c43);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.ag-close:hover { opacity: 0.7; }
@media (prefers-color-scheme: dark) {
  .ag-close { color: rgba(235,235,245,0.6); }
}
.ag-modal-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}
`

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const el = document.createElement('style')
  el.textContent = STYLES
  document.head.appendChild(el)
}

export interface ModalOptions {
  title: string
  /** If true, clicking the backdrop does not close the modal. */
  preventBackdropClose?: boolean
}

/**
 * Opens a modal and calls `mount(content, close)` to populate it.
 * Returns a promise that resolves when the modal closes.
 */
export function openModal(
  options: ModalOptions,
  mount: (content: HTMLElement, close: () => void) => void,
): Promise<void> {
  injectStyles()

  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    backdrop.className = 'ag-backdrop'

    backdrop.innerHTML = `
      <div class="ag-modal" role="dialog" aria-modal="true" aria-label="${options.title}">
        <div class="ag-modal-bar">
          <span class="ag-modal-title">${options.title}</span>
          <button class="ag-close" aria-label="Close">✕</button>
        </div>
        <div class="ag-modal-content"></div>
      </div>
    `

    const content = backdrop.querySelector<HTMLElement>('.ag-modal-content')!
    const modal   = backdrop.querySelector<HTMLElement>('.ag-modal')!

    function close(): void {
      backdrop.removeEventListener('keydown', onKey)
      backdrop.remove()
      resolve()
    }

    backdrop.querySelector('.ag-close')!.addEventListener('click', close)

    if (!options.preventBackdropClose) {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) close()
      })
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.preventDefault(); close() }
    }
    document.addEventListener('keydown', onKey)

    // Trap focus inside the modal
    modal.setAttribute('tabindex', '-1')
    document.body.appendChild(backdrop)
    modal.focus()

    mount(content, close)
  })
}
