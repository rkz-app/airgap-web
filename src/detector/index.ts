import { BarcodeDetectorImpl, isBarcodeDetectorAvailable } from './barcode.ts'
import { ZXingDetector } from './zxing.ts'

/**
 * Abstraction over QR code scanning backends.
 * Implementations must be safe to call concurrently — detect() calls may
 * overlap if the consumer doesn't await each one.
 */
export interface QRDetector {
  /** Scan one video frame and return all decoded QR strings found. */
  detect(video: HTMLVideoElement): Promise<string[]>
  /** Release any held resources (workers, streams, etc.). */
  dispose(): void
}

/**
 * Returns the best available QR detector for this browser:
 * - BarcodeDetector if the native API is present and supports qr_code
 * - ZXing (Web Worker, zxing-wasm) otherwise
 */
export async function createDetector(): Promise<QRDetector> {
  if (await isBarcodeDetectorAvailable()) {
    return new BarcodeDetectorImpl()
  }
  return new ZXingDetector()
}
