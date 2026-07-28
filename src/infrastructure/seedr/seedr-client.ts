import type {
  SeedrFilePlayback,
  SeedrFolderDetails,
  SeedrLibrary,
  SeedrLoadingTorrent,
  SeedrSpace,
  SeedrVideo,
} from '../../domain/entities/seedr.js';
import type { Env } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  formatSeedrTorrentTimeLeft,
  parseSeedrTorrentProgress,
  seedrTorrentDisplayName,
} from '../../shared/seedr/torrent-utils.js';
import type { SupabaseSeedrDbRepository } from '../supabase/seedr-db-repository.js';

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

type SeedrFolderApi = {
  id?: number;
  name?: string;
  path?: string;
  size?: number;
  space_used?: number;
  space_max?: number;
  folders?: Array<{ id: number; name?: string; path?: string; size?: number }>;
  files?: Array<{
    folder_file_id?: number;
    name?: string;
    size?: number;
    play_video?: boolean | number | string;
  }>;
  torrents?: Array<{
    id?: number;
    name?: string;
    size?: number;
    progress?: string | number;
    download_rate?: number;
    last_update?: string;
  }>;
};

/**
 * Seedr client — credentials + tokens from Supabase `seedr_db` (id=1).
 * Flow: use access_token → refresh → email/password login → save tokens back to DB.
 */
export class SeedrClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  private email: string | null = null;
  private password: string | null = null;
  private loadedFromDb = false;

  constructor(
    private readonly env: Env,
    private readonly seedrDb: SupabaseSeedrDbRepository,
  ) {}

  private async loadAccount(): Promise<void> {
    if (this.loadedFromDb && this.email && this.password) return;
    const account = await this.seedrDb.getAccount();
    if (!account?.email || !account.password) {
      throw AppError.notFound('seedr_db account not configured (id=1)');
    }
    this.email = account.email;
    this.password = account.password;
    this.accessToken = account.accessToken;
    this.refreshToken = account.refreshToken;
    this.expiresAt = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
    this.loadedFromDb = true;
  }

  private async persistTokens(): Promise<void> {
    if (!this.accessToken) return;
    await this.seedrDb.saveTokens({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: new Date(this.expiresAt || Date.now() + 3600_000),
    });
  }

  private applyTokenResponse(data: TokenResponse): void {
    this.accessToken = data.access_token;
    if (data.refresh_token) this.refreshToken = data.refresh_token;
    this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  }

  private async login(): Promise<void> {
    await this.loadAccount();
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'seedr_chrome',
      type: 'login',
      username: this.email!,
      password: this.password!,
    });

    const res = await fetch(`${this.env.SEEDR_BASE_URL}/oauth_test/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      throw AppError.unauthorized('Seedr login failed — check seedr_db email/password');
    }

    let data: TokenResponse;
    try {
      data = JSON.parse(text) as TokenResponse;
    } catch {
      throw AppError.upstream('Seedr login returned invalid JSON', { body: text.slice(0, 200) });
    }

    if (!data.access_token) throw AppError.unauthorized('Seedr login failed — no access_token');
    this.applyTokenResponse(data);
    await this.persistTokens();
  }

  private async refresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: 'seedr_chrome',
    });
    const res = await fetch(`${this.env.SEEDR_BASE_URL}/oauth_test/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenResponse;
    if (!data.access_token) return false;
    this.applyTokenResponse(data);
    await this.persistTokens();
    return true;
  }

  async getValidToken(): Promise<string> {
    await this.loadAccount();
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    if (await this.refresh()) return this.accessToken!;
    await this.login();
    return this.accessToken!;
  }

  /** Force re-auth after 401. */
  private async invalidateAndRelogin(): Promise<string> {
    this.accessToken = null;
    this.expiresAt = 0;
    if (await this.refresh()) return this.accessToken!;
    await this.login();
    return this.accessToken!;
  }

  private mapSpace(folder: SeedrFolderApi): SeedrSpace {
    const used = Number(folder.space_used ?? 0);
    const max = Number(folder.space_max ?? 0);
    return {
      used,
      max,
      usedPercent: max > 0 ? Math.min(100, Math.round((used / max) * 1000) / 10) : 0,
    };
  }

  private mapLoading(torrents: SeedrFolderApi['torrents']): SeedrLoadingTorrent[] {
    return (torrents ?? []).map((t) => {
      const size = Number(t.size ?? 0);
      const progress = parseSeedrTorrentProgress(t.progress);
      const downloadRate = Number(t.download_rate ?? 0);
      const eta = formatSeedrTorrentTimeLeft(size, progress, downloadRate);
      return {
        id: Number(t.id),
        name: seedrTorrentDisplayName(t.name),
        size,
        progress,
        progressRaw: t.progress ?? null,
        downloadRate,
        lastUpdate: t.last_update ?? null,
        etaSeconds: eta.etaSeconds,
        etaLabel: eta.etaLabel,
      };
    });
  }

  private async getApiFolder(folderId?: string | number): Promise<SeedrFolderApi> {
    const token = await this.getValidToken();
    const path =
      folderId == null || folderId === ''
        ? `/api/folder?access_token=${encodeURIComponent(token)}`
        : `/api/folder/${folderId}?access_token=${encodeURIComponent(token)}`;

    let res: Response;
    try {
      res = await fetch(`${this.env.SEEDR_BASE_URL}${path}`);
    } catch (cause) {
      throw AppError.upstream('Seedr folder request failed', { cause: String(cause) });
    }

    if (res.status === 401) {
      const retryToken = await this.invalidateAndRelogin();
      const retryPath =
        folderId == null || folderId === ''
          ? `/api/folder?access_token=${encodeURIComponent(retryToken)}`
          : `/api/folder/${folderId}?access_token=${encodeURIComponent(retryToken)}`;
      res = await fetch(`${this.env.SEEDR_BASE_URL}${retryPath}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.upstream('Seedr folder error', { status: res.status, body: text.slice(0, 500) });
    }

    return (await res.json()) as SeedrFolderApi;
  }

  private async resource<T>(fields: Record<string, string>): Promise<T> {
    const token = await this.getValidToken();
    const body = new URLSearchParams({ access_token: token, ...fields });

    let res: Response;
    try {
      res = await fetch(`${this.env.SEEDR_BASE_URL}/oauth_test/resource.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (cause) {
      throw AppError.upstream('Seedr resource request failed', { cause: String(cause) });
    }

    if (res.status === 401) {
      const retryToken = await this.invalidateAndRelogin();
      const retryBody = new URLSearchParams({ access_token: retryToken, ...fields });
      res = await fetch(`${this.env.SEEDR_BASE_URL}/oauth_test/resource.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: retryBody,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) throw AppError.unauthorized('Seedr access denied');
      throw AppError.upstream('Seedr resource error', { status: res.status, body: text.slice(0, 500) });
    }

    return (await res.json()) as T;
  }

  async getUser() {
    const token = await this.getValidToken();
    let res = await fetch(`${this.env.SEEDR_BASE_URL}/rest/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const retryToken = await this.invalidateAndRelogin();
      res = await fetch(`${this.env.SEEDR_BASE_URL}/rest/user`, {
        headers: { Authorization: `Bearer ${retryToken}` },
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.upstream('Seedr user error', { status: res.status, body: text.slice(0, 500) });
    }
    return (await res.json()) as Record<string, unknown>;
  }

  /** App `getLibrary()` — space + loading torrents + playable videos. */
  async getLibrary(): Promise<SeedrLibrary> {
    const root = await this.getApiFolder();
    const space = this.mapSpace(root);
    const loading = this.mapLoading(root.torrents);

    const folders = (root.folders ?? []).map((f) => ({
      id: f.id,
      name: f.name ?? f.path ?? String(f.id),
      size: f.size ?? null,
    }));

    const rootFiles = (root.files ?? []).map((f) => ({
      fileId: Number(f.folder_file_id),
      name: f.name ?? 'file',
      size: f.size ?? null,
      playVideo: Boolean(f.play_video),
    }));

    const videos: SeedrVideo[] = [];
    for (const folder of root.folders ?? []) {
      const detail = await this.getApiFolder(folder.id);
      for (const file of detail.files ?? []) {
        if (!file.play_video) continue;
        videos.push({
          folderId: folder.id,
          fileId: Number(file.folder_file_id),
          name: file.name ?? 'video',
          size: file.size ?? null,
          playVideo: true,
        });
      }
    }

    for (const f of rootFiles) {
      if (f.playVideo) {
        videos.push({
          folderId: Number(root.id ?? 0),
          fileId: f.fileId,
          name: f.name,
          size: f.size,
          playVideo: true,
        });
      }
    }

    return { space, loading, folders, videos, rootFiles };
  }

  async listFolders() {
    const root = await this.getApiFolder();
    const folders = (root.folders ?? []).map((f) => ({
      id: f.id,
      name: f.name ?? f.path ?? String(f.id),
      size: f.size ?? null,
    }));
    return {
      space: this.mapSpace(root),
      loading: this.mapLoading(root.torrents),
      folders,
      count: folders.length,
    };
  }

  async getFolderDetails(folderId?: string | number): Promise<SeedrFolderDetails> {
    const folder = await this.getApiFolder(folderId);
    return {
      id: folder.id ?? folderId ?? 'root',
      name: folder.name ?? folder.path ?? null,
      path: folder.path ?? null,
      space: this.mapSpace(folder),
      loading: this.mapLoading(folder.torrents),
      folders: (folder.folders ?? []).map((f) => ({
        id: f.id,
        name: f.name ?? f.path ?? String(f.id),
        size: f.size ?? null,
      })),
      files: (folder.files ?? []).map((f) => ({
        fileId: Number(f.folder_file_id),
        name: f.name ?? 'file',
        size: f.size ?? null,
        playVideo: Boolean(f.play_video),
      })),
    };
  }

  addMagnet(magnet: string) {
    return this.resource<Record<string, unknown>>({
      func: 'add_torrent',
      torrent_magnet: magnet,
    });
  }

  private async probeHls(fileId: string | number, token: string): Promise<boolean> {
    const hlsUrl = `${this.env.SEEDR_BASE_URL}/rest/file/${fileId}/hls?access_token=${encodeURIComponent(token)}`;
    try {
      const res = await fetch(hlsUrl, { method: 'GET' });
      if (!res.ok) return false;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('json')) {
        const body = (await res.json().catch(() => null)) as { status_code?: number } | null;
        if (body && typeof body.status_code === 'number' && body.status_code >= 400) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async getFile(fileId: string | number): Promise<SeedrFilePlayback> {
    const token = await this.getValidToken();
    const stream = await this.resource<Record<string, unknown>>({
      func: 'fetch_file',
      folder_file_id: String(fileId),
    });

    const directUrl = typeof stream.url === 'string' ? stream.url : null;
    const name = typeof stream.name === 'string' ? stream.name : null;
    const hlsUrl = `${this.env.SEEDR_BASE_URL}/rest/file/${fileId}/hls?access_token=${encodeURIComponent(token)}`;
    const hlsAvailable = await this.probeHls(fileId, token);
    const mode = hlsAvailable ? 'hls' : 'direct';

    return {
      fileId: Number(fileId),
      name,
      playUrl: hlsAvailable ? hlsUrl : directUrl,
      mode,
      directUrl,
      hlsUrl,
      hlsAvailable,
      stream,
    };
  }

  deleteItems(items: Array<{ type: 'file' | 'folder' | 'torrent'; id: number }>) {
    return this.resource<Record<string, unknown>>({
      func: 'delete',
      delete_arr: JSON.stringify(items),
    });
  }

  async clearSpace() {
    const lib = await this.getLibrary();
    const deleteArr: Array<{ type: 'file' | 'folder' | 'torrent'; id: number }> = [
      ...lib.loading.map((t) => ({ type: 'torrent' as const, id: t.id })),
      ...lib.folders.map((f) => ({ type: 'folder' as const, id: f.id })),
      ...lib.rootFiles.map((f) => ({ type: 'file' as const, id: f.fileId })),
    ];
    if (deleteArr.length === 0) return { deleted: 0, result: true };
    const result = await this.deleteItems(deleteArr);
    return { deleted: deleteArr.length, result };
  }
}
