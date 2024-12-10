/* tslint:disable */

import { exists } from '../runtime';
import { Recurrence, RecurrenceFromJSON, RecurrenceToJSON } from './Recurrence';

/**
 * @export
 * @interface Booking
 */
export interface Booking {
    /**
     * @type {string}
     * @memberof Booking
     */
    id: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    roomId: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    title: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    organizer: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    start: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    end: string;
    /**
     * @type {Recurrence}
     * @memberof Booking
     */
    recurrence?: Recurrence;
    /**
     * @type {string}
     * @memberof Booking
     */
    status: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    createdAt: string;
    /**
     * @type {string}
     * @memberof Booking
     */
    cancelledAt?: string;
}

export function instanceOfBooking(value: object): boolean {
    if (!('id' in value)) return false;
    if (!('roomId' in value)) return false;
    if (!('title' in value)) return false;
    if (!('organizer' in value)) return false;
    if (!('start' in value)) return false;
    if (!('end' in value)) return false;
    if (!('status' in value)) return false;
    if (!('createdAt' in value)) return false;
    return true;
}

export function BookingFromJSON(json: any): Booking {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'id': json['id'],
        'roomId': json['roomId'],
        'title': json['title'],
        'organizer': json['organizer'],
        'start': json['start'],
        'end': json['end'],
        'recurrence': !exists(json, 'recurrence') ? undefined : RecurrenceFromJSON(json['recurrence']),
        'status': json['status'],
        'createdAt': json['createdAt'],
        'cancelledAt': !exists(json, 'cancelledAt') ? undefined : json['cancelledAt'],
    };
}

export function BookingToJSON(value?: Booking | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'id': value.id,
        'roomId': value.roomId,
        'title': value.title,
        'organizer': value.organizer,
        'start': value.start,
        'end': value.end,
        'recurrence': value.recurrence === undefined ? undefined : RecurrenceToJSON(value.recurrence),
        'status': value.status,
        'createdAt': value.createdAt,
        'cancelledAt': value.cancelledAt === undefined ? undefined : value.cancelledAt,
    };
}
