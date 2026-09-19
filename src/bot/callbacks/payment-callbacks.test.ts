import { describe, it, expect, vi } from 'vitest';
import { Context } from 'grammy';
import { handlePaymentCallback } from './payment-callbacks';
import * as paymentFlow from '../../modules/settlements/payment-flow';
import { BotServices } from '../../modules/services';

describe('Payment Callbacks Router', () => {
  const mockServices = {} as BotServices;
  const mockCtx = {} as Context;

  it('returns false for unrelated callback actions', async () => {
    const result = await handlePaymentCallback(mockCtx, 'action:members', mockServices);
    expect(result).toBe(false);
  });

  it('routes pay:start to startPaymentSelection', async () => {
    const spy = vi.spyOn(paymentFlow, 'startPaymentSelection').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:start', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx, mockServices);
    spy.mockRestore();
  });

  it('routes action:record_payment to startPaymentSelection', async () => {
    const spy = vi.spyOn(paymentFlow, 'startPaymentSelection').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'action:record_payment', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx, mockServices);
    spy.mockRestore();
  });

  it('routes pay:to:<recipientId> to handleSelectRecipient', async () => {
    const spy = vi.spyOn(paymentFlow, 'handleSelectRecipient').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:to:usr-123', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx, mockServices, 'usr-123');
    spy.mockRestore();
  });

  it('routes pay:amt:full to handleChooseFullAmount', async () => {
    const spy = vi.spyOn(paymentFlow, 'handleChooseFullAmount').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:amt:full', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx);
    spy.mockRestore();
  });

  it('routes pay:amt:custom to handleChooseCustomAmount', async () => {
    const spy = vi.spyOn(paymentFlow, 'handleChooseCustomAmount').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:amt:custom', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx);
    spy.mockRestore();
  });

  it('routes pay:confirm to handleConfirmPayment', async () => {
    const spy = vi.spyOn(paymentFlow, 'handleConfirmPayment').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:confirm', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx, mockServices);
    spy.mockRestore();
  });

  it('routes pay:cancel to handleCancelPayment', async () => {
    const spy = vi.spyOn(paymentFlow, 'handleCancelPayment').mockResolvedValue(undefined);
    const result = await handlePaymentCallback(mockCtx, 'pay:cancel', mockServices);
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(mockCtx);
    spy.mockRestore();
  });
});
