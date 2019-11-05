import * as extension from '../../extension';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { MockEventStream } from 'dotnetcore-acquisition-library'
var assert = require('chai').assert;

suite('Extension End to End', () => {
  test('Activate', () => {
    const storagePath = path.join(__dirname, "tmp");
    const mockState = new MockEventStream();
    const extensionPath = path.join(__dirname, "tmp");

    const context: vscode.ExtensionContext = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath: extensionPath
    } as any;
    extension.activate(context);
    assert.equal(context.subscriptions.length, 4);
  });
});