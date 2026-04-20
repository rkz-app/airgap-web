import { WasmEncoder } from 'airgap'

type State = 'config' | 'building' | 'paused' | 'playing'

const DEFAULT_CHUNK_SIZE = 460
const DEFAULT_QR_SIZE    = 400
const MIN_INTERVAL_MS    = 100

const STYLES = `
.ag-player { display:flex; flex-direction:column; flex:1; min-height:0; }
.ag-display {
  background: rgba(0,0,0,0.04);
  border-bottom: 1px solid rgba(0,0,0,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 16px;
}
@media (prefers-color-scheme: dark) {
  .ag-display { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
}
.ag-display img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
}
.ag-display-msg {
  color: rgba(60,60,67,0.6);
  font: 15px system-ui,-apple-system,sans-serif;
  text-align: center;
}
@media (prefers-color-scheme: dark) {
  .ag-display-msg { color: rgba(235,235,245,0.6); }
}
.ag-spinner {
  width: 28px; height: 28px;
  border: 3px solid rgba(0,0,0,0.1);
  border-top-color: #007AFF;
  border-radius: 50%;
  animation: ag-spin 0.7s linear infinite;
}
@media (prefers-color-scheme: dark) {
  .ag-spinner { border-color: rgba(255,255,255,0.1); border-top-color: #0A84FF; }
}
@keyframes ag-spin { to { transform: rotate(360deg); } }
.ag-config { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; }
.ag-config-label {
  font: 13px system-ui,-apple-system,sans-serif;
  color: rgba(60,60,67,0.8);
  display: flex; flex-direction: column; gap: 6px;
}
@media (prefers-color-scheme: dark) {
  .ag-config-label { color: rgba(235,235,245,0.6); }
}
.ag-config-label strong { color: #000; font-size: 14px; }
@media (prefers-color-scheme: dark) {
  .ag-config-label strong { color: #fff; }
}
.ag-chunk-range { width: 100%; accent-color: #007AFF; cursor: pointer; }
.ag-controls { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 14px; border-top: 1px solid rgba(0,0,0,0.08); }
@media (prefers-color-scheme: dark) {
  .ag-controls { border-color: rgba(255,255,255,0.08); }
}
.ag-btns-row {
  display: flex; align-items: center; justify-content: center; gap: 20px;
}
.ag-ctrl {
  border: none;
  background: rgba(0,0,0,0.06);
  color: #000;
  width: 48px; height: 48px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s;
}
@media (prefers-color-scheme: dark) {
  .ag-ctrl { background: rgba(255,255,255,0.1); color: #fff; }
}
.ag-ctrl:active  { opacity: 0.6; }
.ag-ctrl:disabled { opacity: 0.25; cursor: default; }
.ag-ctrl.primary {
  width: 60px; height: 60px; font-size: 24px;
  background: #007AFF; color: #fff;
}
.ag-meta-row {
  display: flex; align-items: center; gap: 12px;
}
.ag-speed-label {
  font: 13px system-ui,-apple-system,sans-serif;
  color: rgba(60,60,67,0.8);
  display: flex; align-items: center; gap: 8px; flex: 1;
}
@media (prefers-color-scheme: dark) {
  .ag-speed-label { color: rgba(235,235,245,0.6); }
}
.ag-speed-label strong { min-width: 36px; color: #000; font-size: 13px; }
@media (prefers-color-scheme: dark) {
  .ag-speed-label strong { color: #fff; }
}
.ag-speed-range { flex: 1; accent-color: #007AFF; cursor: pointer; }
.ag-counter {
  font: 600 13px system-ui,-apple-system,sans-serif;
  color: rgba(60,60,67,0.6);
  min-width: 52px; text-align: right;
}
@media (prefers-color-scheme: dark) {
  .ag-counter { color: rgba(235,235,245,0.5); }
}
.ag-btn {
  border: none; border-radius: 14px;
  font: 600 16px system-ui,-apple-system,sans-serif;
  cursor: pointer;
  padding: 14px 20px;
  width: 100%;
  transition: opacity 0.15s;
}
.ag-btn:active { opacity: 0.75; }
.ag-btn:disabled { opacity: 0.3; cursor: default; }
.ag-btn-primary   { background: #007AFF; color: #fff; }
.ag-btn-secondary { background: rgba(0,0,0,0.06); color: #000; }
@media (prefers-color-scheme: dark) {
  .ag-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
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

export class PlayerView {
  private el: HTMLElement
  private state: State = 'config'
  private images: string[] = []
  private currentIndex = 0
  private frameRate = 1.0
  private chunkSize = DEFAULT_CHUNK_SIZE
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly data: Uint8Array

  constructor(container: HTMLElement, data: Uint8Array) {
    this.data = data
    injectStyles()
    this.el = container
    this.render()
    this.attachEvents()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private render(): void {
    this.el.innerHTML = `
      <div class="ag-player">
        <div class="ag-display" id="agp-display">
          <p class="ag-display-msg">Configure settings and build QR codes</p>
        </div>

        <div class="ag-config" id="agp-config">
          <label class="ag-config-label">
            Chunk size: <strong id="agp-chunk-val">${DEFAULT_CHUNK_SIZE} bytes</strong>
            <input class="ag-chunk-range" type="range" id="agp-chunk"
              min="16" max="1920" value="${DEFAULT_CHUNK_SIZE}" step="16">
          </label>
          <button class="ag-btn ag-btn-primary" id="agp-build">Build QR Codes</button>
        </div>

        <div class="ag-controls" id="agp-controls" style="display:none">
          <div class="ag-btns-row">
            <button class="ag-ctrl" id="agp-prev" title="Previous">&#9664;&#9664;</button>
            <button class="ag-ctrl primary" id="agp-play" title="Play">&#9654;</button>
            <button class="ag-ctrl" id="agp-next" title="Next">&#9654;&#9654;</button>
          </div>
          <div class="ag-meta-row">
            <label class="ag-speed-label">
              Speed <strong id="agp-speed-val">1.0x</strong>
              <input class="ag-speed-range" type="range" id="agp-speed" min="1" max="4" value="1" step="0.5">
            </label>
            <span class="ag-counter" id="agp-counter">1 / 1</span>
          </div>
          <button class="ag-btn ag-btn-secondary" id="agp-rebuild">Rebuild</button>
        </div>
      </div>
    `
  }

  private attachEvents(): void {
    this.q<HTMLInputElement>('#agp-chunk').addEventListener('input', e => {
      this.chunkSize = +(e.target as HTMLInputElement).value
      this.q('#agp-chunk-val').textContent = `${this.chunkSize} bytes`
    })

    this.q('#agp-build').addEventListener('click', () => this.build())
    this.q('#agp-play').addEventListener('click', () => this.togglePlay())
    this.q('#agp-prev').addEventListener('click', () => this.step(-1))
    this.q('#agp-next').addEventListener('click', () => this.step(1))
    this.q('#agp-rebuild').addEventListener('click', () => this.rebuild())

    this.q<HTMLInputElement>('#agp-speed').addEventListener('input', e => {
      this.frameRate = +(e.target as HTMLInputElement).value
      this.q('#agp-speed-val').textContent = `${this.frameRate.toFixed(1)}x`
      if (this.state === 'playing') this.startTimer()
    })
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private async build(): Promise<void> {
    this.setState('building')
    this.showLoading('Building QR codes…')
    this.freeImages()

    await new Promise(r => setTimeout(r, 30))

    try {
      const encoder = new WasmEncoder(this.data, this.chunkSize, DEFAULT_QR_SIZE)
      const count = encoder.chunk_count()
      const urls: string[] = []

      for (let i = 0; i < count; i++) {
        const png = encoder.generate_png(i)
        urls.push(URL.createObjectURL(new Blob([png.buffer as ArrayBuffer], { type: 'image/png' })))
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 0))
      }

      encoder.free()
      this.images = urls
      this.currentIndex = 0
      this.setState('paused')
      this.showCurrentImage()
      this.updateControls()
    } catch (err) {
      this.setState('config')
      this.showMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  private togglePlay(): void {
    if (this.state === 'playing') {
      this.stopTimer()
      this.setState('paused')
      this.updateControls()
    } else {
      if (this.currentIndex >= this.images.length - 1) this.currentIndex = 0
      this.setState('playing')
      this.startTimer()
      this.updateControls()
    }
  }

  private startTimer(): void {
    this.stopTimer()
    const ms = Math.max(MIN_INTERVAL_MS, Math.round(1000 / this.frameRate))
    this.timer = setInterval(() => {
      this.currentIndex++
      if (this.currentIndex >= this.images.length) {
        this.currentIndex = this.images.length - 1
        this.stopTimer()
        this.setState('paused')
        this.updateControls()
        return
      }
      this.showCurrentImage()
      this.updateCounter()
    }, ms)
  }

  private stopTimer(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null }
  }

  private step(dir: -1 | 1): void {
    if (this.state === 'playing') { this.stopTimer(); this.setState('paused') }
    this.currentIndex = Math.max(0, Math.min(this.images.length - 1, this.currentIndex + dir))
    this.showCurrentImage()
    this.updateCounter()
    this.updateControls()
  }

  private rebuild(): void {
    this.stopTimer()
    this.freeImages()
    this.currentIndex = 0
    this.setState('config')
    this.render()
    this.attachEvents()
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  private showCurrentImage(): void {
    const display = this.q<HTMLElement>('#agp-display')
    let img = display.querySelector<HTMLImageElement>('img')
    if (!img) {
      display.innerHTML = ''
      img = document.createElement('img')
      img.alt = 'QR code'
      display.appendChild(img)
    }
    img.src = this.images[this.currentIndex]
    this.updateCounter()
  }

  private showMessage(msg: string): void {
    this.q('#agp-display').innerHTML = `<p class="ag-display-msg">${msg}</p>`
  }

  private showLoading(msg: string): void {
    this.q('#agp-display').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px">
        <div class="ag-spinner"></div>
        <p class="ag-display-msg">${msg}</p>
      </div>
    `
  }

  private updateCounter(): void {
    const el = this.el.querySelector<HTMLElement>('#agp-counter')
    if (el) el.textContent = `${this.currentIndex + 1} / ${this.images.length}`
  }

  private updateControls(): void {
    const play = this.el.querySelector<HTMLButtonElement>('#agp-play')
    if (!play) return
    const atEnd = this.currentIndex >= this.images.length - 1

    if (this.state === 'playing') {
      play.innerHTML = '&#9646;&#9646;'
      play.title = 'Pause'
    } else if (atEnd && this.images.length > 0) {
      play.innerHTML = '&#8635;'
      play.title = 'Replay'
    } else {
      play.innerHTML = '&#9654;'
      play.title = 'Play'
    }

    const prev = this.el.querySelector<HTMLButtonElement>('#agp-prev')
    const next = this.el.querySelector<HTMLButtonElement>('#agp-next')
    if (prev) prev.disabled = this.currentIndex === 0
    if (next) next.disabled = atEnd
    this.updateCounter()
  }

  private setState(s: State): void {
    this.state = s
    const config   = this.el.querySelector<HTMLElement>('#agp-config')
    const controls = this.el.querySelector<HTMLElement>('#agp-controls')
    if (!config || !controls) return

    const showConfig = s === 'config' || s === 'building'
    config.style.display   = showConfig ? '' : 'none'
    controls.style.display = showConfig ? 'none' : ''

    const buildBtn = config.querySelector<HTMLButtonElement>('#agp-build')
    if (buildBtn) buildBtn.disabled = s === 'building'
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Call when the view is being removed (e.g. modal close). */
  dispose(): void {
    this.stopTimer()
    this.freeImages()
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private freeImages(): void {
    this.images.forEach(u => URL.revokeObjectURL(u))
    this.images = []
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.el.querySelector<T>(sel)!
  }
}
