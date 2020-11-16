// @ts-check
import '@agoric/install-ses';
import test from 'ava';
import { E } from '@agoric/eventual-send';
import { makeRendezvousNamespace } from '../../lib/ag-solo/vats/rendezvous';

const rendezvousFailed = {
  instanceOf: Error,
  message: /^Rendezvous with .* not completed/,
};

const makeObj = name => ({
  getName() {
    return name;
  },
});

test('rendezvous with self', async t => {
  const makeRendezvous = makeRendezvousNamespace();
  const self = makeRendezvous('self');
  const rendezvous = self.startRendezvous(
    self.getLocalAddress(),
    makeObj('initiator'),
  );
  const resultP = E(rendezvous.getResult()).getName();
  t.throws(
    () => self.completeRendezvous('other', makeObj('foo')),
    rendezvousFailed,
  );
  t.is(
    self.completeRendezvous(['self'], makeObj('first')).getName(),
    'initiator',
  );
  t.throws(
    () => self.completeRendezvous('self', makeObj('second')),
    rendezvousFailed,
  );
  t.is(await resultP, 'first');
});

test('rendezvous three way', async t => {
  const makeRendezvous = makeRendezvousNamespace();

  const solo = makeRendezvous('solo');
  const testnet = makeRendezvous('testnet');
  const mainnet = makeRendezvous('mainnet');

  const rendezvous = solo.startRendezvous(
    ['testnet', 'mainnet'],
    makeObj('fromSoloToTestnetOrMainnet'),
  );
  const result = E(rendezvous.getResult()).getName();

  t.is(
    testnet.completeRendezvous('solo', makeObj('toSoloFromTestnet')).getName(),
    'fromSoloToTestnetOrMainnet',
  );
  t.is(await result, 'toSoloFromTestnet');

  t.is(
    mainnet.completeRendezvous('solo', makeObj('toSoloFromMainnet')).getName(),
    'fromSoloToTestnetOrMainnet',
  );
});

test('rendezvous cancel', async t => {
  const makeRendezvous = makeRendezvousNamespace();

  const solo = makeRendezvous('solo');
  const testnet = makeRendezvous('testnet');
  const mainnet = makeRendezvous('mainnet');

  const rendezvous = solo.startRendezvous(
    ['testnet', 'mainnet'],
    makeObj('fromSolo'),
  );

  rendezvous.cancel();
  await t.throwsAsync(() => rendezvous.getResult(), rendezvousFailed);

  t.throws(
    () => testnet.completeRendezvous('solo', makeObj('toSoloFromTestnet')),
    rendezvousFailed,
  );
  t.throws(
    () => mainnet.completeRendezvous('solo', makeObj('toSoloFromMainnet')),
    rendezvousFailed,
  );
});

test('rendezvous race three way', async t => {
  const makeRendezvous = makeRendezvousNamespace();

  const solo = makeRendezvous('solo');
  const testnet = makeRendezvous('testnet');
  const mainnet = makeRendezvous('mainnet');

  const rendezvous = solo.startRendezvous('testnet', makeObj('fromSolo'));

  t.is(
    testnet.completeRendezvous('solo', makeObj('toSoloFromTestnet')).getName(),
    'fromSolo',
  );
  t.is(await E(rendezvous.getResult()).getName(), 'toSoloFromTestnet');

  t.throws(
    () => mainnet.completeRendezvous('solo', makeObj('toSoloFromMainnet')),
    rendezvousFailed,
  );
});

test('multiple pending rendezvous', async t => {
  const makeRendezvous = makeRendezvousNamespace();

  const solo = makeRendezvous('solo');
  const testnet = makeRendezvous('testnet');
  const mainnet = makeRendezvous('mainnet');

  const rendezvous1 = solo.startRendezvous(
    'testnet',
    makeObj('fromSolo1'),
    'rdv1',
  );
  const rendezvous2 = solo.startRendezvous(
    'testnet',
    makeObj('fromSolo2'),
    'rdv2',
  );

  t.is(
    testnet
      .completeRendezvous('solo', makeObj('toSoloFromTestnet2'), 'rdv2')
      .getName(),
    'fromSolo2',
  );

  t.is(
    testnet
      .completeRendezvous('solo', makeObj('toSoloFromTestnet1'), 'rdv1')
      .getName(),
    'fromSolo1',
  );

  t.is(await E(rendezvous1.getResult()).getName(), 'toSoloFromTestnet1');
  t.is(await E(rendezvous2.getResult()).getName(), 'toSoloFromTestnet2');

  t.throws(
    () =>
      mainnet.completeRendezvous('solo', makeObj('toSoloFromMainnet'), 'rdv1'),
    rendezvousFailed,
  );
  t.throws(
    () =>
      mainnet.completeRendezvous('solo', makeObj('toSoloFromMainnet'), 'rdv2'),
    rendezvousFailed,
  );
  t.throws(
    () =>
      testnet.completeRendezvous('solo', makeObj('toSoloFromTestnet'), 'rdv1'),
    rendezvousFailed,
  );
  t.throws(
    () =>
      testnet.completeRendezvous('solo', makeObj('toSoloFromTestnet'), 'rdv2'),
    rendezvousFailed,
  );
});
