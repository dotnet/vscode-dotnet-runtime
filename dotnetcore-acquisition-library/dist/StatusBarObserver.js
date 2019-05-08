"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const EventType_1 = require("./EventType");
var StatusBarColors;
(function (StatusBarColors) {
    StatusBarColors["Red"] = "rgb(218,0,0)";
    StatusBarColors["Green"] = "rgb(0,218,0)";
})(StatusBarColors || (StatusBarColors = {}));
class StatusBarObserver {
    constructor(statusBarItem) {
        this.statusBarItem = statusBarItem;
    }
    post(event) {
        switch (event.type) {
            case EventType_1.EventType.DotnetAcquisitionStart:
                this.setAndShowStatusBar('$(cloud-download) Downloading .NET Core tooling...', 'dotnet.showOutputChannel', '', 'Downloading .NET Core tooling...');
                break;
            case EventType_1.EventType.DotnetAcquisitionCompleted:
                this.resetAndHideStatusBar();
                break;
            case EventType_1.EventType.DotnetAcquisitionError:
                this.setAndShowStatusBar('$(alert) Error acquiring .NET Core tooling!', 'dotnet.showOutputChannel', StatusBarColors.Red, 'Error acquiring .NET Core tooling');
                break;
        }
    }
    setAndShowStatusBar(text, command, color, tooltip) {
        this.statusBarItem.text = text;
        this.statusBarItem.command = command;
        this.statusBarItem.color = color;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.show();
    }
    resetAndHideStatusBar() {
        this.statusBarItem.text = '';
        this.statusBarItem.command = undefined;
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = undefined;
        this.statusBarItem.hide();
    }
}
exports.StatusBarObserver = StatusBarObserver;
//# sourceMappingURL=StatusBarObserver.js.map