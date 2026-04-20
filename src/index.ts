import { ensureWasmReady } from './wasm.ts'
import { openModal } from './modal.ts'
import { PlayerView } from './player.ts'
import { ScannerView } from './scanner.ts'

export { ScanCancelledError }

class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled')
    this.name = 'ScanCancelledError'
  }
}

/**
 * Opens a modal that plays `data` as an animated Airgap QR sequence.
 * The user can configure chunk size, then start/pause/scrub the animation.
 * Resolves when the modal is closed.
 */
export async function openPlayer(data: Uint8Array, title: string): Promise<void> {
  await ensureWasmReady()

  // Use a ref object so TypeScript doesn't narrow `view` to null after the callback.
  const ref = { view: null as PlayerView | null }

  await openModal({ title: title}, (content, _close) => {
    ref.view = new PlayerView(content, data)
  })

  ref.view?.dispose()
}

/**
 * Opens a modal that scans an Airgap QR sequence from the camera.
 * Resolves with the decoded `Uint8Array` when all chunks are received.
 * Rejects with `ScanCancelledError` if the modal is closed before completion.
 */
export async function openScanner(title: string): Promise<Uint8Array> {
  await ensureWasmReady()

  return new Promise((resolve, reject) => {
    let view: ScannerView | null = null
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      fn()
    }

    openModal(
      { title: title, preventBackdropClose: true },
      (content, close) => {
        view = new ScannerView(content, {
          onSuccess: data => settle(() => { close(); resolve(data) }),
          onCancel:  ()   => settle(() => { close(); reject(new ScanCancelledError()) }),
        })

        // If the user hits the X button while scanning, treat it as cancel.
        // openModal resolves its own promise when closed — we hook into that
        // by watching for the modal's close button via the `close` callback.
        // ScannerView.dispose() fires onCancel when still in scanning state.
      },
    ).then(() => {
      // Modal closed (any reason). If not yet settled, the user dismissed via X.
      settle(() => {
        view?.dispose()
        reject(new ScanCancelledError())
      })
    })
  })
}
