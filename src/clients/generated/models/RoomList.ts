/* tslint:disable */

import { exists } from '../runtime';
import { Room, RoomFromJSON, RoomToJSON } from './Room';

/**
 * @export
 * @interface RoomList
 */
export interface RoomList {
    /**
     * @type {Array<Room>}
     * @memberof RoomList
     */
    rooms: Array<Room>;
}

export function instanceOfRoomList(value: object): boolean {
    if (!('rooms' in value)) return false;
    return true;
}

export function RoomListFromJSON(json: any): RoomList {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'rooms': (json['rooms'] as Array<any>).map(RoomFromJSON),
    };
}

export function RoomListToJSON(value?: RoomList | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'rooms': (value.rooms as Array<any>).map(RoomToJSON),
    };
}
