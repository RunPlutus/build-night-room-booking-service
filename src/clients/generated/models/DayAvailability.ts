/* tslint:disable */

import { exists } from '../runtime';
import { BusyPeriod, BusyPeriodFromJSON, BusyPeriodToJSON } from './BusyPeriod';

/**
 * @export
 * @interface DayAvailability
 */
export interface DayAvailability {
    /**
     * @type {string}
     * @memberof DayAvailability
     */
    roomId: string;
    /**
     * @type {string}
     * @memberof DayAvailability
     */
    date: string;
    /**
     * @type {Array<BusyPeriod>}
     * @memberof DayAvailability
     */
    busy: Array<BusyPeriod>;
}

export function instanceOfDayAvailability(value: object): boolean {
    if (!('roomId' in value)) return false;
    if (!('date' in value)) return false;
    if (!('busy' in value)) return false;
    return true;
}

export function DayAvailabilityFromJSON(json: any): DayAvailability {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'roomId': json['roomId'],
        'date': json['date'],
        'busy': (json['busy'] as Array<any>).map(BusyPeriodFromJSON),
    };
}

export function DayAvailabilityToJSON(value?: DayAvailability | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'roomId': value.roomId,
        'date': value.date,
        'busy': (value.busy as Array<any>).map(BusyPeriodToJSON),
    };
}
