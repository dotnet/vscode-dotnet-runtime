/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
    serializeMap,
    deserializeMap,
    serializeMapOfSets,
    deserializeMapOfSets
} from '../../Utils/SerializationHelpers';

describe('SerializationHelpers', () => {
    describe('serializeMap', () => {
        it('should convert a Map to a plain object', () => {
            const map = new Map<string, number>();
            map.set('key1', 1);
            map.set('key2', 2);

            const obj = serializeMap(map);

            assert.deepEqual(obj, { key1: 1, key2: 2 });
        });

        it('should handle empty Maps', () => {
            const map = new Map<string, number>();
            const obj = serializeMap(map);

            assert.deepEqual(obj, {});
        });

        it('should convert number keys to strings', () => {
            const map = new Map<number, string>();
            map.set(1, 'one');
            map.set(2, 'two');

            const obj = serializeMap(map);

            assert.deepEqual(obj, { '1': 'one', '2': 'two' });
        });
    });

    describe('deserializeMap', () => {
        it('should convert a plain object to a Map', () => {
            const obj = { key1: 1, key2: 2 };

            const map = deserializeMap<string, number>(obj);

            assert.ok(map instanceof Map);
            assert.equal(map.size, 2);
            assert.equal(map.get('key1'), 1);
            assert.equal(map.get('key2'), 2);
        });

        it('should handle null or undefined input', () => {
            const map1 = deserializeMap<string, number>(null);
            assert.ok(map1 instanceof Map);
            assert.equal(map1.size, 0);

            const map2 = deserializeMap<string, number>(undefined);
            assert.ok(map2 instanceof Map);
            assert.equal(map2.size, 0);
        });

        it('should handle empty objects', () => {
            const map = deserializeMap<string, number>({});

            assert.ok(map instanceof Map);
            assert.equal(map.size, 0);
        });
    });

    describe('serializeMapOfSets', () => {
        it('should convert a Map of Sets to a plain object of arrays', () => {
            const map = new Map<string, Set<string>>();
            const set1 = new Set<string>(['a', 'b', 'c']);
            const set2 = new Set<string>(['d', 'e']);

            map.set('key1', set1);
            map.set('key2', set2);

            const obj = serializeMapOfSets(map);

            assert.deepEqual(obj, {
                key1: ['a', 'b', 'c'],
                key2: ['d', 'e']
            });
        });

        it('should handle empty Maps', () => {
            const map = new Map<string, Set<string>>();
            const obj = serializeMapOfSets(map);

            assert.deepEqual(obj, {});
        });

        it('should handle empty Sets', () => {
            const map = new Map<string, Set<string>>();
            map.set('key1', new Set());

            const obj = serializeMapOfSets(map);

            assert.deepEqual(obj, { key1: [] });
        });
    });

    describe('deserializeMapOfSets', () => {
        it('should convert a plain object of arrays to a Map of Sets', () => {
            const obj = {
                key1: ['a', 'b', 'c'],
                key2: ['d', 'e']
            };

            const map = deserializeMapOfSets<string, string>(obj);

            assert.ok(map instanceof Map);
            assert.equal(map.size, 2);

            const set1 = map.get('key1');
            assert.ok(set1 instanceof Set);
            assert.equal(set1?.size, 3);
            assert.ok(set1?.has('a'));
            assert.ok(set1?.has('b'));
            assert.ok(set1?.has('c'));

            const set2 = map.get('key2');
            assert.ok(set2 instanceof Set);
            assert.equal(set2?.size, 2);
            assert.ok(set2?.has('d'));
            assert.ok(set2?.has('e'));
        });

        it('should handle null or undefined input', () => {
            const map1 = deserializeMapOfSets<string, string>(null);
            assert.ok(map1 instanceof Map);
            assert.equal(map1.size, 0);

            const map2 = deserializeMapOfSets<string, string>(undefined);
            assert.ok(map2 instanceof Map);
            assert.equal(map2.size, 0);
        });

        it('should filter out null/undefined values in arrays', () => {
            const obj = {
                key1: ['a', null, 'c', undefined]
            };

            const map = deserializeMapOfSets<string, string>(obj as any);
            const set = map.get('key1');

            assert.ok(set instanceof Set);
            assert.equal(set?.size, 2);
            assert.ok(set?.has('a'));
            assert.ok(set?.has('c'));
        });
    });
});