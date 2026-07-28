/** Matches app utils/seedr-torrent.ts helpers. */

export function parseSeedrTorrentProgress(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw));
  }
  if (typeof raw === 'string') {
    const n = Number.parseFloat(raw.replace('%', '').trim());
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  }
  return 0;
}

export function formatSeedrTorrentTimeLeft(size: number, progress: number, downloadRate: number): {
  etaSeconds: number | null;
  etaLabel: string | null;
} {
  if (!downloadRate || downloadRate <= 0 || progress >= 100) {
    return { etaSeconds: null, etaLabel: progress >= 100 ? 'Done' : null };
  }
  const remaining = size * (1 - progress / 100);
  const etaSeconds = Math.max(0, Math.round(remaining / downloadRate));
  return { etaSeconds, etaLabel: formatDuration(etaSeconds) };
}

export function seedrTorrentDisplayName(name: unknown, fallback = 'Downloading…'): string {
  const n = typeof name === 'string' ? name.trim() : '';
  return n || fallback;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
