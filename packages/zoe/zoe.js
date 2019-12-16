import harden from '@agoric/harden';
import { E } from '@agoric/eventual-send';

import { insist } from '@agoric/ertp/util/insist';
import makePromise from '@agoric/ertp/util/makePromise';
import { makeMint } from '@agoric/ertp/core/mint';

import { isOfferSafeForAll } from './isOfferSafe';
import { areRightsConserved } from './areRightsConserved';
import { evalContractCode } from './evalContractCode';
import { makeTables } from './state';
import { makeSeatMint } from './seatMint';
import { makeEscrowReceiptConfig } from './escrowReceiptConfig';

/**
 * Create an instance of Zoe.
 *
 * @param additionalEndowments pure or pure-ish endowments to add to evaluator
 */
const makeZoe = (additionalEndowments = {}) => {
  // Zoe has two mints: a mint for invites and a mint for
  // escrowReceipts. The invite mint can be used by a smart contract
  // to create invites to take certain actions in the smart contract.
  // An escrowReceipt is an ERTP payment that is proof of
  // escrowing assets with Zoe.
  const {
    seatMint: inviteMint,
    seatAssay: inviteAssay,
    addUseObj: addInviteSeat,
  } = makeSeatMint('zoeInvite');

  const escrowReceiptMint = makeMint(
    'zoeEscrowReceipts',
    makeEscrowReceiptConfig,
  );
  const escrowReceiptAssay = escrowReceiptMint.getAssay();

  // All of the Zoe state is stored in these tables built on WeakMaps
  const {
    installationTable,
    instanceTable,
    offerTable,
    payoutMap,
    assayTable,
  } = makeTables();

  // Helper functions
  const getAssaysFromPayoutRules = payoutRules =>
    payoutRules.map(payoutRule => payoutRule.units.label.assay);

  // In the future, this function will take `offerHandles` and
  // `assays` as parameters.
  const completeOffers = offerHandles => {
    const { inactive } = offerTable.getOfferStatuses(offerHandles);
    if (inactive.length > 0) {
      throw new Error(`offer has already completed`);
    }

    // In the future, when `assays` is a parameter, these next two
    // lines can be deleted
    const payoutRules = offerTable.getPayoutRules(offerHandles[0]);
    const assays = getAssaysFromPayoutRules(payoutRules);

    const unitMatrix = offerTable.getUnitMatrix(offerHandles, assays);

    // Remove the offers from the offerTable so that they are no
    // longer active.
    offerTable.deleteOffers(offerHandles);

    // Resolve the payout promises with the payouts
    const pursesP = assayTable.getPursesForAssays(assays);
    Promise.all(pursesP).then(purses => {
      for (let i = 0; i < offerHandles.length; i += 1) {
        const offerHandle = offerHandles[i];
        const unitsForOffer = unitMatrix[i];
        // This Promise.all will be taken out in a later PR.
        const payout = Promise.all(
          unitsForOffer.map((units, j) =>
            E(purses[j]).withdraw(units, 'payout'),
          ),
        );
        payoutMap.get(offerHandle).res(payout);
      }
    });
  };

  // Create payoutRules in which nothing is offered and anything
  // greater than or equal to 'empty' satisfies offer safety.
  const makeEmptyPayoutRules = unitOpsArray =>
    unitOpsArray.map(unitOps =>
      harden({
        kind: 'wantAtLeast',
        units: unitOps.empty(),
      }),
    );

  // Make a Zoe invite with an extent that is a mix of credible
  // information from Zoe (the `handle` and `instanceHandle`) and
  // other information defined by the smart contract. Note that the
  // smart contract cannot override or change the values of `handle`
  // and `instanceHandle`.
  const makeInvite = (
    instanceHandle,
    seat,
    contractDefinedExtent = harden({}),
  ) => {
    const inviteHandle = harden({});
    const inviteUnits = inviteAssay.makeUnits(
      harden({
        ...contractDefinedExtent,
        handle: inviteHandle,
        instanceHandle,
      }),
    );
    const invitePurse = inviteMint.mint(inviteUnits);
    addInviteSeat(inviteHandle, seat);
    const invitePayment = invitePurse.withdrawAll();
    return invitePayment;
  };

  // Zoe has two different facets: the public Zoe service and the
  // contract facet. The contract facet is what is accessible to the
  // smart contract instance and is remade for each instance. The
  // contract at no time has access to the users' payments or the Zoe
  // purses. The contract can only do a few things through the Zoe
  // contract facet. It can propose a reallocation of units,
  // complete an offer, and can create a new offer itself for
  // record-keeping and other various purposes.

  const makeContractFacet = instanceHandle => {
    const contractFacet = harden({
      /**
       * The contract can propose a reallocation of extents per
       * offer, which will only succeed if the reallocation 1)
       * conserves rights, and 2) is 'offer-safe' for all parties
       * involved. This reallocation is partial, meaning that it
       * applies only to the extents associated with the offerHandles
       * that are passed in. We are able to ensure that with
       * each reallocation, rights are conserved and offer safety is
       * enforced for all offers, even though the reallocation is
       * partial, because once these invariants are true, they will
       * remain true until changes are made.
       * @param  {object[]} offerHandles - an array of offerHandles
       * @param  {unit[][]} newExtentMatrix - a matrix of extents, with
       * one array of extents per offerHandle.
       */
      reallocate: (offerHandles, newExtentMatrix) => {
        const { assays } = instanceTable.get(instanceHandle);

        const payoutRuleMatrix = offerTable.getPayoutRuleMatrix(offerHandles);
        const currentExtentMatrix = offerTable.getExtentMatrix(offerHandles);
        const extentOpsArray = assayTable.getExtentOpsForAssays(assays);

        // 1) ensure that rights are conserved
        insist(
          areRightsConserved(
            extentOpsArray,
            currentExtentMatrix,
            newExtentMatrix,
          ),
        )`Rights are not conserved in the proposed reallocation`;

        // 2) ensure 'offer safety' for each player
        insist(
          isOfferSafeForAll(extentOpsArray, payoutRuleMatrix, newExtentMatrix),
        )`The proposed reallocation was not offer safe`;

        // 3) save the reallocation
        //    Note: We update both extents and units so that units can be
        //    used in the future.
        offerTable.updateExtentMatrix(offerHandles, newExtentMatrix);
        const unitOpsArray = assayTable.getUnitOpsForAssays(assays);
        const newUnitMatrix = newExtentMatrix.map(extentsRow =>
          extentsRow.map((extent, i) => unitOpsArray[i].make(extent)),
        );
        offerTable.updateUnitMatrix(offerHandles, newUnitMatrix);
      },

      /**
       * The contract can "complete" an offer to remove it from the
       * ongoing contract and resolve the player's payouts (either
       * winnings or refunds). Because Zoe only allows for
       * reallocations that conserve rights and are 'offer-safe', we
       * don't need to do those checks at this step and can assume
       * that the invariants hold.
       * @param  {object[]} offerHandles - an array of offerHandles
       */
      complete: completeOffers,

      /**
       * The contract can create an "empty" offer. This is used by the
       * autoswap contract to create an offer representing the
       * liquidity pool balances.
       */
      escrowEmptyOffer: () => {
        const { assays } = instanceTable.get(instanceHandle);
        const offerHandle = harden({});
        const unitOpsArray = assayTable.getUnitOpsForAssays(assays);
        const extentOpsArray = assayTable.getExtentOpsForAssays(assays);
        const offerRecord = {
          instanceHandle,
          payoutRules: makeEmptyPayoutRules(unitOpsArray),
          exitRule: { kind: 'onDemand' },
          assays,
          units: unitOpsArray.map(unitOps => unitOps.empty()),
          extents: extentOpsArray.map(extentOps => extentOps.empty()),
        };
        offerTable.create(offerHandle, offerRecord);
        payoutMap.init(offerHandle, makePromise());
        return offerHandle;
      },

      /**
       * The contract can also make an real offer with offerRules and
       * ERTP payments. Autoswap uses this method to introduce newly
       * minted liquidity tokens to Zoe.
       */
      escrowOffer: (offerRules, offerPayments) => {
        const { assays } = instanceTable.get(instanceHandle);
        const offerHandle = harden({});
        const offerImmutableRecord = {
          instanceHandle,
          payoutRules: offerRules.payoutRules,
          exitRule: offerRules.exitRule,
          assays,
          units: undefined,
          extents: undefined,
        };
        offerTable.create(offerHandle, offerImmutableRecord);
        payoutMap.init(offerHandle, makePromise());

        // Promise flow = assay -> purse -> deposit payment -> record units
        const paymentBalancesP = assays.map((assay, i) => {
          const { purseP, unitOpsP } = assayTable.getOrCreateAssay(assay);
          const offerPayment = offerPayments[i];

          return Promise.all([purseP, unitOpsP]).then(([purse, unitOps]) => {
            if (offerPayment !== undefined) {
              // We cannot trust these units since they come directly
              // from the remote assay. We must coerce them.
              return E(purse)
                .depositAll(offerPayment)
                .then(units => unitOps.coerce(units));
            }
            return Promise.resolve(unitOps.empty());
          });
        });
        const allDepositedP = Promise.all(paymentBalancesP);
        return allDepositedP.then(unitsArray => {
          const extentsArray = unitsArray.map(units => units.extent);
          offerTable.update(
            offerHandle,
            harden({
              units: unitsArray,
              extents: extentsArray,
            }),
          );
          return offerHandle;
        });
      },

      // This method will be eliminated in the near future in favor of
      // requiring invites to make offers.
      burnEscrowReceipt: async escrowReceipt => {
        const units = await escrowReceiptAssay.burnAll(escrowReceipt);
        const { offerHandle } = units.extent;
        if (!offerTable.isOfferActive(offerHandle)) {
          return Promise.reject(new Error('offer was cancelled'));
        }
        offerTable.recordUsedInInstance(offerHandle, instanceHandle);
        return units.extent;
      },

      /**
       * Make a credible Zoe invite for a particular smart contract
       * indicated by the unique `instanceHandle`. The other
       * information in the extent of this invite is decided by the
       * governing contract and should include whatever information is
       * necessary for a potential buyer of the invite to know what
       * they are getting. Note: if information can be derived in
       * queries based on other information, we choose to omit it. For
       * instance, `installationHandle` can be derived from
       * `instanceHandle` and is omitted even though it is useful.
       * @param  {object} contractDefinedExtent - an object of
       * information to include in the extent, as defined by the smart
       * contract
       * @param  {object} seat - an object defined by the smart
       * contract that is the use right associated with the invite. In
       * other words, buying the invite is buying the right to call
       * methods on this object.
       */
      makeInvite: (contractDefinedExtent, seat) =>
        makeInvite(instanceHandle, seat, contractDefinedExtent),
      getInviteAssay: () => inviteAssay,

      // To be used by contracts in the near future.
      // getPayoutRuleMatrix: offerTable.getPayoutRuleMatrix,
      // getUnitOpsForAssays: assayTable.getUnitOpsForAssays,
      // getOfferStatuses: offerTable.getOfferStatuses,
      // getUnitMatrix: offerTable.getUnitMatrix,
      // getPayoutRules: offerTable.getPayoutRules,
      // getExitRule: offerTable.getExitRule,
      // isOfferActive: offerTable.isOfferActive,

      // This methods will be replaced by the above methods in the
      // near future.
      getStatusFor: offerTable.getOfferStatuses,
      getExtentsFor: offerTable.getExtentsFor,
      getExtentOpsArray: () => {
        const { assays } = instanceTable.get(instanceHandle);
        return assayTable.getExtentOpsForAssays(assays);
      },
      getPayoutRulesFor: offerTable.getPayoutRuleMatrix,
      makeEmptyExtents: () => {
        const { assays } = instanceTable.get(instanceHandle);
        const extentOpsArray = assayTable.getExtentOpsForAssays(assays);
        return extentOpsArray.map(extentOps => extentOps.empty());
      },
      getLabels: () => {
        const { assays } = instanceTable.get(instanceHandle);
        return assayTable.getLabelsForAssays(assays);
      },
    });
    return contractFacet;
  };

  // The public Zoe service has four main methods: `install` takes
  // contract code and registers it with Zoe associated with an
  // `installationHandle` for identification, `makeInstance` creates
  // an instance from an installation, `getInstance` credibly
  // retrieves an instance from Zoe, and `escrow` allows users to
  // securely escrow and get an escrow receipt and payouts in return.

  const zoeService = harden({
    getInviteAssay: () => inviteAssay,

    // This method will be eliminated in the near future.
    getEscrowReceiptAssay: () => escrowReceiptAssay,

    // This method will be eliminated in the near future.
    getAssaysForInstance: instanceHandle =>
      instanceTable.get(instanceHandle).assays,

    /**
     * Create an installation by safely evaluating the code and
     * registering it with Zoe. We have a moduleFormat to allow for
     * different future formats without silent failures.
     */
    install: (code, moduleFormat = 'getExport') => {
      let installation;
      switch (moduleFormat) {
        case 'getExport': {
          installation = evalContractCode(code, additionalEndowments);
          break;
        }
        default: {
          insist(false)`\
Unimplemented installation moduleFormat ${moduleFormat}`;
        }
      }
      const installationHandle = harden({});
      const { handle } = installationTable.create(
        installationHandle,
        harden({ installation }),
      );
      return handle;
    },

    /**
     * Makes a contract instance from an installation and returns a
     * unique handle for the instance that can be shared, as well as
     * other information, such as the terms used in the instance.
     * @param  {object} installationHandle - the unique handle for the
     * installation
     * @param  {object} terms - arguments to the contract. These
     * arguments depend on the contract, apart from the `assays`
     * property, which is required.
     */
    makeInstance: (installationHandle, terms) => {
      const { installation } = installationTable.get(installationHandle);
      const instanceHandle = harden({});
      const contractFacet = makeContractFacet(instanceHandle);
      const { instance, assays } = installation.makeContract(
        contractFacet,
        terms,
      );

      const finalTerms = {
        ...terms,
        assays,
      };
      const instanceRecord = harden({
        installationHandle,
        instance,
        assays,
        terms: finalTerms,
      });

      instanceTable.create(instanceHandle, instanceRecord);
      return harden({
        ...instanceRecord,
        instanceHandle,
      });
    },
    /**
     * Credibly retrieves an instance record given an instanceHandle.
     * @param {object} instanceHandle - the unique, unforgeable
     * identifier (empty object) for the instance
     */
    getInstance: instanceTable.get,

    /**
     * Escrow with Zoe and receive an escrow receipt and payout
     * promise.
     * @param  {offerRule[]} offerRules - the offer rules, an object
     * with properties `payoutRules` and `exitRule`.
     * @param  {payment[]} offerPayments - payments corresponding to
     * the offer rules. A payment may be `undefined` in the case of
     * specifying a `want`.
     */
    escrow: (offerRules, offerPayments) => {
      const assays = getAssaysFromPayoutRules(offerRules.payoutRules);

      const offerHandle = harden({});

      const offerImmutableRecord = {
        instanceHandle: undefined,
        payoutRules: offerRules.payoutRules,
        exitRule: offerRules.exitRule,
        assays,
        units: undefined,
        extents: undefined,
      };

      // units should only be gotten after the payments are deposited
      offerTable.create(offerHandle, offerImmutableRecord);
      payoutMap.init(offerHandle, makePromise());

      // Promise flow = assay -> purse -> deposit payment -> escrow receipt
      const paymentBalancesP = assays.map((assay, i) => {
        const { purseP, unitOpsP } = assayTable.getOrCreateAssay(assay);
        const payoutRule = offerRules.payoutRules[i];
        const offerPayment = offerPayments[i];

        return Promise.all([purseP, unitOpsP]).then(([purse, unitOps]) => {
          if (
            payoutRule.kind === 'offerExactly' ||
            payoutRule.kind === 'offerAtMost'
          ) {
            // We cannot trust these units since they come directly
            // from the remote assay and must coerce them.
            return E(purse)
              .depositExactly(payoutRule.units, offerPayment)
              .then(units => unitOps.coerce(units));
          }
          insist(
            offerPayments[i] === undefined,
          )`payment was included, but the rule kind was ${payoutRule.kind}`;
          return Promise.resolve(unitOps.empty());
        });
      });

      const giveEscrowReceipt = unitsArray => {
        // Record units for offer.
        // Record the extents as well for backwards compatibility.
        const extentsArray = unitsArray.map(units => units.extent);
        offerTable.update(offerHandle, {
          units: unitsArray,
          extents: extentsArray,
        });

        const escrowReceiptExtent = harden({
          offerHandle,
          offerRules,
        });
        const escrowReceiptPurse = escrowReceiptMint.mint(escrowReceiptExtent);
        const escrowReceipt = escrowReceiptPurse.withdrawAll();

        // Create escrow result to be returned. Depends on exitRules.
        const escrowResult = {
          escrowReceipt,
          payout: payoutMap.get(offerHandle).p,
        };
        const { exitRule } = offerRules;

        // Automatically cancel on deadline.
        if (exitRule.kind === 'afterDeadline') {
          exitRule.timer.setWakeup(
            exitRule.deadline,
            harden({
              wake: () => completeOffers(harden([offerHandle])),
            }),
          );
        }

        // Add an object with a cancel method to escrow result in
        // order to cancel on demand.
        if (exitRule.kind === 'onDemand') {
          escrowResult.cancelObj = {
            cancel: () => completeOffers(harden([offerHandle])),
          };
        }
        return harden(escrowResult);
      };

      const allDepositedP = Promise.all(paymentBalancesP);
      return allDepositedP.then(giveEscrowReceipt);
    },
  });
  return zoeService;
};

export { makeZoe };
