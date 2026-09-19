import { describe, it, expect } from 'vitest';
import { initDbClient, getDbClient } from './client';

describe('Database Client', () => {
  it('initializes and retrieves Supabase client', () => {
    const supabaseUrl = 'https://example-project.supabase.co';
    const supabaseKey = 'example-anon-key';

    const client = initDbClient(supabaseUrl, supabaseKey);
    expect(client).toBeDefined();

    const retrievedClient = getDbClient();
    expect(retrievedClient).toBe(client);
  });
});
