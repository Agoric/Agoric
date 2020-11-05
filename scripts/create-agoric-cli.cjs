#! /usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  const script = process.argv[2] || `${process.env.HOME || '/usr/local'}/bin/agoric`;
  const cli = path.resolve(__dirname, '../packages/agoric-cli/bin/agoric');

  const bindir = path.dirname(script);
  const PATH = process.env.PATH;
  if (!PATH) {
    console.warn('$PATH is not set, cannot verify');
  } else {
    // Attempt Windows compatibility.
    const sep = PATH.includes(';') ? ';' : ':';
    if (!PATH.split(sep).includes(bindir)) {
      console.warn(`Script directory ${bindir} does not appear in $PATH`);
      let advice;
      if (sep === ';') {
        advice = `setx PATH "%PATH%${sep}${bindir}"`;
      } else {
        advice = `export PATH=$PATH${sep}${bindir}`;
      }
      console.log(`(You may want to \`${advice}' to add it to your PATH environment variable)`);
    }
  }

  console.log(`ensuring ${bindir} exists`);
  fs.mkdirSync(bindir, { recursive: true });

  const content = `\
#! /bin/sh
# AUTOMATICALLY GENERATED by ${process.argv[1]}
# Maybe execute the checked-out Agoric CLI with the --sdk flag.
test "\${AGORIC_NO_SDK+set}" = set || sdkopt=" --sdk"
exec ${cli}\$sdkopt \${1+"\$@"}
`;

  console.log(`creating ${script}`);
  if (fs.existsSync(script)) {
    throw Error(`${script} must not already exist; you should use a fresh path.`);
  }
  try {
    // Unlink the old version in case it's a symlink.
    fs.unlinkSync(script);
  } catch (e) {
    // do nothing.
  }

  fs.writeFileSync(script, content);
  fs.chmodSync(script, '0755');
} catch (err) {
  console.error(err);
  process.exit(1);
}

process.exit(0);
