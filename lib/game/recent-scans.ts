// M1-write (B): records successful summons for A's ScanHistory renderer.
// Key/schema owned by the M1 contract: arena:recent-scans, max 8 newest-first.
export type RecentScan = {
  ts: number;
  mode: "exam" | "life";
  skill: string;
  bossId: string;
  thumb: string;
};

const KEY = "arena:recent-scans";
const MAX = 8;

export function recordRecentScan(entry: RecentScan): void {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? (parsed as RecentScan[]) : [];
    list.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Private mode or quota: history just doesn't persist.
  }
}

// Downscales any image to a tiny jpeg dataURL (longest side <= size px).
export function makeThumb(file: File, size = 96): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const s = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * s));
          c.height = Math.max(1, Math.round(img.naturalHeight * s));
          const ctx = c.getContext("2d");
          if (!ctx) return resolve("");
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.7));
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve("");
    try {
      reader.readAsDataURL(file);
    } catch {
      resolve("");
    }
  });
}
