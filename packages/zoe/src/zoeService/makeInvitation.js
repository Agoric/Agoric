// @ts-check
import { assert, details as X } from '@agoric/assert';
import { AmountMath, makeIssuerKit, AssetKind } from '@agoric/ertp';

export const createInvitationKit = () => {
  const invitationKit = makeIssuerKit('Zoe Invitation', AssetKind.SET);

  /**
   * @param {Instance} instance
   * @param {Installation} installation
   * @returns {ZoeInstanceAdminMakeInvitation}
   */
  const setupMakeInvitation = (instance, installation, getFeeTranslation, getExpirationTranslation) => {
    assert.typeof(instance, 'object');
    assert.typeof(installation, 'object');

    /** @type {ZoeInstanceAdminMakeInvitation} */
    const makeInvitation = (invitationHandle, config) => {
      assert.typeof(invitationHandle, 'object');
      assert.typeof(
        config.description,
        'string',
        X`The description ${config.description} must be a string`,
      );
      // If the contract-provided customProperties include the
      // properties 'description', 'handle', 'instance' and
      // 'installation', their corresponding values will be
      // overwritten with the actual values. For example, the value
      // for `instance` will always be the actual instance for the
      // contract, even if customProperties includes a property called
      // `instance`.

      // config can also include
      // expiration: 'short', 'long'
      // fee: 'low', 'high'
      // if not included, no fee and no expiration

      // e.g. 'short' is 10 minutes from now
      // 'long' is 1 day from now
      const expiresObj = getExpirationTranslation(config.expiration);

      // e.g. 'low' is $1 (1 display unit of RUN, or 1*10^6)
      // 'high' is $10
      // { fee: run1 }
      const feeObj = getFeeTranslation(config.fee);

      const invitationAmount = AmountMath.make(invitationKit.brand, [
        {
          ...config.customProperties,
          ...expiresObj,
          ...feeObj,
          description: config.description,
          handle: invitationHandle,
          instance,
          installation,
        },
      ]);
      return invitationKit.mint.mintPayment(invitationAmount);
    };
    return makeInvitation;
  };

  return harden({
    setupMakeInvitation,
    invitationIssuer: invitationKit.issuer,
  });
};
