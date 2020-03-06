import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';

import makeStore from '@agoric/store';

// This vat contains two starting mints for demos: moolaMint and
// simoleanMint.

function build(_E, _log) {
  const mintsAndMath = makeStore();

  const api = harden({
    getAllissuerNames: () => mintsAndMath.keys(),
    getIssuer: issuerName => {
      const mint = mintsAndMath.get(issuerName);
      mint.getIssuer();
    },
    getAssays: issuerNames => issuerNames.map(api.getIssuer),

    // NOTE: having a reference to a mint object gives the ability to mint
    // new digital assets, a very powerful authority. This authority
    // should be closely held.
    getMint: name => mintsAndMath.get(name).mint,
    getMints: issuerNames => issuerNames.map(api.getMint),
    // For example, issuerNameSingular might be 'moola', or 'simolean'
    makeMintAndIssuer: issuerNameSingular => {
      const { mint, issuer, amountMath } = produceIssuer(issuerNameSingular);
      mintsAndMath.init(issuerNameSingular, { mint, amountMath });
      return issuer;
    },
    mintInitialPayment: (issuerName, extent) => {
      const { mint, amountMath } = mintsAndMath.get(issuerName);
      const amount = amountMath.make(extent);
      return mint.mintPayment(amount);
    },
    mintInitialPayments: (issuerNames, extents) =>
      issuerNames.map((issuerName, i) =>
        api.mintInitialPayment(issuerName, extents[i]),
      ),
  });

  return api;
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
