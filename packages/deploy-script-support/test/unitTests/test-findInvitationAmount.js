// @ts-check
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { makeIssuerKit, AssetKind, AmountMath } from '@agoric/ertp';

import '../../exported';

import { makeOfferAndFindInvitationAmount } from '../../src/offer';

test('findInvitationAmount', async t => {
  const { mint, issuer, brand } = makeIssuerKit('invitations', AssetKind.SET);
  const zoeInvitationPurse = issuer.makeEmptyPurse();

  const walletAdmin = {};
  const zoe = {};

  const paymentAmount = AmountMath.make(brand, [
    { description: 'found', instance: {} },
  ]);
  const payment = mint.mintPayment(paymentAmount);
  zoeInvitationPurse.deposit(payment);

  const { findInvitationAmount } = makeOfferAndFindInvitationAmount(
    walletAdmin,
    zoe,
    zoeInvitationPurse,
    brand,
  );

  const notFoundResult = await findInvitationAmount({
    description: 'not found',
  });
  t.deepEqual(notFoundResult, AmountMath.makeEmpty(brand, AssetKind.SET));

  const foundResult = await findInvitationAmount({ description: 'found' });
  t.deepEqual(foundResult, paymentAmount);
});
