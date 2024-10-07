/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { JsonInstaller } from '../../Acquisition/JsonInstaller';
import { MockEventStream, MockVSCodeExtensionContext } from '../mocks/MockObjects';
import { DotnetVSCodeExtensionFound } from '../../EventStream/EventStreamEvents';

const assert = chai.assert;

suite('JSONInstaller Unit Tests', () => {
    const eventStream = new MockEventStream();
    const mockContext =  new MockVSCodeExtensionContext();

    test('It Scans Extensions Without x-dotnet-acquire', async () =>
    {
        const _ = new JsonInstaller(eventStream,mockContext);
        const acquireEvent = eventStream.events.find(event => event instanceof DotnetVSCodeExtensionFound) as DotnetVSCodeExtensionFound;

        assert.exists(acquireEvent, 'The extensions were scanned, and did not cause an error with having an empty json value')
    });
});
