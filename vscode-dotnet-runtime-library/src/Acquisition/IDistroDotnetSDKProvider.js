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
exports.IDistroDotnetSDKProvider = void 0;
/**
 * This interface describes the functionality needed to manage the .NET SDK on a specific distro and version of Linux.
 *
 * @remarks We accept community contributions of this interface for each distro-version pair.
 * All calls which require sudo must leverage the vscode/sudo library. We will not accept contributions that use other methods to gain admin privellege.
 * Please see DotnetDistroVersion as well to add your version.
 */
class IDistroDotnetSDKProvider {
    constructor() {
    }
    /**
     *
     * @param fullySpecifiedVersion The version of dotnet to check support for in the 3-part semver version.
     * @returns true if the version is supported by default within the distro, false elsewise.
     */
    isDotnetVersionSupported(fullySpecifiedVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            const supportStatus = yield this.getDotnetVersionSupportStatus(fullySpecifiedVersion);
            return supportStatus === "DISTRO" /* Distro */;
        });
    }
}
exports.IDistroDotnetSDKProvider = IDistroDotnetSDKProvider;
//# sourceMappingURL=IDistroDotnetSDKProvider.js.map