/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';

export function acquireDotnet(extensionPath: string) {
    const installScript = os.platform() === 'win32' ? 'dotnet-install.ps1' : 'dotnet-install.sh';
    const script = path.join(extensionPath, 'scripts', installScript);
}
