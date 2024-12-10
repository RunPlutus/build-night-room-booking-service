/* tslint:disable */

import { exists } from '../runtime';

/**
 * @export
 * @interface ConflictDetail
 */
export interface ConflictDetail {
    /**
     * @type {string}
     * @memberof ConflictDetail
     */
    bookingId: string;
    /**
     * @type {string}
     * @memberof ConflictDetail
     */
    title: string;
    /**
     * @type {string}
     * @memberof ConflictDetail
     */
    start: string;
    /**
     * @type {string}
     * @memberof ConflictDetail
     */
    end: string;
}

export function instanceOfConflictDetail(value: object): boolean {
    if (!('bookingId' in value)) return false;
    if (!('title' in value)) return false;
    if (!('start' in value)) return false;
    if (!('end' in value)) return false;
    return true;
}

export function ConflictDetailFromJSON(json: any): ConflictDetail {
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

export function ConflictDetailToJSON(value?: ConflictDetail | null): any {
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
