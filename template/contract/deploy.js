// Agoric Dapp contract deployment script
import fs from 'fs';

const DAPP_NAME = "@DIR@";

export default async function deployContract(homeP, { bundleSource, pathResolve }) {
  // Create a source bundle for the Zoe simpleSwap contract.
  const { source, moduleFormat } = await bundleSource(`./simpleSwap.js`);

  const contractHandle = homeP~.zoe~.install(source, moduleFormat);
  const contractID = await homeP~.registrar~.register(DAPP_NAME, contractHandle);
  const contractsJson = JSON.stringify({
    [DAPP_NAME]: contractID,
  });

  // Save the contractID somewhere where the UI can find it.
  const cjfile = pathResolve(`../api/contracts.json`);
  console.log('writing', cjfile);
  await fs.promises.writeFile(cjfile, contractsJson);
}
