/* tslint:disable */

import { exists } from '../runtime';
import { Recurrence, RecurrenceFromJSON, RecurrenceToJSON } from './Recurrence';

/**
 * @export
 * @interface BookingRequest
 */
export interface BookingRequest {
    /**
     * @type {string}
     * @memberof BookingRequest
     */
    roomId: string;
    /**
     * @type {string}
     * @memberof BookingRequest
     */
    title: string;
    /**
     * @type {string}
     * @memberof BookingRequest
     */
    organizer: string;
    /**
     * @type {string}
     * @memberof BookingRequest
     */
    start: string;
    /**
     * @type {string}
     * @memberof BookingRequest
     */
    end: string;
    /**
     * @type {Recurrence}
     * @memberof BookingRequest
     */
    recurrence?: Recurrence;
}

export function instanceOfBookingRequest(value: object): boolean {
    if (!('roomId' in value)) return false;
    if (!('title' in value)) return false;
    if (!('organizer' in value)) return false;
    if (!('start' in value)) return false;
    if (!('end' in value)) return false;
    return true;
}

export function BookingRequestFromJSON(json: any): BookingRequest {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'roomId': json['roomId'],
        'title': json['title'],
        'organizer': json['organizer'],
        'start': json['start'],
        'end': json['end'],
        'recurrence': !exists(json, 'recurrence') ? undefined : RecurrenceFromJSON(json['recurrence']),
    };
}

export function BookingRequestToJSON(value?: BookingRequest | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'roomId': value.roomId,
        'title': value.title,
        'organizer': value.organizer,
        'start': value.start,
        'end': value.end,
        'recurrence': value.recurrence === undefined ? undefined : RecurrenceToJSON(value.recurrence),
    };
}
