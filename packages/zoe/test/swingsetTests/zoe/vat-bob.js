import harden from '@agoric/harden';
import { insist } from '@agoric/ertp/util/insist';
import { sameStructure } from '@agoric/ertp/util/sameStructure';
import { showPaymentBalance, setupAssays, getLocalUnitOps } from './helpers';

const build = async (E, log, zoe, purses, installations, timer) => {
  const {
    inviteAssay,
    assays,
    moolaAssay,
    simoleanAssay,
    bucksAssay,
    moolaUnitOps,
    simoleanUnitOps,
    moola,
    simoleans,
    bucks,
  } = await setupAssays(zoe, purses);
  const [moolaPurseP, simoleanPurseP, bucksPurseP] = purses;

  return harden({
    doAutomaticRefund: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const {
        extent: { instanceHandle },
      } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        instanceHandle,
      );

      // Bob ensures it's the contract he expects
      insist(
        installations.automaticRefund === installationHandle,
      )`should be the expected automaticRefund`;

      insist(
        terms.assays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        terms.assays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      // 1. Bob escrows his offer
      const bobOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(15),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(17),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();

      const bobPayments = [undefined, bobSimoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        bobOfferRules,
        bobPayments,
      );

      // 2. Bob makes an offer with his escrow receipt
      const outcome = await E(seat).makeOffer();

      log(outcome);

      const bobResult = await payoutP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },

    doCoveredCall: async inviteP => {
      // Bob claims all with the Zoe inviteAssay
      const invite = await E(inviteAssay).claimAll(inviteP);

      const bobIntendedOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(3),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      // Bob checks that the invite is for the right covered call
      const { extent: optionExtent } = await E(invite).getBalance();

      const instanceInfo = await E(zoe).getInstance(
        optionExtent.instanceHandle,
      );

      insist(
        instanceInfo.installationHandle === installations.coveredCall,
      )`wrong installation`;
      insist(optionExtent.seatDesc === 'exerciseOption')`wrong seat`;
      insist(moolaUnitOps.equals(optionExtent.underlyingAsset, moola(3)));
      insist(simoleanUnitOps.equals(optionExtent.strikePrice, simoleans(7)));
      insist(optionExtent.expirationDate === 1)`wrong expirationDate`;
      insist(optionExtent.timerAuthority === timer)`wrong timer`;

      insist(
        instanceInfo.terms.assays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        instanceInfo.terms.assays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      const bobSimoleanPayment = await E(simoleanPurseP).withdrawAll();
      const bobPayments = [undefined, bobSimoleanPayment];

      // Bob escrows
      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        bobIntendedOfferRules,
        bobPayments,
      );

      // 8: Bob makes an offer with his escrow receipt
      const bobOutcome = await E(seat).exercise();

      log(bobOutcome);

      const bobResult = await payoutP;

      // 5: Bob deposits his winnings
      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doSwapForOption: async (inviteP, daveP) => {
      // Bob claims all with the Zoe inviteAssay
      const invite = await E(inviteAssay).claimAll(inviteP);

      // Bob checks that the invite is for the right covered call
      const optionUnits = await E(invite).getBalance();
      const optionExtent = optionUnits.extent;

      const instanceInfo = await E(zoe).getInstance(
        optionExtent.instanceHandle,
      );
      insist(
        instanceInfo.installationHandle === installations.coveredCall,
      )`wrong installation`;
      insist(optionExtent.seatDesc === 'exerciseOption')`wrong seat`;
      insist(
        moolaUnitOps.equals(optionExtent.underlyingAsset, moola(3)),
      )`wrong underlying asset`;
      insist(
        simoleanUnitOps.equals(optionExtent.strikePrice, simoleans(7)),
      )`wrong strike price`;
      insist(optionExtent.expirationDate === 100)`wrong expiration date`;
      insist(optionExtent.timerAuthority === timer)`wrong timer`;
      insist(
        instanceInfo.terms.assays[0] === moolaAssay,
      )`The first assay should be the moola assay`;
      insist(
        instanceInfo.terms.assays[1] === simoleanAssay,
      )`The second assay should be the simolean assay`;

      // Let's imagine that Bob wants to create a swap to trade this
      // invite for bucks. He wants to invite Dave as the
      // counter-party.
      const swapAssays = harden([inviteAssay, bucksAssay]);
      const bobSwapInvite = await E(zoe).makeInstance(
        installations.atomicSwap,
        { assays: swapAssays },
      );

      // Bob wants to swap an invite with the same units as his
      // current invite from Alice. He wants 1 buck in return.
      const bobOfferRulesSwap = harden({
        payoutRules: [
          {
            kind: 'offerAtMost',
            units: optionUnits,
          },
          {
            kind: 'wantAtLeast',
            units: bucks(1),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const bobSwapPayments = [invite, undefined];

      // Bob escrows his option in the swap
      const { seat: bobSwapSeat, payout: payoutP } = await E(zoe).redeem(
        bobSwapInvite,
        bobOfferRulesSwap,
        bobSwapPayments,
      );

      // Bob makes an offer to the swap with his "higher order"
      const daveSwapInviteP = E(bobSwapSeat).makeFirstOffer();
      log('swap invite made');
      await E(daveP).doSwapForOption(daveSwapInviteP, optionUnits);

      const bobResult = await payoutP;

      // Bob deposits his winnings
      await E(bucksPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
      await showPaymentBalance(bucksPurseP, 'bobBucksPurse;', log);
    },
    doPublicAuction: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const { extent: inviteExtent } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent.instanceHandle,
      );
      insist(
        installationHandle === installations.publicAuction,
      )`wrong installation`;
      insist(
        sameStructure(harden([moolaAssay, simoleanAssay]), terms.assays),
      )`assays were not as expected`;
      insist(sameStructure(inviteExtent.minimumBid, simoleans(3)));
      insist(sameStructure(inviteExtent.auctionedAssets, moola(1)));

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(1),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(11),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        offerRules,
        offerPayments,
      );

      const offerResult = await E(seat).bid();

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doAtomicSwap: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const { extent: inviteExtent } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent.instanceHandle,
      );
      insist(
        installationHandle === installations.atomicSwap,
      )`wrong installation`;
      insist(
        sameStructure(harden([moolaAssay, simoleanAssay]), terms.assays),
      )`assays were not as expected`;

      const expectedFirstOfferPayoutRules = harden([
        {
          kind: 'offerAtMost',
          units: moola(3),
        },
        {
          kind: 'wantAtLeast',
          units: simoleans(7),
        },
      ]);
      insist(
        sameStructure(
          inviteExtent.offerMadeRules,
          expectedFirstOfferPayoutRules,
        ),
      )`Alice made a different offer than expected`;

      const offerRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(3),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        offerRules,
        offerPayments,
      );

      const offerResult = await E(seat).matchOffer();

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doSimpleExchange: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const { extent: inviteExtent } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent.instanceHandle,
      );
      insist(
        installationHandle === installations.simpleExchange,
      )`wrong installation`;
      insist(
        sameStructure(harden([moolaAssay, simoleanAssay]), terms.assays),
      )`assays were not as expected`;

      const bobBuyOrderOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(3),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(7),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const simoleanPayment = await E(simoleanPurseP).withdrawAll();
      const offerPayments = [undefined, simoleanPayment];

      const { seat, payout: payoutP } = await E(zoe).redeem(
        invite,
        bobBuyOrderOfferRules,
        offerPayments,
      );

      const offerResult = await E(seat).addOrder();

      log(offerResult);

      const bobResult = await payoutP;

      await E(moolaPurseP).depositAll(bobResult[0]);
      await E(simoleanPurseP).depositAll(bobResult[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
    },
    doAutoswap: async inviteP => {
      const invite = await E(inviteAssay).claimAll(inviteP);
      const { extent: inviteExtent } = await E(invite).getBalance();

      const { installationHandle, terms } = await E(zoe).getInstance(
        inviteExtent.instanceHandle,
      );
      insist(installationHandle === installations.autoswap)`wrong installation`;
      const {
        extent: { instanceHandle },
      } = await E(invite).getBalance();
      const { publicAPI } = await E(zoe).getInstance(instanceHandle);
      const liquidityAssay = await E(publicAPI).getLiquidityAssay();
      const liquidityUnitOps = await getLocalUnitOps(liquidityAssay);
      const liquidity = liquidityUnitOps.make;
      const allAssays = harden([...assays, liquidityAssay]);
      insist(
        sameStructure(allAssays, terms.assays),
      )`assays were not as expected`;

      // bob checks the price of 2 moola. The price is 1 simolean
      const simoleanUnits = await E(publicAPI).getPrice(moola(2));
      log(simoleanUnits);

      const moolaForSimOfferRules = harden({
        payoutRules: [
          {
            kind: 'offerAtMost',
            units: moola(2),
          },
          {
            kind: 'wantAtLeast',
            units: simoleans(1),
          },
          {
            kind: 'wantAtLeast',
            units: liquidity(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });

      const moolaPayment = E(moolaPurseP).withdrawAll();
      const moolaForSimPayments = [moolaPayment, undefined, undefined];
      const { seat, payout: moolaForSimPayoutP } = await E(zoe).redeem(
        invite,
        moolaForSimOfferRules,
        moolaForSimPayments,
      );

      const offerResult = await E(seat).swap();

      log(offerResult);

      const moolaForSimPayout = await moolaForSimPayoutP;

      await E(moolaPurseP).depositAll(moolaForSimPayout[0]);
      await E(simoleanPurseP).depositAll(moolaForSimPayout[1]);

      // Bob looks up the price of 3 simoleans. It's 6 moola
      const moolaUnits = await E(publicAPI).getPrice(simoleans(3));
      log(moolaUnits);

      // Bob makes another offer and swaps
      const bobSimsForMoolaOfferRules = harden({
        payoutRules: [
          {
            kind: 'wantAtLeast',
            units: moola(6),
          },
          {
            kind: 'offerAtMost',
            units: simoleans(3),
          },
          {
            kind: 'wantAtLeast',
            units: liquidity(0),
          },
        ],
        exitRule: {
          kind: 'onDemand',
        },
      });
      const bobSimoleanPayment = await E(simoleanPurseP).withdraw(simoleans(3));
      const simsForMoolaPayments = [undefined, bobSimoleanPayment, undefined];
      const invite2 = await E(publicAPI).makeInvite();

      const { seat: seat2, payout: bobSimsForMoolaPayoutP } = await E(
        zoe,
      ).redeem(invite2, bobSimsForMoolaOfferRules, simsForMoolaPayments);

      const simsForMoolaOutcome = await E(seat2).swap();
      log(simsForMoolaOutcome);

      const simsForMoolaPayout = await bobSimsForMoolaPayoutP;

      await E(moolaPurseP).depositAll(simsForMoolaPayout[0]);
      await E(simoleanPurseP).depositAll(simsForMoolaPayout[1]);

      await showPaymentBalance(moolaPurseP, 'bobMoolaPurse', log);
      await showPaymentBalance(simoleanPurseP, 'bobSimoleanPurse;', log);
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
