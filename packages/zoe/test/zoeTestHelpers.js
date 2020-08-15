export const assertPayoutAmount = (t, issuer, payout, expectedAmount) => {
  issuer.getAmountOf(payout).then(amount => {
    t.deepEquals(amount, expectedAmount, `payout was ${amount.value}`);
  });
};

export const assertPayoutDeposit = (t, payout, purse, amount) => {
  payout.then(payment => {
    purse.deposit(payment);
    t.deepEquals(
      purse.getCurrentAmount(),
      amount,
      `payout was ${purse.getCurrentAmount().value}, expected ${amount}.value`,
    );
  });
};

export const assertOfferResult = (t, seat, expected) => {
  seat.getOfferResult().then(
    result => t.equals(result, expected, `offer result as expected`),
    e => t.fail(`expecting offer result to be ${expected}, ${e}`),
  );
};

export const assertRejectedOfferResult = (t, seat, expected) => {
  seat.getOfferResult().then(
    result => t.fail(`expected offer result to be rejected, got ${result}`),
    e => t.equals(e, expected, 'Expected offer to be rejected'),
  );
};
