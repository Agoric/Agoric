// @ts-check

import { AssetKind, makeIssuerKit } from '@agoric/ertp';
import { Far } from '@agoric/marshal';

import './types';
import './internal-types';

import { makeIssuerStorage } from '../issuerStorage';
import { makeAndStoreInstanceRecord } from '../instanceRecordStorage';
import { makeIssuerRecord } from '../issuerRecord';
import { makeEscrowStorage } from './escrowStorage';
import { createInvitationKit } from './makeInvitation';
import { makeInstanceAdminStorage } from './instanceAdminStorage';
import { makeInstallationStorage } from './installationStorage';

/**
 * The Zoe Storage Manager encapsulates and composes important
 * capabilities, such as the ability to create a new purse and deposit
 * and withdraw into a purse, according to the Principle of Least
 * Authority. The code for these capabilities is imported from smaller
 * files which should have unit tests. After composing, Zoe Storage
 * Manager divides up the resulting capabilities between those needed
 * by a new contract instance (returned as the result of
 * `makeZoeInstanceStorageManager`) and those needed for other purposes.
 *
 * @param {CreateZCFVat} createZCFVat - the ability to create a new
 * ZCF Vat
 * @param {HasChargeAccount} hasChargeAccount
 * @returns {ZoeStorageManager}
 */
export const makeZoeStorageManager = (createZCFVat, hasChargeAccount) => {
  // issuerStorage contains the issuers that the ZoeService knows
  // about, as well as information about them such as their brand,
  // assetKind, and displayInfo
  const issuerStorage = makeIssuerStorage();
  issuerStorage.instantiate();

  // EscrowStorage holds the purses that Zoe uses for escrow. This
  // object should be closely held and tracked: all of the digital
  // assets that users escrow are contained within these purses.
  const escrowStorage = makeEscrowStorage();

  // In order to participate in a contract, users must have
  // invitations, which are ERTP payments made by Zoe. This code
  // contains the mint capability for invitations.
  const { setupMakeInvitation, invitationIssuer } = createInvitationKit();

  // Every new instance of a contract creates a corresponding
  // "zoeInstanceAdmin" - an admin facet within the Zoe Service for
  // that particular instance. This code manages the storage of those
  // instanceAdmins
  const {
    getPublicFacet,
    getBrands,
    getIssuers,
    getTerms,
    getInstanceAdmin,
    initInstanceAdmin,
    deleteInstanceAdmin,
  } = makeInstanceAdminStorage(hasChargeAccount);

  // Zoe stores "installations" - identifiable bundles of contract
  // code that can be reused again and again to create new contract
  // instances
  const { install, unwrapInstallation } = makeInstallationStorage(
    hasChargeAccount,
  );

  /** @type {MakeZoeInstanceStorageManager} */
  const makeZoeInstanceStorageManager = async (
    installation,
    customTerms,
    uncleanIssuerKeywordRecord,
    instance,
  ) => {
    // Clean the issuerKeywordRecord we receive in `startInstance`
    // from the user, and save the issuers in Zoe if they are not
    // already stored there
    const { issuers, brands } = await issuerStorage.storeIssuerKeywordRecord(
      uncleanIssuerKeywordRecord,
    );

    // Create purses for the issuers if they do not already exist
    Object.entries(issuers).forEach(([keyword, issuer]) =>
      escrowStorage.createPurse(issuer, brands[keyword]),
    );

    // The instanceRecord is what the contract code is parameterized
    // with: the particular terms, issuers, and brands used in a
    // contract instance based on the installation. A user can query
    // Zoe to find out the installation, terms, issuers, and brands
    // for a contract instance. Contract code has similar query
    // capabilities from the ZCF side.
    const instanceRecordManager = makeAndStoreInstanceRecord(
      installation,
      customTerms,
      issuers,
      brands,
    );

    /** @type {SaveIssuer} */
    const saveIssuer = async (issuerP, keyword) => {
      const issuerRecord = await issuerStorage.storeIssuer(issuerP);
      escrowStorage.createPurse(issuerRecord.issuer, issuerRecord.brand);
      instanceRecordManager.addIssuerToInstanceRecord(keyword, issuerRecord);
      return issuerRecord;
    };

    /** @type {MakeZoeMint} */
    const makeZoeMint = (keyword, assetKind = AssetKind.NAT, displayInfo) => {
      // Local indicates one that zoe itself makes from vetted code,
      // and so can be assumed correct and fresh by zoe.
      const {
        mint: localMint,
        issuer: localIssuer,
        brand: localBrand,
        displayInfo: localDisplayInfo,
      } = makeIssuerKit(keyword, assetKind, displayInfo);
      const localIssuerRecord = makeIssuerRecord(
        localBrand,
        localIssuer,
        localDisplayInfo,
      );
      issuerStorage.storeIssuerRecord(localIssuerRecord);
      const localPooledPurse = escrowStorage.makeLocalPurse(
        localIssuerRecord.issuer,
        localIssuerRecord.brand,
      );
      instanceRecordManager.addIssuerToInstanceRecord(
        keyword,
        localIssuerRecord,
      );
      /** @type {ZoeMint} */
      const zoeMint = Far('ZoeMint', {
        getIssuerRecord: () => {
          return localIssuerRecord;
        },
        mintAndEscrow: totalToMint => {
          const payment = localMint.mintPayment(totalToMint);
          localPooledPurse.deposit(payment, totalToMint);
        },
        withdrawAndBurn: totalToBurn => {
          const payment = localPooledPurse.withdraw(totalToBurn);
          localIssuer.burn(payment, totalToBurn);
        },
      });
      return zoeMint;
    };

    /** @type {GetIssuerRecords} */
    const getIssuerRecords = () =>
      issuerStorage.getIssuerRecords(
        // the issuerStorage is a weakStore, so we cannot iterate over
        // it directly. Additionally, we only want to export the
        // issuers used in this contract instance specifically, not
        // all issuers.
        Object.values(instanceRecordManager.getInstanceRecord().terms.issuers),
      );

    const makeInvitation = setupMakeInvitation(instance, installation);

    return harden({
      getTerms: instanceRecordManager.getTerms,
      getIssuers: instanceRecordManager.getIssuers,
      getBrands: instanceRecordManager.getBrands,
      saveIssuer,
      makeZoeMint,
      getInstanceRecord: instanceRecordManager.getInstanceRecord,
      getIssuerRecords,
      withdrawPayments: escrowStorage.withdrawPayments,
      initInstanceAdmin,
      deleteInstanceAdmin,
      makeInvitation,
      invitationIssuer,
      createZCFVat,
    });
  };

  return {
    makeZoeInstanceStorageManager,
    getAssetKindByBrand: issuerStorage.getAssetKindByBrand,
    depositPayments: escrowStorage.depositPayments,
    invitationIssuer,
    install,
    getPublicFacet,
    getBrands,
    getIssuers,
    getTerms,
    getInstanceAdmin,
    unwrapInstallation,
  };
};
