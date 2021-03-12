import { E } from '@agoric/eventual-send';
import { Far } from '@agoric/marshal';

console.log(`=> loading bootstrap.js`);

export function buildRootObject(vatPowers) {
  const { D, testLog: log } = vatPowers;
  return Far('root', {
    async bootstrap(vats, devices) {
      console.log('=> bootstrap() called');

      const BOT = 'bot';
      const USER = 'user';
      const BOT_CLIST_INDEX = 0;

      D(devices.loopbox).registerInboundHandler(USER, vats.uservattp);
      const usersender = D(devices.loopbox).makeSender(USER);
      await E(vats.uservattp).registerMailboxDevice(usersender);
      const {
        transmitter: txToBotForUser,
        setReceiver: setRxFromBotForUser,
      } = await E(vats.uservattp).addRemote(BOT);
      await E(vats.usercomms).addRemote(
        BOT,
        txToBotForUser,
        setRxFromBotForUser,
      );

      D(devices.loopbox).registerInboundHandler(BOT, vats.botvattp);
      const botsender = D(devices.loopbox).makeSender(BOT);
      await E(vats.botvattp).registerMailboxDevice(botsender);
      const {
        transmitter: txToUserForBot,
        setReceiver: setRxFromUserForBot,
      } = await E(vats.botvattp).addRemote(USER);
      await E(vats.botcomms).addRemote(
        USER,
        txToUserForBot,
        setRxFromUserForBot,
      );

      await E(vats.botcomms).addEgress(
        USER,
        BOT_CLIST_INDEX, // this would normally be autogenerated
        vats.bot,
      );

      const pPBot = E(vats.usercomms).addIngress(BOT, BOT_CLIST_INDEX);
      E(vats.user)
        .talkToBot(pPBot, 'bot')
        .then(
          r =>
            log(
              `=> the promise given by the call to user.talkToBot resolved to '${r}'`,
            ),
          err =>
            log(
              `=> the promise given by the call to user.talkToBot was rejected '${err}''`,
            ),
        );
    },
  });
}
