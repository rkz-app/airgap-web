import './style.css'
import { openPlayer, openScanner, ScanCancelledError } from './index.ts'

const app = document.getElementById('app')!
app.innerHTML = `
  <div class="demo">
    <h1>Airgap</h1>
    <p class="demo-sub">Transfer data between air-gapped devices via QR codes.</p>

    <section class="demo-card">
      <h2>Player</h2>
      <p>Encode data into a QR sequence and display it.</p>
      <div class="demo-input">
        <textarea id="demo-text" placeholder="Paste text to encode…"></textarea>
        <div class="demo-drop" id="demo-drop">
          <span id="demo-drop-label">Drop a file here, or click to browse</span>
          <input type="file" id="demo-file" tabindex="-1">
        </div>
      </div>
      <div id="demo-size" class="demo-size hidden"></div>
      <button class="demo-btn demo-btn-primary" id="demo-play">Open Player</button>
    </section>

    <section class="demo-card">
      <h2>Scanner</h2>
      <p>Scan an Airgap QR sequence with your camera.</p>
      <button class="demo-btn demo-btn-primary" id="demo-scan">Open Scanner</button>
      <div id="demo-result" class="demo-result hidden"></div>
    </section>
  </div>
`

// ── File / text input ─────────────────────────────────────────────────────────

let pendingFile: Uint8Array | null = null

const fileInput = document.getElementById('demo-file') as HTMLInputElement
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) loadFile(file)
})

;(document.getElementById('demo-text') as HTMLTextAreaElement).addEventListener('input', e => {
  const text = (e.target as HTMLTextAreaElement).value
  pendingFile = null
  if (text) {
    showSize(new TextEncoder().encode(text).length)
  } else {
    document.getElementById('demo-size')!.classList.add('hidden')
  }
})

const dropZone = document.getElementById('demo-drop')!
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) loadFile(file)
})

function loadFile(file: File): void {
  const reader = new FileReader()
  reader.onload = () => {
    pendingFile = new Uint8Array(reader.result as ArrayBuffer)
    document.getElementById('demo-drop-label')!.textContent = `📎 ${file.name}`
    ;(document.getElementById('demo-text') as HTMLTextAreaElement).value = ''
    showSize(pendingFile.length)
  }
  reader.readAsArrayBuffer(file)
}

function showSize(bytes: number): void {
  const el = document.getElementById('demo-size')!
  el.textContent = formatBytes(bytes)
  el.classList.remove('hidden')
}

function getData(): Uint8Array | null {
  if (pendingFile) return pendingFile
  const text = (document.getElementById('demo-text') as HTMLTextAreaElement).value.trim()
  if (text) return new TextEncoder().encode(text)
  return null
}

// ── Player ────────────────────────────────────────────────────────────────────

document.getElementById('demo-play')!.addEventListener('click', async () => {
  const data = getData()
  if (!data || data.length === 0) {
    alert('Paste some text or drop a file first.')
    return
  }
  await openPlayer(data, "Demo player");
})

// ── Scanner ───────────────────────────────────────────────────────────────────

document.getElementById('demo-scan')!.addEventListener('click', async () => {
  const resultEl = document.getElementById('demo-result')!

  try {
    const data = await openScanner('Scan data');
    const isText = looksLikeText(data)
    resultEl.classList.remove('hidden')
    resultEl.innerHTML = isText
      ? `<strong>Received ${data.length} bytes:</strong><pre>${escHtml(new TextDecoder().decode(data).slice(0, 500))}</pre>`
      : `<strong>Received ${data.length} bytes</strong> of binary data.
         <button class="demo-btn demo-btn-secondary demo-dl" id="demo-dl">Download</button>`

    document.getElementById('demo-dl')?.addEventListener('click', () => {
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'airgap-transfer'; a.click()
      URL.revokeObjectURL(url)
    })
  } catch (err) {
    if (err instanceof ScanCancelledError) return
    resultEl.classList.remove('hidden')
    resultEl.innerHTML = `<span style="color:#FF3B30">Error: ${escHtml(String(err))}</span>`
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function looksLikeText(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length, 512); i++) {
    const b = bytes[i]
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) return false
  }
  return true
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatBytes(n: number): string {
  return `${n.toLocaleString()} bytes`
}
