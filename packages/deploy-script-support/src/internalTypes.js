/**
 * @callback MakeInstallSaveAndPublish
 * @param {BundleSource} bundleSource
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<InstallationManager>} installationManager
 * @param {ERef<Board>} board
 * @returns {InstallSaveAndPublish}
 */

// TODO: import this from agoric-cli

/**
 * @typedef {(...pathSegments: string[]) => string} AttenuatedPathResolve
 */

/**
 * @callback MakeResolvePaths
 * @param {AttenuatedPathResolve} pathResolve
 * @param {RequireResolve} requireResolve
 * @returns {{ resolvePathForLocalContract: ResolvePathForLocalContract
    resolvePathForPackagedContract: ResolvePathForPackagedContract }}
 */

/**
 * @callback MakeLocalAmountMathManager
 * @param {ERef<IssuerManager>} issuerManager
 * @returns {{ saveLocalAmountMaths: SaveLocalAmountMaths,
    getLocalAmountMath: GetLocalAmountMath }}
 */

/**
 * @callback MakeStartInstanceAndSave
 * @param {ERef<IssuerManager>} issuerManager
 * @param {ERef<InstanceManager>} instanceManager
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<Purse>} zoeInvitationPurse
 * @returns {StartInstanceAndSave}
 */

/**
 * @callback MakeOfferHelper
 * @param {ERef<WalletAdminFacet>} walletAdmin - an internal type of the
 * wallet, not defined here
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<Purse>} zoeInvitationPurse
 * @param {GetLocalAmountMath} getLocalAmountMath
 * @returns {OfferHelper}
 */

/**
 * @callback MakeSaveIssuerHelper
 * @param {ERef<WalletAdminFacet>} walletAdmin - an internal type of the
 * wallet, not defined here
 * @param {SaveLocalAmountMath} saveLocalAmountMath
 * @param {ERef<IssuerManager>} issuerManager
 * @returns {SaveIssuerHelper}
 */

/**
 * @callback MakeDepositInvitation
 * @param {ERef<Purse>} zoeInvitationPurse
 * @returns {DepositInvitation}
 */
