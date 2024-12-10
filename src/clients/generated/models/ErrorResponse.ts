/* tslint:disable */

import { exists } from '../runtime';
import { ErrorBody, ErrorBodyFromJSON, ErrorBodyToJSON } from './ErrorBody';

/**
 * @export
 * @interface ErrorResponse
 */
export interface ErrorResponse {
    /**
     * @type {ErrorBody}
     * @memberof ErrorResponse
     */
    error: ErrorBody;
}

export function instanceOfErrorResponse(value: object): boolean {
    if (!('error' in value)) return false;
    return true;
}

export function ErrorResponseFromJSON(json: any): ErrorResponse {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'error': ErrorBodyFromJSON(json['error']),
    };
}

export function ErrorResponseToJSON(value?: ErrorResponse | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'error': ErrorBodyToJSON(value.error),
    };
}
