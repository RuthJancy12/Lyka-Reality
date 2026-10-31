/**
 * Precise device location, permission-gated (pure wrapper, unit-testable).
 *
 * The app never tracks location in the background. This helper is only
 * called from an explicit "Use my current location" tap, which lets the
 * browser show its own permission prompt first. Coordinates are returned
 * to the caller for on-device use only — they are NEVER included in the
 * SQL profile payload (the profile keeps using the community the customer
 * typed). Denials and unsupported browsers resolve honestly instead of
 * throwing, so callers fall back to the entered location.
 */

export type DeviceLocationResult =
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' | 'unavailable' | 'timeout' | 'unsupported'; message: string }

/**
 * Asks the browser for one precise fix. Resolves (never rejects) so UI
 * flows always land on a clear state.
 */
export function requestDeviceLocation(timeoutMs = 10000): Promise<DeviceLocationResult> {
  return new Promise((resolve) => {
    try {
      const geo =
        typeof navigator !== 'undefined' ? navigator.geolocation : undefined
      if (!geo || typeof geo.getCurrentPosition !== 'function') {
        resolve({ status: 'unsupported', message: 'Precise location is not available on this device — using your entered location.' })
        return
      }
      let settled = false
      const done = (r: DeviceLocationResult) => {
        if (!settled) {
          settled = true
          resolve(r)
        }
      }
      const timer: ReturnType<typeof setTimeout> | null =
        typeof setTimeout !== 'undefined'
          ? setTimeout(() => done({ status: 'timeout', message: 'Location request timed out — using your entered location.' }), timeoutMs)
          : null
      geo.getCurrentPosition(
        (pos) => {
          if (timer) clearTimeout(timer)
          done({
            status: 'granted',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
        },
        (err) => {
          if (timer) clearTimeout(timer)
          if (err && typeof err.code === 'number' && err.code === 1) {
            done({ status: 'denied', message: 'Location permission was declined — using your entered location.' })
          } else if (err && typeof err.code === 'number' && err.code === 3) {
            done({ status: 'timeout', message: 'Location request timed out — using your entered location.' })
          } else {
            done({ status: 'unavailable', message: 'Precise location is unavailable — using your entered location.' })
          }
        },
        { timeout: timeoutMs, maximumAge: 60000 }
      )
    } catch {
      resolve({ status: 'unavailable', message: 'Precise location is unavailable — using your entered location.' })
    }
  })
}
