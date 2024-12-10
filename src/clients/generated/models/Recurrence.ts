/* tslint:disable */

import { exists } from '../runtime';

/**
 * @export
 * @interface Recurrence
 */
export interface Recurrence {
    /**
     * @type {string}
     * @memberof Recurrence
     */
    freq: string;
    /**
     * @type {number}
     * @memberof Recurrence
     */
    interval?: number;
    /**
     * @type {string}
     * @memberof Recurrence
     */
    until?: string;
    /**
     * @type {number}
     * @memberof Recurrence
     */
    count?: number;
}

export function instanceOfRecurrence(value: object): boolean {
    if (!('freq' in value)) return false;
    return true;
}

export function RecurrenceFromJSON(json: any): Recurrence {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'freq': json['freq'],
        'interval': !exists(json, 'interval') ? undefined : json['interval'],
        'until': !exists(json, 'until') ? undefined : json['until'],
        'count': !exists(json, 'count') ? undefined : json['count'],
    };
}

export function RecurrenceToJSON(value?: Recurrence | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'freq': value.freq,
        'interval': value.interval === undefined ? undefined : value.interval,
        'until': value.until === undefined ? undefined : value.until,
        'count': value.count === undefined ? undefined : value.count,
    };
}
