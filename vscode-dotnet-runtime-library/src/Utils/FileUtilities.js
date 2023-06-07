"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileUtilities = void 0;
/* --------------------------------------------------------------------------------------------
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
* ------------------------------------------------------------------------------------------ */
const eol = require("eol");
const fs = require("fs");
const path = require("path");
const os = require("os");
const proc = require("child_process");
class FileUtilities {
    constructor() { }
    static writeFileOntoDisk(scriptContent, filePath) {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o700);
    }
    /**
     * @param directoryToWipe the directory to delete all of the files in if privellege to do so exists.
     */
    static wipeDirectory(directoryToWipe) {
        fs.readdir(directoryToWipe, (err, files) => {
            if (err)
                throw err;
            for (const file of files) {
                fs.unlink(path.join(directoryToWipe, file), (err) => {
                    if (err)
                        throw err;
                });
            }
        });
    }
    /**
     *
     * @returns true if the process is running with admin privelleges on windows.
     */
    static isElevated() {
        if (os.platform() !== 'win32') {
            // TODO: Make sure this works on mac and linux.
            const commandResult = proc.spawnSync("id", ["-u"]);
            return commandResult.status === 0;
        }
        try {
            // If we can execute this command on Windows then we have admin rights.
            proc.execFileSync("net", ["session"], { "stdio": "ignore" });
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
exports.FileUtilities = FileUtilities;
//# sourceMappingURL=FileUtilities.js.map