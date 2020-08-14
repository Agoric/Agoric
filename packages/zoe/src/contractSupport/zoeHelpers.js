// @ts-check

import { assert, details } from '@agoric/assert';
import { sameStructure } from '@agoric/same-structure';
import { E } from '@agoric/eventual-send';

import { MathKind } from '@agoric/ertp/src/amountMath';
import { satisfiesWant } from '../contractFacet/offerSafety';

import '../../exported';

export const defaultRejectMsg = `The offer was invalid. Please check your refund.`;
export const defaultAcceptanceMsg = `The offer has been accepted. Once the contract has been completed, please check your payout`;

const getKeysSorted = obj =>
  harden(Object.getOwnPropertyNames(obj || {}).sort());

// Compare actual keys to expected keys. If expectedKeys is
// undefined, return true trivially.
const checkKeys = (actual, expected) => {
  if (expected === undefined) {
    return true;
  }
  return sameStructure(getKeysSorted(actual), getKeysSorted(expected));
};

/**
 * Given toGains (an AmountKeywordRecord), and allocations (a pair,
 * 'to' and 'from', of AmountKeywordRecords), all the entries in
 * toGains will be added to 'to'. If fromLosses is defined, all the
 * entries in fromLosses are subtracted from 'from'. (If fromLosses
 * is not defined, toGains is subtracted from 'from'.)
 * @param {ContractFacet} zcf
 * @param {FromToAllocations} allocations - the 'to' and 'from'
 * allocations
 * @param {AmountKeywordRecord} toGains - what should be gained in
 * the 'to' allocation
 * @param {AmountKeywordRecord} [fromLosses=toGains] - what should be lost in
 * the 'from' allocation. If not defined, fromLosses is equal to
 * toGains. Note that the total amounts should always be equal; it
 * is the keywords that might be different.
 * @returns {FromToAllocations} allocations - new allocations
 *
 * @typedef FromToAllocations
 * @property {AmountKeywordRecord} from
 * @property {AmountKeywordRecord} to
 */
const calcNewAllocations = (
  zcf,
  allocations,
  toGains,
  fromLosses = toGains,
) => {
  const subtract = (amount, amountToSubtract) => {
    const { brand } = amount;
    const amountMath = zcf.getAmountMath(brand);
    if (amountToSubtract !== undefined) {
      return amountMath.subtract(amount, amountToSubtract);
    }
    return amount;
  };

  const add = (amount, amountToAdd) => {
    if (amount && amountToAdd) {
      const { brand } = amount;
      const amountMath = zcf.getAmountMath(brand);
      return amountMath.add(amount, amountToAdd);
    }
    return amount || amountToAdd;
  };

  const newFromAllocation = Object.fromEntries(
    Object.entries(allocations.from).map(([keyword, allocAmount]) => {
      return [keyword, subtract(allocAmount, fromLosses[keyword])];
    }),
  );

  const allToKeywords = [
    ...Object.keys(toGains),
    ...Object.keys(allocations.to),
  ];

  const newToAllocation = Object.fromEntries(
    allToKeywords.map(keyword => [
      keyword,
      add(allocations.to[keyword], toGains[keyword]),
    ]),
  );

  return harden({
    from: newFromAllocation,
    to: newToAllocation,
  });
};

const mergeAllocations = (currentAllocation, allocation) => {
  const newAllocation = {
    ...currentAllocation,
    ...allocation,
  };
  return newAllocation;
};

export const assertIssuerKeywords = (zcf, expected) => {
  const { issuers } = zcf.getTerms();
  const actual = getKeysSorted(issuers);
  expected = [...expected]; // in case hardened
  expected.sort();
  assert(
    sameStructure(actual, harden(expected)),
    details`keywords: ${actual} were not as expected: ${expected}`,
  );
};

/**
 * Check if the keywords match expected. Returns a boolean and does
 * not throw.
 * @param {ZCFSeat} seat
 * @param {ExpectedRecord} expected
 * @returns {boolean}
 */
export const checkIfProposal = (seat, expected) => {
  const actual = seat.getProposal();
  return (
    // Check that the "give" keys match expected keys.
    checkKeys(actual.give, expected.give) &&
    // Check that the "want" keys match expected keys.
    checkKeys(actual.want, expected.want) &&
    // Check that the "exit" key (i.e. "onDemand") matches the expected key.
    checkKeys(actual.exit, expected.exit)
  );
};

/**
 * Check whether an update to currentAllocation satisfies
 * proposal.want. Note that this is half of the offer safety
 * check; whether the allocation constitutes a refund is not
 * checked. Allocation is merged with currentAllocation
 * (allocations' values prevailing if the keywords are the same)
 * to produce the newAllocation.
 * @param {ContractFacet} zcf
 * @param {ZCFSeat} seat
 * @param {Allocation} allocation
 * @returns {boolean}
 */
export const satisfies = (zcf, seat, allocation) => {
  const currentAllocation = seat.getCurrentAllocation();
  const newAllocation = mergeAllocations(currentAllocation, allocation);
  const proposal = seat.getProposal();
  return satisfiesWant(zcf.getAmountMath, proposal, newAllocation);
};

/** @type {Trade} */
export const trade = (zcf, keepLeft, tryRight) => {
  assert(
    keepLeft.seat !== tryRight.seat,
    details`an offer cannot trade with itself`,
  );
  let leftAllocation = keepLeft.seat.getCurrentAllocation();
  let rightAllocation = tryRight.seat.getCurrentAllocation();
  try {
    // for all the keywords and amounts in leftGains, transfer from
    // right to left
    ({ from: rightAllocation, to: leftAllocation } = calcNewAllocations(
      zcf,
      { from: rightAllocation, to: leftAllocation },
      keepLeft.gains,
      tryRight.losses,
    ));
    // For all the keywords and amounts in rightGains, transfer from
    // left to right
    ({ from: leftAllocation, to: rightAllocation } = calcNewAllocations(
      zcf,
      { from: leftAllocation, to: rightAllocation },
      tryRight.gains,
      keepLeft.losses,
    ));
  } catch (err) {
    console.log(err);
    throw tryRight.seat.kickOut();
  }

  // Check whether reallocate would error before calling. If
  // it would error, reject the right offer and return.
  const offerSafeForLeft = keepLeft.seat.isOfferSafe(leftAllocation);
  const offerSafeForRight = tryRight.seat.isOfferSafe(rightAllocation);
  if (!(offerSafeForLeft && offerSafeForRight)) {
    console.log(`currentLeftAllocation`, keepLeft.seat.getCurrentAllocation());
    console.log(`currentRightAllocation`, tryRight.seat.getCurrentAllocation());
    console.log(`proposed left reallocation`, leftAllocation);
    console.log(`proposed right reallocation`, rightAllocation);
    // show the constraints
    console.log(`left want`, keepLeft.seat.getProposal().want);
    console.log(`right want`, tryRight.seat.getProposal().want);

    if (!offerSafeForLeft) {
      console.log(`offer not safe for left`);
    }
    if (!offerSafeForRight) {
      console.log(`offer not safe for right`);
    }
    return tryRight.seat.kickOut();
  }

  return zcf.reallocate(
    keepLeft.seat.stage(leftAllocation),
    tryRight.seat.stage(rightAllocation),
  );
};

/**
 * If the two handles can trade, then swap their compatible assets,
 * marking both offers as complete.
 *
 * The surplus remains with the original offer. For example if
 * offer A gives 5 moola and offer B only wants 3 moola, offer A
 * retains 2 moola.
 *
 * If the keep offer is no longer active (it was already completed), the try
 * offer will be rejected with a message (provided by 'keepHandleInactiveMsg').
 *
 * TODO: If the try offer is no longer active, swap() should terminate with
 * a useful error message, like defaultRejectMsg.
 *
 * If the swap fails, no assets are transferred, and the 'try' offer is rejected.
 *
 * @param {ZCFSeat} keepSeat
 * @param {ZCFSeat} trySeat
 * @param {String} [keepHandleInactiveMsg]
 */
export const swap = (
  zcf,
  keepSeat,
  trySeat,
  keepHandleInactiveMsg = 'prior offer is unavailable',
) => {
  if (keepSeat.hasExited()) {
    throw trySeat.kickOut(keepHandleInactiveMsg);
  }

  trade(
    zcf,
    {
      seat: keepSeat,
      gains: keepSeat.getProposal().want,
    },
    {
      seat: trySeat,
      gains: trySeat.getProposal().want,
    },
  );

  keepSeat.exit();
  trySeat.exit();
  return defaultAcceptanceMsg;
};

/**
 * @typedef ExpectedRecord
 * @property {Record<keyof ProposalRecord['give'],null>} [want]
 * @property {Record<keyof ProposalRecord['want'],null>} [give]
 * @property {Partial<Record<keyof ProposalRecord['exit'],null>>} [exit]
 */

/**
 * Make an offerHook that wraps the provided `offerHook`, to first
 * check the submitted offer against an `expected` record that says
 * what shape of proposal is acceptable.
 *
 * This ExpectedRecord is like a Proposal, but the amounts in 'want'
 * and 'give' should be null; the exit clause should specify a rule with
 * null contents. If the client submits an Offer which does not match
 * these expectations, that offer will be rejected (and refunded).
 *
 * @param {OfferHandler} offerHandler
 * @param {ExpectedRecord} expected
 */
export const assertProposalKeywords = (offerHandler, expected) =>
  /** @param {ZCFSeat} seat */
  seat => {
    const actual = seat.getProposal();
    // Does not check values
    const assertKeys = (a, e) => {
      if (e !== undefined) {
        assert(
          sameStructure(getKeysSorted(a), getKeysSorted(e)),
          details`actual ${a} did not match expected ${e}`,
        );
      }
    };
    assertKeys(actual.give, expected.give);
    assertKeys(actual.want, expected.want);
    assertKeys(actual.exit, expected.exit);
    return offerHandler(seat);
  };

/**
 * Escrow payments with Zoe and reallocate the amount of each
 * payment to a recipient.
 *
 * @param {ContractFacet} zcf
 * @param {ZCFSeat} recipientSeat
 * @param {AmountKeywordRecord} giveAmountKeywordRecord - the keywords
 * and amounts to give to recipient. Keywords must match the keywords
 * for the payments.
 * @param {PaymentKeywordRecord} paymentKeywordRecord
 * @returns {Promise<void>}
 */
export const escrowAndAllocateTo = (
  zcf,
  recipientSeat,
  giveAmountKeywordRecord,
  paymentKeywordRecord,
) => {
  // We will create a temporary seat to be able to escrow our payment
  // with Zoe.
  let tempSeat;

  // We need to make an invitation and store the seat associated with
  // that invitation for future use
  const contractSelfInvite = zcf.makeInvitation(
    seat => (tempSeat = seat),
    'self invite',
  );
  // To escrow the payments, we must get the Zoe Service facet and
  // make an offer
  const proposal = harden({ give: giveAmountKeywordRecord });

  return E(zcf.getZoeService())
    .offer(contractSelfInvite, proposal, paymentKeywordRecord)
    .then(() => {
      // At this point, the temporary offer has the amount from the
      // payment but nothing else. The recipient offer may have any
      // allocation, so we can't assume the allocation is currently empty for this
      // keyword.

      trade(
        zcf,
        {
          seat: tempSeat,
          gains: {},
          losses: giveAmountKeywordRecord,
        },
        {
          seat: recipientSeat,
          gains: giveAmountKeywordRecord,
        },
      );

      // Exit the temporary seat
      tempSeat.exit();

      // Now, the temporary seat no longer exists, but the recipient
      // seat is allocated the value of the payment.
    });
};

/* Given a brand, assert that the issuer uses NAT amountMath. */
export const assertUsesNatMath = (zcf, brand) => {
  const amountMath = zcf.getAmountMath(brand);
  assert(
    amountMath.getAmountMathKind() === MathKind.NAT,
    details`issuer must use NAT amountMath`,
  );
};
