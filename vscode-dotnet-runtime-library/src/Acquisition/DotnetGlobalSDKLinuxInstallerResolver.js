"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DotnetGlobalSDKLinuxInstallerResolver = void 0;
const Ubuntu22_04DotnetSDKProvider_1 = require("./Ubuntu22_04DotnetSDKProvider");
const proc = require("child_process");
/**
 * This class is responsible for detecting the distro and version of the Linux OS.
 * It also serves as the entry point to installation via a specific distro implementation
 * by implementing version validation that normally happens inside of a windows or mac .net installer.
 * Since those don't exist for linux, we need to manually implement and check certain edge-cases before allowing the installation to occur.
 */
class DotnetGlobalSDKLinuxInstallerResolver {
    constructor() {
        this.distro = "UNKNOWN" /* Unknown */;
        this.distro = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(this.distro);
    }
    getRunningDistro() {
        const commandResult = proc.spawnSync('cat', ['/etc/os-release']);
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';
        let distroName = '';
        let distroVersion = '';
        switch (distroName.concat(distroVersion)) {
            case 'Ubuntu22.04':
                return "UBUNTU 22.04" /* Ubuntu22_04 */;
            default:
                return "UNKNOWN" /* Unknown */;
        }
    }
    DistroProviderFactory(distroAndVersion) {
        switch (distroAndVersion) {
            case "UBUNTU 22.04" /* Ubuntu22_04 */:
                return new Ubuntu22_04DotnetSDKProvider_1.Ubuntu22_04DotnetSDKProvider();
                break;
            default:
                throw Error(`The distro and version pair ${distroAndVersion} is unrecognized.`);
        }
    }
    ValidateVersionFeatureBand(version, existingGlobalDotnetVersion) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    ValidateAndInstallSDK(fullySpecifiedDotnetVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield this.distroSDKProvider.isDotnetVersionSupported(fullySpecifiedDotnetVersion))) {
                if ((yield this.distroSDKProvider.getDotnetVersionSupportStatus(fullySpecifiedDotnetVersion)) === "MICROSOFT" /* Microsoft */) {
                    throw new Error(`The distro ${this.distro} currently only has support for manual installation via Microsoft feeds: https://packages.microsoft.com/.`);
                }
                else {
                    throw new Error(`The distro ${this.distro} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`);
                }
            }
            const existingInstall = this.distroSDKProvider.getInstalledGlobalDotnetPathIfExists();
            return '1';
        });
    }
}
exports.DotnetGlobalSDKLinuxInstallerResolver = DotnetGlobalSDKLinuxInstallerResolver;
//# sourceMappingURL=DotnetGlobalSDKLinuxInstallerResolver.js.map