// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';
import makeAmountMath from '@agoric/ertp/src/amountMath';

import { escrowExchangeSrcs } from '../../../src/escrow';
import { coveredCallSrcs } from '../../../src/coveredCall';

function build(E, log) {
  // TODO BUG: All callers should wait until settled before doing
  // anything that would change the balance before show*Balance* reads
  // it.
  function showPaymentBalance(name, issuer, paymentP) {
    return paymentP.then(payment => {
      return E(issuer)
        .getAmountOf(payment)
        .then(amount => log(name, ' balance ', amount))
        .catch(err => console.log(err));
    });
  }
  // TODO BUG: All callers should wait until settled before doing
  // anything that would change the balance before show*Balance* reads
  // it.
  function showPurseBalances(name, purseP) {
    return Promise.all([
      E(purseP)
        .getCurrentAmount()
        .then(amount => log(name, ' balance ', amount))
        .catch(err => console.log(err)),
    ]);
  }

  const getLocalAmountMath = issuer =>
    Promise.all([
      E(issuer).getBrand(),
      E(issuer).getMathHelpersName(),
    ]).then(([brand, mathHelpersName]) =>
      makeAmountMath(brand, mathHelpersName),
    );

  const fakeNeverTimer = harden({
    setWakeup(deadline, _resolution = undefined) {
      log(`Pretend ${deadline} never happens`);
      return deadline;
    },
  });

  function trivialContractTest(host) {
    log('starting trivialContractTest');

    const trivContract = harden({
      start: (terms, inviteMaker) => {
        return inviteMaker.make('foo', 8);
      },
    });
    const contractSrcs = harden({ start: `${trivContract.start} ` });

    const installationP = E(host).install(contractSrcs);

    return E(host)
      .getInstallationSourceCode(installationP)
      .then(src => {
        log('Does source match? ', src.start === contractSrcs.start);

        const fooInviteP = E(installationP).spawn('foo terms');

        const inviteIssuerP = E(host).getInviteIssuer();

        return Promise.resolve(
          showPaymentBalance('foo', inviteIssuerP, fooInviteP),
        ).then(_ => {
          const eightP = E(host).redeem(fooInviteP);

          eightP.then(res => {
            showPaymentBalance('foo', inviteIssuerP, fooInviteP);
            log('++ eightP resolved to ', res, ' (should be 8)');
            if (res !== 8) {
              throw new Error(`eightP resolved to ${res}, not 8`);
            }
            log('++ DONE');
          });
          return eightP;
        });
      });
  }

  function exhaustedContractTest(host) {
    log('starting exhaustedContractTest');

    const exhContract = harden({
      start: (terms, _inviteMaker) => {
        if (terms === 'loop forever') {
          for (;;) {
            // Do nothing.
          }
        } else {
          return 123;
        }
      },
    });
    const contractSrcs = harden({ start: `${exhContract.start} ` });

    const installationP = E(host).install(contractSrcs);

    return E(host)
      .getInstallationSourceCode(installationP)
      .then(src => {
        log('Does source match? ', src.start === contractSrcs.start);

        return E(installationP)
          .spawn('loop forever')
          .catch(e => log('spawn rejected: ', e.message));
      })
      .then(_ => E(installationP).spawn('just return'))
      .then(
        ret => log('got return: ', ret),
        err => log('error! ', err.message),
      );
  }

  async function betterContractTestAliceFirst(
    host,
    mint,
    aliceMaker,
    bobMaker,
  ) {
    const escrowExchangeInstallationP = E(host).install(escrowExchangeSrcs);
    const coveredCallInstallationP = E(host).install(coveredCallSrcs);

    const { mint: moneyMint, issuer: moneyIssuer } = await E(
      mint,
    ).produceIssuer('moola');
    const moolaAmountMath = await getLocalAmountMath(moneyIssuer);
    const moola = moolaAmountMath.make;
    const aliceMoneyPaymentP = E(moneyMint).mintPayment(moola(1000));
    const bobMoneyPaymentP = E(moneyMint).mintPayment(moola(1001));

    const { mint: stockMint, issuer: stockIssuer } = await E(
      mint,
    ).produceIssuer('Tyrell');
    const stockAmountMath = await getLocalAmountMath(stockIssuer);
    const stocks = stockAmountMath.make;
    const aliceStockPaymentP = E(stockMint).mintPayment(stocks(2002));
    const bobStockPaymentP = E(stockMint).mintPayment(stocks(2003));

    const aliceP = E(aliceMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      moneyIssuer,
      stockIssuer,
      aliceMoneyPaymentP,
      aliceStockPaymentP,
    );
    const bobP = E(bobMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      moneyIssuer,
      stockIssuer,
      bobMoneyPaymentP,
      bobStockPaymentP,
    );
    return Promise.all([aliceP, bobP]).then(_ => {
      const ifItFitsP = E(aliceP).payBobWell(bobP);
      ifItFitsP.then(
        res => {
          log('++ ifItFitsP done:', res);
          log('++ DONE');
        },
        rej => log('++ ifItFitsP failed', rej),
      );
      return ifItFitsP;
    });
  }

  async function betterContractTestBobFirst(host, mint, aliceMaker, bobMaker) {
    const escrowExchangeInstallationP = E(host).install(escrowExchangeSrcs);
    const coveredCallInstallationP = E(host).install(coveredCallSrcs);

    const { mint: moneyMint, issuer: moneyIssuer } = await E(
      mint,
    ).produceIssuer('clams');
    const moneyAmountMath = await getLocalAmountMath(moneyIssuer);
    const money = moneyAmountMath.make;
    const aliceMoneyPayment = await E(moneyMint).mintPayment(money(1000));
    const bobMoneyPayment = await E(moneyMint).mintPayment(money(1001));

    const { mint: stockMint, issuer: stockIssuer } = await E(
      mint,
    ).produceIssuer('fudco');
    const stockAmountMath = await getLocalAmountMath(stockIssuer);
    const stocks = stockAmountMath.make;
    const aliceStockPayment = await E(stockMint).mintPayment(stocks(2002));
    const bobStockPayment = await E(stockMint).mintPayment(stocks(2003));

    const aliceMoneyPurseP = E(moneyIssuer).makeEmptyPurse();
    const bobMoneyPurseP = E(moneyIssuer).makeEmptyPurse();
    const aliceStockPurseP = E(stockIssuer).makeEmptyPurse();
    const bobStockPurseP = E(stockIssuer).makeEmptyPurse();

    await E(aliceMoneyPurseP).deposit(aliceMoneyPayment);
    await E(aliceStockPurseP).deposit(aliceStockPayment);
    await E(bobMoneyPurseP).deposit(bobMoneyPayment);
    await E(bobStockPurseP).deposit(bobStockPayment);

    const aliceP = E(aliceMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      moneyIssuer,
      stockIssuer,
      aliceMoneyPurseP,
      aliceStockPurseP,
    );
    const bobP = E(bobMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      moneyIssuer,
      stockIssuer,
      bobMoneyPurseP,
      bobStockPurseP,
    );
    return Promise.all([aliceP, bobP]).then(_ => {
      E(bobP)
        .tradeWell(aliceP, false)
        .then(
          res => {
            showPurseBalances('alice money', aliceMoneyPurseP);
            showPurseBalances('alice stock', aliceStockPurseP);
            showPurseBalances('bob money', bobMoneyPurseP);
            showPurseBalances('bob stock', bobStockPurseP);
            log('++ bobP.tradeWell done:', res);
            log('++ DONE');
          },
          rej => {
            log('++ bobP.tradeWell error:', rej);
          },
        );
    });
  }

  function coveredCallTest(host, mint, aliceMaker, bobMaker) {
    const escrowExchangeInstallationP = E(host).install(escrowExchangeSrcs);
    const coveredCallInstallationP = E(host).install(coveredCallSrcs);

    const moneyMintP = E(mint).makeMint('smackers');
    const aliceMoneyPurseP = E(moneyMintP).mint(1000, 'aliceMainMoney');
    const bobMoneyPurseP = E(moneyMintP).mint(1001, 'bobMainMoney');

    const stockMintP = E(mint).makeMint('yoyodyne');
    const aliceStockPurseP = E(stockMintP).mint(2002, 'aliceMainStock');
    const bobStockPurseP = E(stockMintP).mint(2003, 'bobMainStock');

    const aliceP = E(aliceMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      aliceMoneyPurseP,
      aliceStockPurseP,
    );
    const bobP = E(bobMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      bobMoneyPurseP,
      bobStockPurseP,
    );
    return Promise.all([aliceP, bobP]).then(_ => {
      E(bobP)
        .offerAliceOption(aliceP, false)
        .then(
          res => {
            showPurseBalances('alice money', aliceMoneyPurseP);
            showPurseBalances('alice stock', aliceStockPurseP);
            showPurseBalances('bob money', bobMoneyPurseP);
            showPurseBalances('bob stock', bobStockPurseP);
            log('++ bobP.offerAliceOption done:', res);
            log('++ DONE');
          },
          rej => {
            log('++ bobP.offerAliceOption error:', rej);
          },
        );
    });
  }

  function coveredCallSaleTest(host, mint, aliceMaker, bobMaker, fredMaker) {
    const escrowExchangeInstallationP = E(host).install(escrowExchangeSrcs);
    const coveredCallInstallationP = E(host).install(coveredCallSrcs);

    const doughMintP = E(mint).makeMint('dough');
    const aliceDoughPurseP = E(doughMintP).mint(1000, 'aliceDough');
    const bobDoughPurseP = E(doughMintP).mint(1001, 'bobDough');
    const fredDoughPurseP = E(doughMintP).mint(1002, 'fredDough');

    const stockMintP = E(mint).makeMint('wonka');
    const aliceStockPurseP = E(stockMintP).mint(2002, 'aliceMainStock');
    const bobStockPurseP = E(stockMintP).mint(2003, 'bobMainStock');
    const fredStockPurseP = E(stockMintP).mint(2004, 'fredMainStock');

    const finMintP = E(mint).makeMint('fins');
    const aliceFinPurseP = E(finMintP).mint(3000, 'aliceFins');
    const fredFinPurseP = E(finMintP).mint(3001, 'fredFins');

    const bobP = E(bobMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      bobDoughPurseP,
      bobStockPurseP,
    );
    const fredP = E(fredMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      fredDoughPurseP,
      fredStockPurseP,
      fredFinPurseP,
    );
    const aliceP = E(aliceMaker).make(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      fakeNeverTimer,
      aliceDoughPurseP,
      aliceStockPurseP,
      aliceFinPurseP,
      fredP,
    );
    return Promise.all([aliceP, bobP, fredP]).then(_ => {
      E(bobP)
        .offerAliceOption(aliceP)
        .then(
          res => {
            showPurseBalances('alice dough', aliceDoughPurseP);
            showPurseBalances('alice stock', aliceStockPurseP);
            showPurseBalances('alice fins', aliceFinPurseP);

            showPurseBalances('bob dough', bobDoughPurseP);
            showPurseBalances('bob stock', bobStockPurseP);

            showPurseBalances('fred dough', fredDoughPurseP);
            showPurseBalances('fred stock', fredStockPurseP);
            showPurseBalances('fred fins', fredFinPurseP);

            log('++ bobP.offerAliceOption done:', res);
            log('++ DONE');
          },
          rej => {
            log('++ bobP.offerAliceOption error:', rej);
          },
        );
    });
  }

  const obj0 = {
    async bootstrap(argv, vats) {
      switch (argv[0]) {
        case 'trivial': {
          const host = await E(vats.host).makeHost();
          return trivialContractTest(host);
        }
        case 'exhaust': {
          const host = await E(vats.host).makeHost();
          return exhaustedContractTest(host);
        }
        case 'alice-first': {
          const host = await E(vats.host).makeHost();
          const aliceMaker = await E(vats.alice).makeAliceMaker(host);
          const bobMaker = await E(vats.bob).makeBobMaker(host);
          return betterContractTestAliceFirst(
            host,
            vats.mint,
            aliceMaker,
            bobMaker,
          );
        }
        case 'bob-first': {
          const host = await E(vats.host).makeHost();
          const aliceMaker = await E(vats.alice).makeAliceMaker(host);
          const bobMaker = await E(vats.bob).makeBobMaker(host);
          return betterContractTestBobFirst(
            host,
            vats.mint,
            aliceMaker,
            bobMaker,
          );
        }
        case 'covered-call': {
          const host = await E(vats.host).makeHost();
          const aliceMaker = await E(vats.alice).makeAliceMaker(host);
          const bobMaker = await E(vats.bob).makeBobMaker(host);
          return coveredCallTest(host, vats.mint, aliceMaker, bobMaker);
        }
        case 'covered-call-sale': {
          const host = await E(vats.host).makeHost();
          const aliceMaker = await E(vats.alice).makeAliceMaker(host);
          const bobMaker = await E(vats.bob).makeBobMaker(host);
          const fredMaker = await E(vats.fred).makeFredMaker(host);
          return coveredCallSaleTest(
            host,
            vats.mint,
            aliceMaker,
            bobMaker,
            fredMaker,
          );
        }
        default: {
          throw new Error(`unrecognized argument value ${argv[0]}`);
        }
      }
    },
  };
  return harden(obj0);
}
harden(build);

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  log(`=> setup called`);
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, log),
    helpers.vatID,
  );
}
export default harden(setup);
