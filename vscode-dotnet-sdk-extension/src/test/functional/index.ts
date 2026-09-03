/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { glob } from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';
import * as sourceMapSupport from 'source-map-support';

export async function run(): Promise<void> {
  sourceMapSupport.install();
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname, '..');
  const files = await glob('**/functional/**.test.js', { cwd: testsRoot });

  return new Promise((c, e) => {
    // Add files to the test suite
    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    try {
      // Run the mocha test
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
