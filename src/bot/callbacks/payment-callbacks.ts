import { Context } from 'grammy';
import { BotServices } from '../../modules/services';
import {
  handleCancelPayment,
  handleChooseCustomAmount,
  handleChooseFullAmount,
  handleConfirmPayment,
  handleSelectRecipient,
  startPaymentSelection,
} from '../../modules/settlements/payment-flow';

/**
 * Routes callbacks starting with 'pay:'
 * Returns true if handled, false otherwise.
 */
export async function handlePaymentCallback(
  ctx: Context,
  data: string,
  services: BotServices
): Promise<boolean> {
  if (!data.startsWith('pay:') && data !== 'action:record_payment') {
    return false;
  }

  if (data === 'pay:start' || data === 'action:record_payment') {
    await startPaymentSelection(ctx, services);
    return true;
  }

  if (data.startsWith('pay:to:')) {
    const recipientUserId = data.slice('pay:to:'.length);
    await handleSelectRecipient(ctx, services, recipientUserId);
    return true;
  }

  if (data === 'pay:amt:full') {
    await handleChooseFullAmount(ctx);
    return true;
  }

  if (data === 'pay:amt:custom') {
    await handleChooseCustomAmount(ctx);
    return true;
  }

  if (data === 'pay:confirm') {
    await handleConfirmPayment(ctx, services);
    return true;
  }

  if (data === 'pay:cancel') {
    await handleCancelPayment(ctx);
    return true;
  }

  return false;
}
