/* tslint:disable */

import { exists } from '../runtime';

/**
 * @export
 * @interface Occurrence
 */
export interface Occurrence {
    /**
     * @type {string}
     * @memberof Occurrence
     */
    bookingId: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    roomId: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    title: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    organizer: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    start: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    end: string;
    /**
     * @type {string}
     * @memberof Occurrence
     */
    status: string;
}

export function instanceOfOccurrence(value: object): boolean {
    if (!('bookingId' in value)) return false;
    if (!('roomId' in value)) return false;
    if (!('title' in value)) return false;
    if (!('organizer' in value)) return false;
    if (!('start' in value)) return false;
    if (!('end' in value)) return false;
    if (!('status' in value)) return false;
    return true;
}

export function OccurrenceFromJSON(json: any): Occurrence {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'bookingId': json['bookingId'],
        'roomId': json['roomId'],
        'title': json['title'],
        'organizer': json['organizer'],
        'start': json['start'],
        'end': json['end'],
        'status': json['status'],
    };
}

export function OccurrenceToJSON(value?: Occurrence | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'bookingId': value.bookingId,
        'roomId': value.roomId,
        'title': value.title,
        'organizer': value.organizer,
        'start': value.start,
        'end': value.end,
        'status': value.status,
    };
}
