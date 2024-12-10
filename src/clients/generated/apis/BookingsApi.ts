/* tslint:disable */

import * as runtime from '../runtime';
import {
    Booking, BookingFromJSON, BookingToJSON,
    BookingRequest, BookingRequestFromJSON, BookingRequestToJSON,
    OccurrenceList, OccurrenceListFromJSON, OccurrenceListToJSON,
} from '../models/index';

export interface CreateBookingRequest {
    body: BookingRequest;
}

export interface GetBookingRequest {
    id: string;
}

export interface CancelBookingRequest {
    id: string;
}

export interface ListOccurrencesRequest {
    roomId: string;
    from: string;
    to: string;
}

export class BookingsApi extends runtime.BaseAPI {

    async createBookingRaw(requestParameters: CreateBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Booking>> {
        if (requestParameters.body === null || requestParameters.body === undefined) {
            throw new runtime.RequiredError('body', 'Required parameter body was null or undefined when calling createBooking.');
        }
        const queryParameters: any = {};
        const headerParameters: runtime.HTTPHeaders = {};
        headerParameters['Content-Type'] = 'application/json';
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/bookings`, method: 'POST', headers: headerParameters, query: queryParameters, body: BookingRequestToJSON(requestParameters.body) }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => BookingFromJSON(j));
    }

    async createBooking(requestParameters: CreateBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Booking> {
        const response = await this.createBookingRaw(requestParameters, initOverrides);
        return await response.value();
    }

    async getBookingRaw(requestParameters: GetBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Booking>> {
        if (requestParameters.id === null || requestParameters.id === undefined) {
            throw new runtime.RequiredError('id', 'Required parameter id was null or undefined when calling getBooking.');
        }
        const queryParameters: any = {};
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/bookings/{id}`.replace(`{id}`, encodeURIComponent(String(requestParameters.id))), method: 'GET', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => BookingFromJSON(j));
    }

    async getBooking(requestParameters: GetBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Booking> {
        const response = await this.getBookingRaw(requestParameters, initOverrides);
        return await response.value();
    }

    async cancelBookingRaw(requestParameters: CancelBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<void>> {
        if (requestParameters.id === null || requestParameters.id === undefined) {
            throw new runtime.RequiredError('id', 'Required parameter id was null or undefined when calling cancelBooking.');
        }
        const queryParameters: any = {};
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/bookings/{id}`.replace(`{id}`, encodeURIComponent(String(requestParameters.id))), method: 'DELETE', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.VoidApiResponse(response);
    }

    async cancelBooking(requestParameters: CancelBookingRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<void> {
        await this.cancelBookingRaw(requestParameters, initOverrides);
        
    }

    async listOccurrencesRaw(requestParameters: ListOccurrencesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<OccurrenceList>> {
        if (requestParameters.roomId === null || requestParameters.roomId === undefined) {
            throw new runtime.RequiredError('roomId', 'Required parameter roomId was null or undefined when calling listOccurrences.');
        }
        if (requestParameters.from === null || requestParameters.from === undefined) {
            throw new runtime.RequiredError('from', 'Required parameter from was null or undefined when calling listOccurrences.');
        }
        if (requestParameters.to === null || requestParameters.to === undefined) {
            throw new runtime.RequiredError('to', 'Required parameter to was null or undefined when calling listOccurrences.');
        }
        const queryParameters: any = {};
        queryParameters['roomId'] = requestParameters.roomId;
        queryParameters['from'] = requestParameters.from;
        queryParameters['to'] = requestParameters.to;
        const headerParameters: runtime.HTTPHeaders = {};
        if (this.configuration && this.configuration.apiKey) {
            headerParameters['x-api-key'] = await this.configuration.apiKey('x-api-key');
        }
        const response = await this.request({ path: `/api/bookings`, method: 'GET', headers: headerParameters, query: queryParameters }, initOverrides);
        return new runtime.JSONApiResponse(response, (j) => OccurrenceListFromJSON(j));
    }

    async listOccurrences(requestParameters: ListOccurrencesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<OccurrenceList> {
        const response = await this.listOccurrencesRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
