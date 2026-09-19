import { describe, it, expect, vi } from 'vitest';
import { createStartHandler } from './start';
import { handleHelp } from './help';
import { handleCancel } from './cancel';
import { createMembersHandler } from './members';
import {
  PRIVATE_START_MESSAGE,
  GROUP_START_MESSAGE,
  HELP_MESSAGE,
  UNKNOWN_COMMAND_MESSAGE,
} from '../messages';
import { CommandContext, Context } from 'grammy';
import { BotServices } from '../../modules/services';
import { validateTelegramMarkdown } from '../../shared/markdown';

describe('Bot Commands and Messages', () => {
  it('has the exact required start message content', () => {
    expect(PRIVATE_START_MESSAGE).toContain('👋 Welcome to BuddySplitter!');
    expect(PRIVATE_START_MESSAGE).toContain('Group expenses made simple.');
    expect(PRIVATE_START_MESSAGE).toContain('Add me to a group and split expenses without spreadsheets.');

    expect(GROUP_START_MESSAGE).toContain('👋 BuddySplitter is ready!');
    expect(GROUP_START_MESSAGE).toContain('I’ll help this group track expenses and settlements.');
  });

  it('handles /start in private chat with private welcome and keyboard', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { type: 'private' },
      me: { username: 'BuddySplitterBot' },
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    const handler = createStartHandler({} as BotServices);
    await handler(mockCtx);

    expect(replyMock).toHaveBeenCalledWith(
      PRIVATE_START_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('handles /start in group chat with group welcome and menu keyboard', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { type: 'supergroup' },
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    const handler = createStartHandler({} as BotServices);
    await handler(mockCtx);

    expect(replyMock).toHaveBeenCalledWith(
      GROUP_START_MESSAGE,
      expect.objectContaining({ reply_markup: expect.anything() })
    );
  });

  it('handles /help command explaining all core commands', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    await handleHelp(mockCtx);

    expect(replyMock).toHaveBeenCalledWith(HELP_MESSAGE, { parse_mode: 'Markdown' });
    expect(HELP_MESSAGE).toContain('/start');
    expect(HELP_MESSAGE).toContain('/add');
    expect(HELP_MESSAGE).toContain('/balance');
    expect(HELP_MESSAGE).toContain('/summary');
    expect(HELP_MESSAGE).toContain('/settle');
    expect(HELP_MESSAGE).toContain('/payments');
    expect(HELP_MESSAGE).toContain('/expenses');
    expect(HELP_MESSAGE).toContain('/members');
    expect(HELP_MESSAGE).toContain('/privacy');
    expect(HELP_MESSAGE).toContain('/my\\_data');
    expect(HELP_MESSAGE).toContain('/delete\\_my\\_data');
    expect(HELP_MESSAGE).toContain('/cancel');
    expect(validateTelegramMarkdown(HELP_MESSAGE)).toEqual({ isValid: true });
  });

  it('verifies all static bot messages have valid Markdown v1 formatting', () => {
    expect(validateTelegramMarkdown(PRIVATE_START_MESSAGE)).toEqual({ isValid: true });
    expect(validateTelegramMarkdown(GROUP_START_MESSAGE)).toEqual({ isValid: true });
    expect(validateTelegramMarkdown(UNKNOWN_COMMAND_MESSAGE)).toEqual({ isValid: true });
  });

  it('handles /cancel command', async () => {
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    await handleCancel(mockCtx);

    expect(replyMock).toHaveBeenCalledWith(expect.stringContaining('No active action to cancel'));
  });

  it('handles /members in group chat', async () => {
    const mockGroupService = {
      getGroupByTelegramChatId: vi.fn().mockResolvedValue({ id: 'grp-1', title: 'Goa Trip' }),
      getActiveMembers: vi.fn().mockResolvedValue([{ userId: 'usr-1', displayName: 'David' }]),
    };
    const mockUserService = {
      getUserById: vi.fn().mockResolvedValue({ firstName: 'David', username: 'david' }),
    };

    const services = {
      groupService: mockGroupService,
      userService: mockUserService,
    } as unknown as BotServices;

    const handler = createMembersHandler(services);
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: -100999, type: 'group' },
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    await handler(mockCtx);

    expect(mockGroupService.getGroupByTelegramChatId).toHaveBeenCalledWith(-100999);
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Goa Trip — Active Members'),
      expect.anything()
    );
  });

  it('handles /members in private chat with informative message', async () => {
    const services = {} as BotServices;
    const handler = createMembersHandler(services);
    const replyMock = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      chat: { id: 123, type: 'private' },
      reply: replyMock,
    } as unknown as CommandContext<Context>;

    await handler(mockCtx);

    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Members can only be viewed inside a group chat'),
      expect.anything()
    );
  });

  it('defines an unknown command message', () => {
    expect(UNKNOWN_COMMAND_MESSAGE).toBeDefined();
    expect(UNKNOWN_COMMAND_MESSAGE).toContain('Unknown command');
  });
});
