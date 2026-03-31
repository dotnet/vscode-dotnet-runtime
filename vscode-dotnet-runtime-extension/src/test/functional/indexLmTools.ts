/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Test index for Language Model Tools tests only.
 * This runs only LanguageModelTools.test.js for faster iteration during development.
 */

import * as Mocha from 'mocha';
import * as path from 'path';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    // Only add the Language Model Tools test file
    const lmToolsTestFile = path.resolve(testsRoot, 'functional/LanguageModelTools.test.js');
    mocha.addFile(lmToolsTestFile);

    try {
      mocha.run(failures => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      e(err);
    }
  });
}
