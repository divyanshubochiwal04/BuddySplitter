import { describe, it, expect, vi } from 'vitest';
import { createRegistrationMiddleware } from './registration.middleware';
import { BotServices } from '../../modules/services';
import { Context } from 'grammy';

describe('Registration Middleware', () => {
  it('registers user and group when message comes from a group chat', async () => {
    const mockUserService = {
      registerUser: vi.fn().mockResolvedValue({ id: 'usr-1', firstName: 'Alice' }),
    };
    const mockGroupService = {
      registerGroup: vi.fn().mockResolvedValue({ id: 'grp-1', title: 'Test Group' }),
      registerMember: vi.fn().mockResolvedValue({ id: 'gm-1' }),
    };

    const services = {
      userService: mockUserService,
      groupService: mockGroupService,
    } as unknown as BotServices;

    const middleware = createRegistrationMiddleware(services);

    const mockCtx = {
      from: {
        id: 111,
        is_bot: false,
        first_name: 'Alice',
        last_name: 'Smith',
        username: 'alice_smith',
      },
      chat: {
        id: -100123,
        type: 'supergroup',
        title: 'Roomies',
      },
    } as unknown as Context;

    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(mockCtx, next);

    expect(mockUserService.registerUser).toHaveBeenCalledWith({
      id: 111,
      first_name: 'Alice',
      last_name: 'Smith',
      username: 'alice_smith',
    });

    expect(mockGroupService.registerGroup).toHaveBeenCalledWith({
      id: -100123,
      title: 'Roomies',
    });

    expect(mockGroupService.registerMember).toHaveBeenCalledWith(
      'grp-1',
      'usr-1',
      'Alice Smith'
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('registers only user when interaction is in a private chat', async () => {
    const mockUserService = {
      registerUser: vi.fn().mockResolvedValue({ id: 'usr-2', firstName: 'Bob' }),
    };
    const mockGroupService = {
      registerGroup: vi.fn(),
      registerMember: vi.fn(),
    };

    const services = {
      userService: mockUserService,
      groupService: mockGroupService,
    } as unknown as BotServices;

    const middleware = createRegistrationMiddleware(services);

    const mockCtx = {
      from: {
        id: 222,
        is_bot: false,
        first_name: 'Bob',
      },
      chat: {
        id: 222,
        type: 'private',
      },
    } as unknown as Context;

    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(mockCtx, next);

    expect(mockUserService.registerUser).toHaveBeenCalledWith({
      id: 222,
      first_name: 'Bob',
      last_name: null,
      username: null,
    });

    expect(mockGroupService.registerGroup).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ignores bots', async () => {
    const mockUserService = { registerUser: vi.fn() };
    const mockGroupService = { registerGroup: vi.fn() };

    const services = {
      userService: mockUserService,
      groupService: mockGroupService,
    } as unknown as BotServices;

    const middleware = createRegistrationMiddleware(services);

    const mockCtx = {
      from: {
        id: 999,
        is_bot: true,
        first_name: 'OtherBot',
      },
    } as unknown as Context;

    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(mockCtx, next);

    expect(mockUserService.registerUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
