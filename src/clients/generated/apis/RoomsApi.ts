/* tslint:disable */

import * as runtime from '../runtime';
import {
    DayAvailability, DayAvailabilityFromJSON, DayAvailabilityToJSON,
    Room, RoomFromJSON, RoomToJSON,
    RoomList, RoomListFromJSON, RoomListToJSON,
} from '../models/index';

export interface GetRoomRequest {
    id: string;
}

export interface GetAvailabilityRequest {
    id: string;
    date: string;
}

export class RoomsApi extends runtime.BaseAPI {

    async listRoomsRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<RoomList>> {
        const queryParameters: any = {};
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/rooms`, method: 'GET', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => RoomListFromJSON(j));
    }

    async listRooms(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<RoomList> {
        const response = await this.listRoomsRaw(initOverrides);
        return await response.value();
    }

    async getRoomRaw(requestParameters: GetRoomRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Room>> {
        if (requestParameters.id === null || requestParameters.id === undefined) {
            throw new runtime.RequiredError('id', 'Required parameter id was null or undefined when calling getRoom.');
        }
        const queryParameters: any = {};
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/rooms/{id}`.replace(`{id}`, encodeURIComponent(String(requestParameters.id))), method: 'GET', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => RoomFromJSON(j));
    }

    async getRoom(requestParameters: GetRoomRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Room> {
        const response = await this.getRoomRaw(requestParameters, initOverrides);
        return await response.value();
    }

    async getAvailabilityRaw(requestParameters: GetAvailabilityRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<DayAvailability>> {
        if (requestParameters.id === null || requestParameters.id === undefined) {
            throw new runtime.RequiredError('id', 'Required parameter id was null or undefined when calling getAvailability.');
        }
        if (requestParameters.date === null || requestParameters.date === undefined) {
            throw new runtime.RequiredError('date', 'Required parameter date was null or undefined when calling getAvailability.');
        }
        const queryParameters: any = {};
        queryParameters['date'] = requestParameters.date;
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/rooms/{id}/availability`.replace(`{id}`, encodeURIComponent(String(requestParameters.id))), method: 'GET', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => DayAvailabilityFromJSON(j));
    }

    async getAvailability(requestParameters: GetAvailabilityRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<DayAvailability> {
        const response = await this.getAvailabilityRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
