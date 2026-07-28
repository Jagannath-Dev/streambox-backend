export type SeedrSpace = {
  used: number;
  max: number;
  usedPercent: number;
};

export type SeedrLoadingTorrent = {
  id: number;
  name: string;
  size: number;
  progress: number;
  progressRaw: string | number | null;
  downloadRate: number;
  lastUpdate: string | null;
  etaSeconds: number | null;
  etaLabel: string | null;
};

export type SeedrVideo = {
  folderId: number;
  fileId: number;
  name: string;
  size: number | null;
  playVideo: boolean;
};

export type SeedrFolderSummary = {
  id: number;
  name: string;
  size: number | null;
};

export type SeedrLibrary = {
  space: SeedrSpace;
  loading: SeedrLoadingTorrent[];
  folders: SeedrFolderSummary[];
  videos: SeedrVideo[];
  rootFiles: Array<{
    fileId: number;
    name: string;
    size: number | null;
    playVideo: boolean;
  }>;
};

export type SeedrFolderDetails = {
  id: number | string;
  name: string | null;
  path: string | null;
  space: SeedrSpace;
  loading: SeedrLoadingTorrent[];
  folders: SeedrFolderSummary[];
  files: Array<{
    fileId: number;
    name: string;
    size: number | null;
    playVideo: boolean;
  }>;
};

export type SeedrPlaybackMode = 'hls' | 'direct';

export type SeedrFilePlayback = {
  fileId: number;
  name: string | null;
  /** Prefer this URL in the player. */
  playUrl: string | null;
  mode: SeedrPlaybackMode;
  /** Direct CDN URL from fetch_file (usually works). */
  directUrl: string | null;
  /** Seedr HLS URL — often 500 infra error; only used when mode=hls. */
  hlsUrl: string;
  hlsAvailable: boolean;
  stream: Record<string, unknown>;
};
