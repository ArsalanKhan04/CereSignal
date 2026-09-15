/**
 * Desktop (Electron) detection. main.js hands its own window a per-launch secret via
 * preload.js, and its presence is what marks the desktop app. Read at call time rather
 * than from the build-time REACT_APP_DESKTOP, so one bundle serves web and desktop.
 */
export function getDesktopSecret(): string | undefined {
  return (window as any).electron?.desktopSecret || undefined;
}
