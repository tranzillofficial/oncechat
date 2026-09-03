/**
 * Silent Browser Fingerprinting Generator
 * Calculates a unique device signature using hardware, screen, WebGL, Canvas, timezone, and language.
 * Completely client-side, zero permissions required, works in Incognito/Private mode.
 */
export async function generateSilentFingerprint(): Promise<{ fingerprint: string; deviceInfo: string }> {
  if (typeof window === 'undefined') {
    return { fingerprint: 'server', deviceInfo: '{}' }
  }

  try {
    const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
    const lang = navigator.language || 'unknown'
    const platform = navigator.platform || 'unknown'
    const hardwareConcurrency = navigator.hardwareConcurrency || 1
    const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 'unknown'

    // Silent Canvas Hash
    let canvasHash = 'no-canvas'
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 50
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.textBaseline = 'top'
        ctx.font = "14px 'Arial'"
        ctx.fillStyle = '#f60'
        ctx.fillRect(125, 1, 62, 20)
        ctx.fillStyle = '#069'
        ctx.fillText('OnceChat,🔒1337', 2, 15)
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
        ctx.fillText('OnceChat,🔒1337', 4, 17)
        canvasHash = canvas.toDataURL().slice(-50)
      }
    } catch {
      canvasHash = 'canvas-error'
    }

    // WebGL Renderer Info
    let webglVendor = 'no-webgl'
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (gl && 'getExtension' in gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          webglVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown'
        }
      }
    } catch {
      webglVendor = 'webgl-error'
    }

    // Raw Components string
    const rawSignature = [
      screenRes,
      timeZone,
      lang,
      platform,
      hardwareConcurrency,
      deviceMemory,
      canvasHash,
      webglVendor,
    ].join('||')

    // Crypto Digest SHA-256
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawSignature))
    const fingerprint = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const deviceInfoObj = {
      screen: screenRes,
      timeZone,
      language: lang,
      platform,
      cpuCores: hardwareConcurrency,
      ramGB: deviceMemory,
      gpu: webglVendor,
    }

    return {
      fingerprint,
      deviceInfo: JSON.stringify(deviceInfoObj),
    }
  } catch (err) {
    console.error('[Fingerprint generator error]', err)
    return { fingerprint: 'fallback-fp', deviceInfo: '{}' }
  }
}
