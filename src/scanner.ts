import { WasmDecoder } from 'airgap'
import type { QRDetector } from './detector/index.ts'
import { createDetector } from './detector/index.ts'

type State =
  | { type: 'idle' }
  | { type: 'scanning'; received: number; total: number }
  | { type: 'processing' }
  | { type: 'success'; data: Uint8Array }
  | { type: 'error'; message: string }

export interface ScannerCallbacks {
  onSuccess: (data: Uint8Array) => void
  onCancel:  () => void
}

const STYLES = `
.ag-scanner { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ag-sc-idle, .ag-sc-success, .ag-sc-error {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px;
  padding: 32px 24px 28px; text-align: center;
  flex: 1; min-height: 0;
}
.ag-sc-h2 {
  font: 700 20px/1.2 system-ui,-apple-system,sans-serif;
  color: #000; letter-spacing: -0.3px;
}
@media (prefers-color-scheme: dark) { .ag-sc-h2 { color: #fff; } }
.ag-sc-p {
  font: 15px system-ui,-apple-system,sans-serif;
  color: rgba(60,60,67,0.6); max-width: 280px;
}
@media (prefers-color-scheme: dark) { .ag-sc-p { color: rgba(235,235,245,0.6); } }
.ag-sc-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; color: #fff; flex-shrink: 0;
}
.ag-sc-active { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ag-camera-wrap { position: relative; flex: 1; min-height: 0; background: #000; overflow: hidden; }
.ag-camera-wrap video { width: 100%; height: 100%; object-fit: cover; display: block; }
.ag-camera-overlay {
  position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; pointer-events: none;
}
.ag-scan-frame { width: 200px; height: 200px; position: relative; }
.ag-scan-frame::before, .ag-scan-frame::after,
.ag-scan-frame > span::before, .ag-scan-frame > span::after {
  content: ''; position: absolute;
  width: 22px; height: 22px; border-color: #fff; border-style: solid;
}
.ag-scan-frame::before      { top:0;    left:0;   border-width:3px 0 0 3px; border-radius:4px 0 0 0; }
.ag-scan-frame::after       { top:0;    right:0;  border-width:3px 3px 0 0; border-radius:0 4px 0 0; }
.ag-scan-frame > span::before { bottom:0; left:0;   border-width:0 0 3px 3px; border-radius:0 0 0 4px; }
.ag-scan-frame > span::after  { bottom:0; right:0;  border-width:0 3px 3px 0; border-radius:0 0 4px 0; }
.ag-progress {
  padding: 14px 20px;
  background: rgba(0,0,0,0.03);
  border-top: 1px solid rgba(0,0,0,0.08);
  display: flex; flex-direction: column; gap: 8px;
}
@media (prefers-color-scheme: dark) {
  .ag-progress { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
}
.ag-progress-row {
  display: flex; justify-content: space-between;
  font: 13px system-ui,-apple-system,sans-serif;
  color: rgba(60,60,67,0.6);
}
@media (prefers-color-scheme: dark) { .ag-progress-row { color: rgba(235,235,245,0.6); } }
.ag-progress-row strong { color: #000; }
@media (prefers-color-scheme: dark) { .ag-progress-row strong { color: #fff; } }
.ag-progress-track { height: 5px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; }
@media (prefers-color-scheme: dark) { .ag-progress-track { background: rgba(255,255,255,0.1); } }
.ag-progress-fill { height: 100%; background: #007AFF; border-radius: 3px; transition: width 0.3s ease; }
.ag-sc-footer { padding: 12px 20px 16px; }
.ag-sc-btn {
  border: none; border-radius: 14px;
  font: 600 16px system-ui,-apple-system,sans-serif;
  cursor: pointer; padding: 13px 20px; width: 100%;
  transition: opacity 0.15s;
}
.ag-sc-btn:active { opacity: 0.75; }
.ag-sc-btn-primary   { background: #007AFF; color: #fff; }
.ag-sc-btn-secondary { background: rgba(0,0,0,0.06); color: #000; }
@media (prefers-color-scheme: dark) {
  .ag-sc-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
}
.ag-sc-actions { display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 300px; }
.ag-sc-preview {
  background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08); border-radius: 10px;
  padding: 10px 12px; font: 13px/1.4 ui-monospace,monospace;
  color: rgba(60,60,67,0.8); max-height: 72px; overflow: hidden;
  word-break: break-all; white-space: pre-wrap; text-align: left; width: 100%; max-width: 300px;
}
@media (prefers-color-scheme: dark) {
  .ag-sc-preview { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: rgba(235,235,245,0.6); }
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

export class ScannerView {
  private el: HTMLElement
  private callbacks: ScannerCallbacks
  private state: State = { type: 'idle' }
  private decoder: WasmDecoder | null = null
  private detector: QRDetector | null = null
  private stream: MediaStream | null = null
  private rafId: number | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastQR = ''

  constructor(container: HTMLElement, callbacks: ScannerCallbacks) {
    injectStyles()
    this.el = container
    this.callbacks = callbacks
    this.renderState()
  }

  // ── State machine ─────────────────────────────────────────────────────────

  private transition(next: State): void {
    this.state = next
    this.renderState()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private renderState(): void {
    const s = this.state

    switch (s.type) {
      case 'idle':
        this.el.innerHTML = `
          <div class="ag-scanner ag-sc-idle">
            <div class="ag-sc-icon" style="background:#007AFF">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <path d="M14 14h3v3M17 17h3v3M14 20v3"/>
              </svg>
            </div>
            <h2 class="ag-sc-h2">Ready to Scan</h2>
            <p class="ag-sc-p">Point your camera at an Airgap QR sequence to receive data.</p>
            <button class="ag-sc-btn ag-sc-btn-primary" id="sc-start">Start Scanning</button>
          </div>
        `
        this.q('#sc-start').addEventListener('click', () => this.startScanning())
        break

      case 'scanning':
        this.el.innerHTML = `
          <div class="ag-scanner ag-sc-active">
            <div class="ag-camera-wrap">
              <video id="sc-video" autoplay playsinline muted></video>
              <div class="ag-camera-overlay">
                <div class="ag-scan-frame"><span></span></div>
              </div>
            </div>
            <div class="ag-progress">
              <div class="ag-progress-row">
                <strong id="sc-chunks">${s.received} / ${s.total || '?'} chunks</strong>
                <span id="sc-pct">${s.total ? Math.round(s.received / s.total * 100) : 0}%</span>
              </div>
              <div class="ag-progress-track">
                <div class="ag-progress-fill" id="sc-bar" style="width:${s.total ? s.received / s.total * 100 : 0}%"></div>
              </div>
            </div>
            <div class="ag-sc-footer">
              <button class="ag-sc-btn ag-sc-btn-secondary" id="sc-stop">Cancel</button>
            </div>
          </div>
        `
        this.q('#sc-stop').addEventListener('click', () => this.cancel())

        const video = this.q<HTMLVideoElement>('#sc-video')
        if (this.stream) { video.srcObject = this.stream; video.play().catch(() => {}) }
        break

      case 'processing':
        this.el.innerHTML = `
          <div class="ag-scanner ag-sc-idle">
            <div class="ag-spinner" style="width:44px;height:44px;border-width:4px"></div>
            <p class="ag-sc-p">Decoding data…</p>
          </div>
        `
        break

      case 'success': {
        const { data } = s
        const isText = looksLikeText(data)
        const preview = isText
          ? new TextDecoder().decode(data.slice(0, 200))
          : `Binary — ${formatBytes(data.length)}`

        this.el.innerHTML = `
          <div class="ag-scanner ag-sc-success">
            <div class="ag-sc-icon" style="background:#34C759">✓</div>
            <h2 class="ag-sc-h2">Transfer Complete</h2>
            <p class="ag-sc-p">${formatBytes(data.length)} received.</p>
            <div class="ag-sc-preview">${escapeHtml(preview)}${data.length > 200 ? '…' : ''}</div>
            <div class="ag-sc-actions">
              ${isText ? `<button class="ag-sc-btn ag-sc-btn-secondary" id="sc-copy">Copy Text</button>` : ''}
              <button class="ag-sc-btn ag-sc-btn-secondary" id="sc-download">Download</button>
            </div>
          </div>
        `
        this.q<HTMLButtonElement>('#sc-copy')?.addEventListener('click', async () => {
          await navigator.clipboard.writeText(new TextDecoder().decode(data))
          const btn = this.q<HTMLButtonElement>('#sc-copy')
          btn.textContent = 'Copied!'
          setTimeout(() => { btn.textContent = 'Copy Text' }, 2000)
        })
        this.q<HTMLButtonElement>('#sc-download')?.addEventListener('click', () => downloadBlob(data))
        break
      }

      case 'error':
        this.el.innerHTML = `
          <div class="ag-scanner ag-sc-error">
            <div class="ag-sc-icon" style="background:#FF3B30">✕</div>
            <h2 class="ag-sc-h2">Scanning Failed</h2>
            <p class="ag-sc-p">${escapeHtml(s.message)}</p>
            <button class="ag-sc-btn ag-sc-btn-secondary" id="sc-retry">Try Again</button>
          </div>
        `
        this.q('#sc-retry').addEventListener('click', () => {
          this.transition({ type: 'idle' })
        })
        break
    }
  }

  // ── Scanning logic ────────────────────────────────────────────────────────

  private async startScanning(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
    } catch {
      this.transition({ type: 'error', message: 'Camera access denied. Please allow camera permission and try again.' })
      return
    }

    try {
      this.detector = await createDetector()
    } catch (err) {
      this.releaseStream()
      this.transition({ type: 'error', message: `Failed to initialize QR detector: ${err}` })
      return
    }

    this.decoder = new WasmDecoder()
    this.lastQR = ''
    this.transition({ type: 'scanning', received: 0, total: 0 })
    this.scheduleFrame()
  }

  private cancel(): void {
    this.teardown()
    this.callbacks.onCancel()
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame(() => this.scanFrame())
  }

  private cancelFrame(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
    if (this.debounceTimer !== null) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
  }

  private async scanFrame(): Promise<void> {
    if (this.state.type !== 'scanning') return

    const video = this.el.querySelector<HTMLVideoElement>('#sc-video')
    if (!video || video.readyState < 2) { this.scheduleFrame(); return }

    let values: string[] = []
    try { values = await this.detector!.detect(video) } catch { /* skip bad frames */ }

    for (const qrStr of values) {
      if (qrStr === this.lastQR) continue
      this.lastQR = qrStr
      this.handleQR(qrStr)
      if (this.state.type !== 'scanning') return
    }

    this.debounceTimer = setTimeout(() => this.scheduleFrame(), 100)
  }

  private handleQR(qrStr: string): void {
    if (!this.decoder) return

    let result
    try {
      result = this.decoder.process_qr(qrStr)
    } catch {
      return // not an Airgap QR / wrong session — ignore
    }

    const received = this.decoder.received_count()
    const total    = this.decoder.total_count()
    this.updateProgress(received, total)

    if (this.decoder.is_complete()) {
      this.cancelFrame()
      this.releaseStream()
      this.detector?.dispose()
      this.detector = null
      this.transition({ type: 'processing' })

      setTimeout(() => {
        try {
          const data = this.decoder!.get_data()
          this.decoder!.free()
          this.decoder = null
          this.transition({ type: 'success', data })
          this.callbacks.onSuccess(data)
        } catch (err) {
          this.transition({ type: 'error', message: String(err) })
        }
      }, 80)
    }

    result.free()
  }

  private updateProgress(received: number, total: number): void {
    const chunksEl = this.el.querySelector<HTMLElement>('#sc-chunks')
    if (!chunksEl) return
    const pct = total ? Math.round(received / total * 100) : 0
    chunksEl.textContent = `${received} / ${total || '?'} chunks`
    const pctEl = this.el.querySelector<HTMLElement>('#sc-pct')
    const barEl = this.el.querySelector<HTMLElement>('#sc-bar')
    if (pctEl) pctEl.textContent = `${pct}%`
    if (barEl) barEl.style.width = `${pct}%`
    this.state = { type: 'scanning', received, total }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Call when the modal is closed externally (e.g. user clicks X). */
  dispose(): void {
    if (this.state.type === 'scanning') this.callbacks.onCancel()
    this.teardown()
  }

  private teardown(): void {
    this.cancelFrame()
    this.releaseStream()
    this.detector?.dispose()
    this.detector = null
    this.decoder?.free()
    this.decoder = null
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.el.querySelector<T>(sel)!
  }
}

// ── Module-level helpers (no `this` needed) ───────────────────────────────────

function looksLikeText(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length, 512); i++) {
    const b = bytes[i]
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) return false
  }
  return true
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function downloadBlob(bytes: Uint8Array): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'airgap-transfer'; a.click()
  URL.revokeObjectURL(url)
}
