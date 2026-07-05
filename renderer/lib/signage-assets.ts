function hasElectronApi(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

/** Image URL for Electron (signage://) or browser (/images/). */
export function imageUrl(imageId: string): string {
  if (hasElectronApi()) {
    return `signage://img/${imageId}`;
  }
  return `/images/${encodeURIComponent(imageId)}`;
}

/** Font URL for Electron (signage://) or browser (/fonts/). */
export function fontUrl(fontId: string): string {
  if (hasElectronApi()) {
    return `signage://font/${fontId}`;
  }
  return `/fonts/${encodeURIComponent(fontId)}`;
}

export function isBrowserSignageMode(): boolean {
  return typeof window !== "undefined" && !hasElectronApi();
}
