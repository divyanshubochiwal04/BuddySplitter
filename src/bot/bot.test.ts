import { describe, it, expect } from 'vitest';
import { createBot } from './bot';

describe('Bot Initialization', () => {
  it('instantiates grammY Bot with token', () => {
    const dummyToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
    const bot = createBot(dummyToken);

    expect(bot).toBeDefined();
    expect(bot.token).toBe(dummyToken);
  });
});
