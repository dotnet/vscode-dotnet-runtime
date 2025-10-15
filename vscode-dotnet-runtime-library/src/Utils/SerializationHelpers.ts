/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Helper functions for serializing and deserializing complex objects like Map and Set
 * that don't maintain their type when stored in VS Code's extension state (Memento)
 */

/**
 * Converts a Map with Set values to a serializable object
 * @param map The Map of Sets to serialize
 * @returns A plain object representation of the Map of Sets
 */
export function serializeMapOfSets<K extends string | number, V>(map: Map<K, Set<V>>): Record<string, V[]>
{
    const obj: Record<string, V[]> = {};
    for (const [key, value] of map.entries())
    {
        obj[key.toString()] = Array.from(value);
    }
    return obj;
}

/**
 * Converts a serialized Map of Sets back to a Map instance with Set values
 * @param obj The plain object representation of a Map of Sets
 * @returns A new Map instance with Set values
 */
export function deserializeMapOfSets<K extends string | number, V>(obj: Record<string, V[]> | undefined | null): Map<K, Set<V>>
{
    const map = new Map<K, Set<V>>();
    if (!obj)
    {
        return map;
    }

    for (const key in obj)
    {
        if (Object.prototype.hasOwnProperty.call(obj, key))
        {
            const set = new Set<V>((obj[key] || []).filter(Boolean));
            // Cast the key to K - this is safe if K is string | number
            map.set(key as K, set);
        }
    }
    return map;
}