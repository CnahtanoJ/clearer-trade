/**
 * Generates a deterministic Hardware & Browser Canvas Fingerprint.
 * This remains constant across IP address changes (VPNs/Hotspots), cache clears, and Incognito mode.
 */
export function getHardwareFingerprint(): string {
  if (typeof window === 'undefined') return 'server_instance';

  try {
    // Check if previously cached in localStorage
    const cached = localStorage.getItem('cs_instance_fp');
    if (cached && cached.length === 32) {
      return cached;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let canvasData = '';

    if (ctx) {
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('clearer.trade, <canvas> 1.0', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('clearer.trade, <canvas> 1.0', 4, 17);
      canvasData = canvas.toDataURL();
    }

    // WebGL Vendor/Renderer info
    let webglVendor = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl') || 
                 document.createElement('canvas').getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          webglVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        }
      }
    } catch {
      // Ignore WebGL errors if blocked
    }

    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const cores = navigator.hardwareConcurrency || 4;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

    const rawSignature = `${canvasData}_${webglVendor}_${screenInfo}_${cores}_${timezone}`;
    
    // Simple 32-char hex hash of rawSignature
    let hash = 0;
    for (let i = 0; i < rawSignature.length; i++) {
      const char = rawSignature.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const positiveHash = Math.abs(hash).toString(16).padStart(8, '0');
    
    // Create a 32-character deterministic fingerprint
    const fp = `fp_${positiveHash}_${positiveHash}_${positiveHash}`.slice(0, 32);

    try {
      localStorage.setItem('cs_instance_fp', fp);
    } catch {
      // Storage unavailable in locked incognito
    }

    return fp;
  } catch {
    return 'fp_fallback_default_instance';
  }
}

/**
 * Returns a human-friendly label for the current device and browser.
 * e.g., "Windows (Chrome)", "Mac (Safari)", "iPhone (Mobile Safari)"
 */
export function getDeviceDisplayName(): string {
  if (typeof window === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;

  let platform = 'PC / Device';
  if (ua.includes('Win')) platform = 'Windows PC';
  else if (ua.includes('iPhone')) platform = 'iPhone';
  else if (ua.includes('iPad')) platform = 'iPad';
  else if (ua.includes('Mac')) platform = 'Mac';
  else if (ua.includes('Android')) platform = 'Android Device';
  else if (ua.includes('Linux')) platform = 'Linux PC';

  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  return `${platform} • ${browser}`;
}
