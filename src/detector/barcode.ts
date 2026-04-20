import type { QRDetector } from './index.ts'

// BarcodeDetector is not yet in all TS DOM lib versions — declare it locally.
declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  detect(source: HTMLVideoElement | ImageBitmap | ImageData): Promise<Array<{ rawValue: string }>>
  static getSupportedFormats(): Promise<string[]>
}

/** Returns true if the native BarcodeDetector API is present and supports QR. */
export async function isBarcodeDetectorAvailable(): Promise<boolean> {
  if (typeof BarcodeDetector === 'undefined') return false
  try {
    const formats = await BarcodeDetector.getSupportedFormats()
    return formats.includes('qr_code')
  } catch {
    return false
  }
}

export class BarcodeDetectorImpl implements QRDetector {
  private detector = new BarcodeDetector({ formats: ['qr_code'] })

  async detect(video: HTMLVideoElement): Promise<string[]> {
    const results = await this.detector.detect(video)
    return results.map(r => r.rawValue)
  }

  dispose(): void {
    // nothing to release
  }
}
