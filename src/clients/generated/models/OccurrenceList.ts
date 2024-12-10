/* tslint:disable */

import { exists } from '../runtime';
import { Occurrence, OccurrenceFromJSON, OccurrenceToJSON } from './Occurrence';

/**
 * @export
 * @interface OccurrenceList
 */
export interface OccurrenceList {
    /**
     * @type {string}
     * @memberof OccurrenceList
     */
    roomId: string;
    /**
     * @type {Array<Occurrence>}
     * @memberof OccurrenceList
     */
    occurrences: Array<Occurrence>;
}

export function instanceOfOccurrenceList(value: object): boolean {
    if (!('roomId' in value)) return false;
    if (!('occurrences' in value)) return false;
    return true;
}

export function OccurrenceListFromJSON(json: any): OccurrenceList {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'roomId': json['roomId'],
        'occurrences': (json['occurrences'] as Array<any>).map(OccurrenceFromJSON),
    };
}

export function OccurrenceListToJSON(value?: OccurrenceList | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'roomId': value.roomId,
        'occurrences': (value.occurrences as Array<any>).map(OccurrenceToJSON),
    };
}
