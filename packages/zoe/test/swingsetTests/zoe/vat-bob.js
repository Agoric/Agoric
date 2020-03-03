import harden from '@agoric/harden';
import { assert, details } from '@agoric/assert';
import { sameStructure } from '@agoric/same-structure';
import { showPurseBalance, setupIssuers, getLocalAmountMath } from './helpers';

const build = async (E, log, zoe, issuers, payments, installations, timer) => {
  const {
    moola,
    simoleans,
    bucks,
    purses,
    moolaAmountMath,
    simoleanAmountMath,
  } = await setupIssuers(zoe, issuers);
  const [moolaPurseP, simoleanPurseP, bucksPurseP] = purses;
  const [moolaPayment, simoleanPayment] = payments;
  const [moolaIssuer, simoleanIssuer, bucksIssuer] = issuers;
  const inviteIssuer = await E(zoe).getInviteIssuer();

  return harden({
    doAutomaticRefund: async inviteP => {
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);
      const {
        extent: [{ instanceHandle }],
      } = await E(inviteIssuer).getAmountOf(exclInvite);

      const { installationHandle, terms } = await E(zoe).getInstance(
        instanceHandle,
      );

      // Bob ensures it's the contract he expects
      assert(
        installations.automaticRefund === installationHandle,
        details`should be the expected automaticRefund`,
      );

      assert(
        terms.issuers[0] === moolaIssuer,
        details`The first issuer should be the moola issuer`,
      );
      assert(
        terms.issuers[1] === simoleanIssuer,
        details`The second issuer should be the simolean issuer`,
      );

      // 1. Bob escrows his offer
      const bobOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(15),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(17),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const bobPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        exclInvite,
        bobOfferRules,
        bobPayments,
      );

      // 2. Bob makes an offer
      const outcome = await E(seat).makeOffer();

      log(outcome);

      const bobResult = await payoutP;
      const [moolaPayout, simoleanPayout] = await Promise.all(bobResult);

      // 5: Bob deposits his winnings
      await E(moolaPurseP).deposit(moolaPayout);
      await E(simoleanPurseP).deposit(simoleanPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },

    doCoveredCall: async inviteP => {
      // Bob claims all with the Zoe inviteIssuer
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);

      const bobIntendedOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(3),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      // Bob checks that the invite is for the right covered call
      const { extent: optionExtent } = await E(inviteIssuer).getAmountOf(
        exclInvite,
      );

      const instanceInfo = await E(zoe).getInstance(
        optionExtent[0].instanceHandle,
      );

      assert(
        instanceInfo.installationHandle === installations.coveredCall,
        details`wrong installation`,
      );
      assert(
        optionExtent[0].seatDesc === 'exerciseOption',
        details`wrong seat`,
      );
      assert(
        moolaAmountMath.isEqual(optionExtent[0].underlyingAsset, moola(3)),
      );
      assert(
        simoleanAmountMath.isEqual(optionExtent[0].strikePrice, simoleans(7)),
      );
      assert(
        optionExtent[0].expirationDate === 1,
        details`wrong expirationDate`,
      );
      assert(optionExtent[0].timerAuthority === timer, 'wrong timer');

      assert(
        instanceInfo.terms.issuers[0] === moolaIssuer,
        details`The first issuer should be the moola issuer`,
      );
      assert(
        instanceInfo.terms.issuers[1] === simoleanIssuer,
        details`The second issuer should be the simolean issuer`,
      );

      const bobPayments = [undefined, simoleanPayment];

      // Bob escrows
      const { seat, payout: payoutP } = await E(zoe).redeem(
        exclInvite,
        bobIntendedOfferRules,
        bobPayments,
      );

      const bobOutcome = await E(seat).exercise();

      log(bobOutcome);

      const bobResult = await payoutP;
      const [moolaPayout, simoleanPayout] = await Promise.all(bobResult);

      await E(moolaPurseP).deposit(moolaPayout);
      await E(simoleanPurseP).deposit(simoleanPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doSwapForOption: async (inviteP, daveP) => {
      // Bob claims all with the Zoe inviteIssuer
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);

      // Bob checks that the invite is for the right covered call
      const optionAmounts = await E(inviteIssuer).getAmountOf(exclInvite);
      const optionExtent = optionAmounts.extent;

      const instanceInfo = await E(zoe).getInstance(
        optionExtent[0].instanceHandle,
      );
      assert(
        instanceInfo.installationHandle === installations.coveredCall,
        details`wrong installation`,
      );
      assert(
        optionExtent[0].seatDesc === 'exerciseOption',
        details`wrong seat`,
      );
      assert(
        moolaAmountMath.isEqual(optionExtent[0].underlyingAsset, moola(3)),
        details`wrong underlying asset`,
      );
      assert(
        simoleanAmountMath.isEqual(optionExtent[0].strikePrice, simoleans(7)),
        details`wrong strike price`,
      );
      assert(
        optionExtent[0].expirationDate === 100,
        details`wrong expiration date`,
      );
      assert(optionExtent[0].timerAuthority === timer, details`wrong timer`);
      assert(
        instanceInfo.terms.issuers[0] === moolaIssuer,
        details`The first issuer should be the moola issuer`,
      );
      assert(
        instanceInfo.terms.issuers[1] === simoleanIssuer,
        details`The second issuer should be the simolean issuer`,
      );

      // Let's imagine that Bob wants to create a swap to trade this
      // invite for bucks. He wants to invite Dave as the
      // counter-party.
      const swapIssuers = harden([inviteIssuer, bucksIssuer]);
      const bobSwapInvite = await E(zoe).makeInstance(
        installations.atomicSwap,
        { issuers: swapIssuers },
      );

      // Bob wants to swap an invite with the same amount as his
      // current invite from Alice. He wants 1 buck in return.
      const bobOfferRulesSwap = harden({
        payoutRules: [
          {
            kind: 'offerAtMost',
            amount: optionAmounts,
          },
          {
            kind: 'wantAtLeast',
            amount: bucks(1),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const bobSwapPayments = [exclInvite, undefined];

      // Bob escrows his option in the swap
      const { seat: bobSwapSeat, payout: payoutP } = await E(zoe).redeem(
        bobSwapInvite,
        bobOfferRulesSwap,
        bobSwapPayments,
      );

      // Bob makes an offer to the swap with his "higher order"
      const daveSwapInviteP = E(bobSwapSeat).makeFirstOffer();
      log('swap invite made');
      await E(daveP).doSwapForOption(daveSwapInviteP, optionAmounts);

      const bobResult = await payoutP;
      const [_, bucksPayout] = await Promise.all(bobResult);

      // Bob deposits his winnings
      await E(bucksPurseP).deposit(bucksPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
      await showPurseBalance(bucksPurseP, 'bobBucksPurse;', log);
    },
    doPublicAuction: async inviteP => {
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);
      const { extent: inviteExtent } = await E(inviteIssuer).getAmountOf(
        exclInvite,
      );

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent[0].instanceHandle,
      );
      assert(
        installationHandle === installations.publicAuction,
        details`wrong installation`,
      );
      assert(
        sameStructure(harden([moolaIssuer, simoleanIssuer]), terms.issuers),
        details`issuers were not as expected`,
      );
      assert(sameStructure(inviteExtent[0].minimumBid, simoleans(3)));
      assert(sameStructure(inviteExtent[0].auctionedAssets, moola(1)));

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(1),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(11),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        exclInvite,
        offerRules,
        offerPayments,
      );

      const offerResult = await E(seat).bid();

      log(offerResult);

      const bobResult = await payoutP;
      const [moolaPayout, simoleanPayout] = await Promise.all(bobResult);

      await E(moolaPurseP).deposit(moolaPayout);
      await E(simoleanPurseP).deposit(simoleanPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doAtomicSwap: async inviteP => {
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);
      const { extent: inviteExtent } = await E(inviteIssuer).getAmountOf(
        exclInvite,
      );

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent[0].instanceHandle,
      );
      assert(
        installationHandle === installations.atomicSwap,
        details`wrong installation`,
      );
      assert(
        sameStructure(harden([moolaIssuer, simoleanIssuer]), terms.issuers),
        details`issuers were not as expected`,
      );

      const expectedFirstOfferPayoutRules = harden([
        {
          kind: 'offerAtMost',
          amount: moola(3),
        },
        {
          kind: 'wantAtLeast',
          amount: simoleans(7),
        },
      ]);
      assert(
        sameStructure(
          inviteExtent[0].offerMadeRules,
          expectedFirstOfferPayoutRules,
        ),
        details`Alice made a different offer than expected`,
      );

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(3),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        exclInvite,
        offerRules,
        offerPayments,
      );

      const offerResult = await E(seat).matchOffer();

      log(offerResult);

      const bobResult = await payoutP;
      const [moolaPayout, simoleanPayout] = await Promise.all(bobResult);

      await E(moolaPurseP).deposit(moolaPayout);
      await E(simoleanPurseP).deposit(simoleanPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doSimpleExchange: async inviteP => {
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);
      const { extent: inviteExtent } = await E(inviteIssuer).getAmountOf(
        exclInvite,
      );

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent[0].instanceHandle,
      );
      assert(
        installationHandle === installations.simpleExchange,
        details`wrong installation`,
      );
      assert(
        sameStructure(harden([moolaIssuer, simoleanIssuer]), terms.issuers),
        details`issuers were not as expected`,
      );

      const bobBuyOrderOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(3),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        exclInvite,
        bobBuyOrderOfferRules,
        offerPayments,
      );

      const offerResult = await E(seat).addOrder();

      log(offerResult);

      const bobResult = await payoutP;
      const [moolaPayout, simoleanPayout] = await Promise.all(bobResult);

      await E(moolaPurseP).deposit(moolaPayout);
      await E(simoleanPurseP).deposit(simoleanPayout);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doAutoswap: async inviteP => {
      const invite = await inviteP;
      const exclInvite = await E(inviteIssuer).claim(invite);
      const { extent: inviteExtent } = await E(inviteIssuer).getAmountOf(
        exclInvite,
      );

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent[0].instanceHandle,
      );
      assert(
        installationHandle === installations.autoswap,
        details`wrong installation`,
      );
      const {
        extent: [{ instanceHandle }],
      } = await E(inviteIssuer).getAmountOf(exclInvite);
      const { publicAPI } = await E(zoe).getInstance(instanceHandle);
      const liquidityIssuer = await E(publicAPI).getLiquidityIssuer();
      const liquidityAmountMath = await getLocalAmountMath(liquidityIssuer);
      const liquidity = liquidityAmountMath.make;
      const allIssuers = harden([moolaIssuer, simoleanIssuer, liquidityIssuer]);
      assert(
        sameStructure(allIssuers, terms.issuers),
        details`issuers were not as expected`,
      );

      // bob checks the price of 3 moola. The price is 1 simolean
      const simoleanAmounts = await E(publicAPI).getPrice(moola(3));
      log(`simoleanAmounts `, simoleanAmounts);

      const moolaForSimOfferRules = harden({
        payoutRules: [
          {
            kind: 'offerAtMost',
            amount: moola(3),
          },
          {
            kind: 'wantAtLeast',
            amount: simoleans(1),
          },
          {
            kind: 'wantAtLeast',
            amount: liquidity(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const moolaForSimPayments = [moolaPayment, undefined, undefined];
      const { seat, payout: moolaForSimPayoutP } = await E(zoe).redeem(
        exclInvite,
        moolaForSimOfferRules,
        moolaForSimPayments,
      );

      const offerResult = await E(seat).swap();

      log(offerResult);

      const moolaForSimPayout = await moolaForSimPayoutP;
      const [moolaPayout1, simoleanPayout1] = await Promise.all(
        moolaForSimPayout,
      );

      await E(moolaPurseP).deposit(moolaPayout1);
      await E(simoleanPurseP).deposit(simoleanPayout1);

      // Bob looks up the price of 3 simoleans. It's 5 moola
      const moolaAmounts = await E(publicAPI).getPrice(simoleans(3));
      log(`moolaAmounts `, moolaAmounts);

      // Bob makes another offer and swaps
      const bobSimsForMoolaOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            amount: moola(5),
          },
          {
            kind: 'offerAtMost',
            amount: simoleans(3),
          },
          {
            kind: 'wantAtLeast',
            amount: liquidity(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      await E(simoleanPurseP).deposit(simoleanPayment);
      const bobSimoleanPayment = await E(simoleanPurseP).withdraw(simoleans(3));
      const simsForMoolaPayments = [undefined, bobSimoleanPayment, undefined];
      const invite2 = await E(publicAPI).makeInvite();

      const { seat: seat2, payout: bobSimsForMoolaPayoutP } = await E(
        zoe,
      ).redeem(invite2, bobSimsForMoolaOfferRules, simsForMoolaPayments);

      const simsForMoolaOutcome = await E(seat2).swap();
      log(simsForMoolaOutcome);

      const simsForMoolaPayout = await bobSimsForMoolaPayoutP;
      const [moolaPayout2, simoleanPayout2] = await Promise.all(
        simsForMoolaPayout,
      );

      await E(moolaPurseP).deposit(moolaPayout2);
      await E(simoleanPurseP).deposit(simoleanPayout2);

      await showPurseBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPurseBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
  });
};

const setup = (syscall, state, helpers) =>
  helpers.makeLiveSlots(syscall, state, E =>
    harden({
      build: (...args) => build(E, helpers.log, ...args),
    }),
  );
export default harden(setup);
