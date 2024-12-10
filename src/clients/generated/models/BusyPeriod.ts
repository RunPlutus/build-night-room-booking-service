/* tslint:disable */

import { exists } from '../runtime';

/**
 * @export
 * @interface BusyPeriod
 */
export interface BusyPeriod {
    /**
     * @type {string}
     * @memberof BusyPeriod
     */
    bookingId: string;
    /**
     * @type {string}
     * @memberof BusyPeriod
     */
    title: string;
    /**
     * @type {string}
     * @memberof BusyPeriod
     */
    start: string;
    /**
     * @type {string}
     * @memberof BusyPeriod
     */
    end: string;
}

export function instanceOfBusyPeriod(value: object): boolean {
    if (!('bookingId' in value)) return false;
    if (!('title' in value)) return false;
    if (!('start' in value)) return false;
    if (!('end' in value)) return false;
    return true;
}

export function BusyPeriodFromJSON(json: any): BusyPeriod {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'bookingId': json['bookingId'],
        'title': json['title'],
        'start': json['start'],
        'end': json['end'],
    };
}

export function BusyPeriodToJSON(value?: BusyPeriod | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'bookingId': value.bookingId,
        'title': value.title,
        'start': value.start,
        'end': value.end,
    };
}
