import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../shared/errors/app-error.js';

export type SeedrDbAccount = {
  id: number;
  email: string;
  password: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

type SeedrDbRow = {
  id: number;
  email: string;
  password: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

const ACCOUNT_ID = 1;

export class SupabaseSeedrDbRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getAccount(): Promise<SeedrDbAccount | null> {
    const { data, error } = await this.db
      .from('seedr_db')
      .select('id, email, password, access_token, refresh_token, expires_at')
      .eq('id', ACCOUNT_ID)
      .maybeSingle();
    if (error) throw AppError.upstream('Failed to fetch seedr_db', error);
    if (!data) return null;
    const row = data as SeedrDbRow;
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
    };
  }

  async saveTokens(input: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date;
  }): Promise<void> {
    const { error } = await this.db
      .from('seedr_db')
      .update({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        expires_at: input.expiresAt.toISOString(),
      })
      .eq('id', ACCOUNT_ID);
    if (error) throw AppError.upstream('Failed to update seedr_db tokens', error);
  }
}
