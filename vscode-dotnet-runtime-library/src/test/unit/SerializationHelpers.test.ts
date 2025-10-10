/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import
{
    deserializeMap,
    deserializeMapOfSets,
    serializeMap,
    serializeMapOfSets
} from '../../Utils/SerializationHelpers';

const assert = chai.assert;

suite('SerializationHelpers Unit Tests', function ()
{
    suite('serializeMap Tests', () =>
    {
        test('should convert a Map to a plain object', () =>
        {
            const map = new Map<string, number>();
            map.set('key1', 1);
            map.set('key2', 2);

            const obj = serializeMap(map);

            assert.deepStrictEqual(obj, { key1: 1, key2: 2 });
        });

        test('should handle empty Maps', () =>
        {
            const map = new Map<string, number>();
            const obj = serializeMap(map);

            assert.deepStrictEqual(obj, {});
        });

        test('should convert number keys to strings', () =>
        {
            const map = new Map<number, string>();
            map.set(1, 'one');
            map.set(2, 'two');

            const obj = serializeMap(map);

            assert.deepStrictEqual(obj, { '1': 'one', '2': 'two' });
        });
    });

    suite('deserializeMap Tests', () =>
    {
        test('should convert a plain object to a Map', () =>
        {
            const obj = { key1: 1, key2: 2 };

            const map = deserializeMap<string, number>(obj);

            assert.isTrue(map instanceof Map);
            assert.equal(map.size, 2);
            assert.equal(map.get('key1'), 1);
            assert.equal(map.get('key2'), 2);
        });

        test('should handle null or undefined input', () =>
        {
            const map1 = deserializeMap<string, number>(null);
            assert.isTrue(map1 instanceof Map);
            assert.equal(map1.size, 0);

            const map2 = deserializeMap<string, number>(undefined);
            assert.isTrue(map2 instanceof Map);
            assert.equal(map2.size, 0);
        });

        test('should handle empty objects', () =>
        {
            const map = deserializeMap<string, number>({});

            assert.isTrue(map instanceof Map);
            assert.equal(map.size, 0);
        });
    });

    suite('serializeMapOfSets Tests', () =>
    {
        test('should convert a Map of Sets to a plain object of arrays', () =>
        {
            const map = new Map<string, Set<string>>();
            const set1 = new Set<string>(['a', 'b', 'c']);
            const set2 = new Set<string>(['d', 'e']);

            map.set('key1', set1);
            map.set('key2', set2);

            const obj = serializeMapOfSets(map);

            assert.deepStrictEqual(obj, {
                key1: ['a', 'b', 'c'],
                key2: ['d', 'e']
            });
        });

        test('should handle empty Maps', () =>
        {
            const map = new Map<string, Set<string>>();
            const obj = serializeMapOfSets(map);

            assert.deepStrictEqual(obj, {});
        });

        test('should handle empty Sets', () =>
        {
            const map = new Map<string, Set<string>>();
            map.set('key1', new Set());

            const obj = serializeMapOfSets(map);

            assert.deepStrictEqual(obj, { key1: [] });
        });
    });

    suite('deserializeMapOfSets Tests', () =>
    {
        test('should convert a plain object of arrays to a Map of Sets', () =>
        {
            const obj = {
                key1: ['a', 'b', 'c'],
                key2: ['d', 'e']
            };

            const map = deserializeMapOfSets<string, string>(obj);

            assert.isTrue(map instanceof Map);
            assert.equal(map.size, 2);

            const set1 = map.get('key1');
            assert.isTrue(set1 instanceof Set);
            assert.equal(set1?.size, 3);
            assert.isTrue(set1?.has('a'));
            assert.isTrue(set1?.has('b'));
            assert.isTrue(set1?.has('c'));

            const set2 = map.get('key2');
            assert.isTrue(set2 instanceof Set);
            assert.equal(set2?.size, 2);
            assert.isTrue(set2?.has('d'));
            assert.isTrue(set2?.has('e'));
        });

        test('should handle null or undefined input', () =>
        {
            const map1 = deserializeMapOfSets<string, string>(null);
            assert.isTrue(map1 instanceof Map);
            assert.equal(map1.size, 0);

            const map2 = deserializeMapOfSets<string, string>(undefined);
            assert.isTrue(map2 instanceof Map);
            assert.equal(map2.size, 0);
        });

        test('should filter out null/undefined values in arrays', () =>
        {
            const obj = {
                key1: ['a', null, 'c', undefined]
            };

            const map = deserializeMapOfSets<string, string>(obj as any);
            const set = map.get('key1');

            assert.isTrue(set instanceof Set);
            assert.equal(set?.size, 2);
            assert.isTrue(set?.has('a'));
            assert.isTrue(set?.has('c'));
        });
    });
});