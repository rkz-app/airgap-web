import { readBarcodes } from 'zxing-wasm/reader'

interface DetectRequest {
  id: number
  pixels: ArrayBuffer
  width: number
  height: number
}

interface DetectResponse {
  id: number
  values: string[]
  error?: string
}

// Use globalThis to avoid DOM vs WebWorker type conflicts in a shared tsconfig.
const w = globalThis as unknown as {
  addEventListener(type: 'message', handler: (e: MessageEvent<DetectRequest>) => void): void
  postMessage(data: DetectResponse): void
}

w.addEventListener('message', async (e) => {
  const { id, pixels, width, height } = e.data

  try {
    const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
    const results = await readBarcodes(imageData, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    })
    w.postMessage({ id, values: results.map(r => r.text) })
  } catch (err) {
    w.postMessage({ id, values: [], error: String(err) })
  }
})
