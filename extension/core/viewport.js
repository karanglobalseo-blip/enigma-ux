/**
 * Apply a consistent emulated viewport to a tab for DOM and screenshot analysis.
 * Chrome's debugger API is used because changing the extension window size does
 * not reliably trigger responsive breakpoints in the target tab.
 */

export const VIEWPORT_PRESETS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }
};

export function resolveViewport(settings = {}) {
  if (settings.viewportMode === 'custom') {
    return {
      width: clampDimension(settings.viewportWidth, 320, 3840, 1280),
      height: clampDimension(settings.viewportHeight, 480, 2160, 800),
      deviceScaleFactor: 1,
      mobile: false
    };
  }
  return VIEWPORT_PRESETS[settings.viewportMode] || VIEWPORT_PRESETS.desktop;
}

export async function applyViewport(tabId, settings) {
  const viewport = resolveViewport(settings);
  await chrome.debugger.attach({ tabId }, '1.3');
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', viewport);
    if (viewport.mobile) {
      await chrome.debugger.sendCommand({ tabId }, 'Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5
      });
    }
    return viewport;
  } catch (error) {
    await chrome.debugger.detach({ tabId }).catch(() => {});
    throw error;
  }
}

export async function clearViewport(tabId) {
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
    await chrome.debugger.sendCommand({ tabId }, 'Emulation.setTouchEmulationEnabled', { enabled: false });
  } finally {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  }
}

function clampDimension(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
