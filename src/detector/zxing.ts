import type { QRDetector } from './index.ts'
import ZXingWorker from './zxing.worker.ts?worker'

interface DetectResponse {
  id: number
  values: string[]
  error?: string
}

export class ZXingDetector implements QRDetector {
  private worker = new ZXingWorker()
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private nextId = 0
  private pending = new Map<number, (values: string[]) => void>()

  constructor() {
    this.worker.addEventListener('message', (e: MessageEvent<DetectResponse>) => {
      const { id, values } = e.data
      this.pending.get(id)?.(values)
      this.pending.delete(id)
    })
  }

  async detect(video: HTMLVideoElement): Promise<string[]> {
    const { videoWidth: w, videoHeight: h } = video
    if (w === 0 || h === 0) return []

    this.canvas.width  = w
    this.canvas.height = h
    this.ctx.drawImage(video, 0, 0, w, h)

    const imageData = this.ctx.getImageData(0, 0, w, h)

    // Transfer the underlying buffer to avoid a copy in postMessage.
    // We slice first so the canvas ImageData buffer stays intact.
    const buffer = imageData.data.buffer.slice(0)

    return new Promise(resolve => {
      const id = this.nextId++
      this.pending.set(id, resolve)
      this.worker.postMessage({ id, pixels: buffer, width: w, height: h }, [buffer])
    })
  }

  dispose(): void {
    this.worker.terminate()
    this.pending.clear()
  }
}
