import harden from '@agoric/harden';

console.debug(`loading bootstrap.js`);

function buildRootObject(E, D) {
  // use sendToBridge(arg) to send to IBC stuff
  let sendToBridge;

  // this receives HTTP requests, and can return JSONable objects in response
  async function handleCommand(body) {
    if (body.path === '/sendOutBridge') {
      sendToBridge('http says hi');
      return { 'i said': 'hi' };
    }
    return { response: `${body.path} is ok` };
  }

  function handleBridgeInput(arg) {
    console.log(`bridge input`, arg);
  }

  function doBootstrap(argv, vats, devices) {
    const commandHandler = harden({
      inbound(count, body) {
        console.log(`command:`, body);
        const p = handleCommand(body);
        p.then(ok => D(devices.command).sendResponse(count, false, ok),
               err => D(devices.command).sendResponse(count, true, err));
      },
    });
    D(devices.command).registerInboundHandler(commandHandler);

    const bridgeHandler = harden({
      inbound(arg) {
        handleBridgeInput(arg);
      },
    });
    D(devices.bridge).registerInboundHandler(bridgeHandler);
    sendToBridge = (arg) => {
      D(devices.bridge).callOutbound(arg);
    };
  }

  const root = {
    bootstrap(...args) {
      console.log(`bootstrap() invoked`);
      try {
        doBootstrap(...args);
        console.log(`bootstrap() successful`);
      } catch (e) {
        console.log(`error during bootstrap`);
        console.log(e);
        throw e;
      }
    },
  };
  return harden(root);
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    buildRootObject,
    helpers.vatID,
  );
}
