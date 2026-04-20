import init from 'airgap'

let promise: Promise<void> | null = null

export function ensureWasmReady(): Promise<void> {
  promise ??= init().then(() => {})
  return promise
}
