"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const EventType_1 = require("./EventType");
class OutputChannelObserver {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    post(event) {
        switch (event.type) {
            case EventType_1.EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event;
                this.outputChannel.append(`Downloading .NET Core tooling '${acquisitionStarted.version}'...`);
                this.startDownloadIndicator();
                break;
            case EventType_1.EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event;
                this.stopDownladIndicator();
                this.outputChannel.appendLine(' Done!');
                this.outputChannel.appendLine(`.NET Core executable path: ${acquisitionCompleted.dotnetPath}`);
                this.outputChannel.appendLine('');
                break;
            case EventType_1.EventType.DotnetAcquisitionError:
                const error = event;
                this.stopDownladIndicator();
                this.outputChannel.appendLine(' Error!');
                this.outputChannel.appendLine('Failed to download .NET Core tooling:');
                this.outputChannel.appendLine(error.getErrorMessage());
                break;
        }
    }
    startDownloadIndicator() {
        this.downloadProgressInterval = setInterval(() => this.outputChannel.append('.'), 1000);
    }
    stopDownladIndicator() {
        if (this.downloadProgressInterval) {
            clearTimeout(this.downloadProgressInterval);
            this.downloadProgressInterval = undefined;
        }
    }
}
exports.OutputChannelObserver = OutputChannelObserver;
//# sourceMappingURL=OutputChannelObserver.js.map