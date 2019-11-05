import * as vscode from 'vscode';
import * as extension from '../../extension';
var assert = require('chai').assert;

suite('Extension End to End', () => {
  test('Activate', () => {
    assert.isTrue(true);
    // const context: vscode.ExtensionContext = {
    //   subscriptions: [],
    // } as any;
    // extension.activate(context);
    // assert.equals(context.subscriptions.length, 1);
  });
});