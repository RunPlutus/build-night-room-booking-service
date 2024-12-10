/* tslint:disable */

import { exists } from '../runtime';

/**
 * @export
 * @interface Room
 */
export interface Room {
    /**
     * @type {string}
     * @memberof Room
     */
    id: string;
    /**
     * @type {string}
     * @memberof Room
     */
    name: string;
    /**
     * @type {number}
     * @memberof Room
     */
    floor: number;
    /**
     * @type {number}
     * @memberof Room
     */
    capacity: number;
    /**
     * @type {Array<string>}
     * @memberof Room
     */
    features?: Array<string>;
    /**
     * @type {string}
     * @memberof Room
     */
    status: string;
    /**
     * @type {string}
     * @memberof Room
     */
    replacedBy?: string;
    /**
     * @type {string}
     * @memberof Room
     */
    createdAt: string;
}

export function instanceOfRoom(value: object): boolean {
    if (!('id' in value)) return false;
    if (!('name' in value)) return false;
    if (!('floor' in value)) return false;
    if (!('capacity' in value)) return false;
    if (!('status' in value)) return false;
    if (!('createdAt' in value)) return false;
    return true;
}

export function RoomFromJSON(json: any): Room {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'id': json['id'],
        'name': json['name'],
        'floor': json['floor'],
        'capacity': json['capacity'],
        'features': !exists(json, 'features') ? undefined : json['features'],
        'status': json['status'],
        'replacedBy': !exists(json, 'replacedBy') ? undefined : json['replacedBy'],
        'createdAt': json['createdAt'],
    };
}

export function RoomToJSON(value?: Room | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'id': value.id,
        'name': value.name,
        'floor': value.floor,
        'capacity': value.capacity,
        'features': value.features === undefined ? undefined : value.features,
        'status': value.status,
        'replacedBy': value.replacedBy === undefined ? undefined : value.replacedBy,
        'createdAt': value.createdAt,
    };
}
