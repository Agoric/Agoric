// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { E } from '@agoric/eventual-send';
import bundleSource from '@agoric/bundle-source';

// noinspection ES6PreferShortImport
import { makeZoe } from '../../../src/zoeService/zoe';
import { setup } from '../setupBasicMints';
import fakeVatAdmin from './fakeVatAdmin';

const contractRoot = `${__dirname}/zcfTesterContract`;

test(`zoe - zcfSeat.kickOut() doesn't throw`, async t => {
  t.plan(1);
  const { moolaIssuer, simoleanIssuer } = setup();
  const zoe = makeZoe(fakeVatAdmin);

  // pack the contract
  const bundle = await bundleSource(contractRoot);
  // install the contract
  const installation = await zoe.install(bundle);

  // Alice creates an instance
  const issuerKeywordRecord = harden({
    Pixels: moolaIssuer,
    Money: simoleanIssuer,
  });

  const { creatorFacet } = await E(zoe).startInstance(
    installation,
    issuerKeywordRecord,
  );

  // This contract gives ZCF as the contractFacet for testing purposes
  /** @type ContractFacet */
  const zcf = creatorFacet;

  let firstSeat;

  const grabSeat = seat => {
    firstSeat = seat;
    return 'ok';
  };

  const kickOutSeat = secondSeat => {
    firstSeat.kickOut(new Error('kicked out first'));
    throw secondSeat.kickOut(new Error('kicked out second'));
  };

  const invitation1 = zcf.makeInvitation(grabSeat, 'seat1');
  const invitation2 = zcf.makeInvitation(kickOutSeat, 'seat2');

  const userSeat1 = await E(zoe).offer(invitation1);
  const userSeat2 = await E(zoe).offer(invitation2);
  const userSeat1Result = await E(userSeat1).getOfferResult();

  t.is(userSeat1Result, 'ok');

  await E(userSeat2).getPayouts();
  // Results in "Unhandled rejection"
  // E(userSeat2).getOfferResult();

  await t.throwsAsync(() => E(userSeat2).getOfferResult());
  await t.throwsAsync(() => E(userSeat1).tryExit(), {
    message: 'seat has been exited',
  });
});
