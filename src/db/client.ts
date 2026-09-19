import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types';

let client: SupabaseClient<Database> | null = null;

export function initDbClient(
  supabaseUrl: string,
  supabaseAnonKey: string
): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

export function getDbClient(): SupabaseClient<Database> {
  if (!client) {
    throw new Error('Database client has not been initialized. Call initDbClient first.');
  }
  return client;
}
