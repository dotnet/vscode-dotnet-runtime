"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAcquisitionInvoker = void 0;
const InstallationValidator_1 = require("./InstallationValidator");
class IAcquisitionInvoker {
    constructor(eventStream) {
        this.eventStream = eventStream;
        this.installationValidator = new InstallationValidator_1.InstallationValidator(eventStream);
    }
}
exports.IAcquisitionInvoker = IAcquisitionInvoker;
//# sourceMappingURL=IAcquisitionInvoker.js.map