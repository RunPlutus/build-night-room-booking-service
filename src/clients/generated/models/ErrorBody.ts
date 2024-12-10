/* tslint:disable */

import { exists } from '../runtime';
import { ConflictDetail, ConflictDetailFromJSON, ConflictDetailToJSON } from './ConflictDetail';

/**
 * @export
 * @interface ErrorBody
 */
export interface ErrorBody {
    /**
     * @type {string}
     * @memberof ErrorBody
     */
    code: string;
    /**
     * @type {string}
     * @memberof ErrorBody
     */
    message: string;
    /**
     * @type {Array<ConflictDetail>}
     * @memberof ErrorBody
     */
    details?: Array<ConflictDetail>;
}

export function instanceOfErrorBody(value: object): boolean {
    if (!('code' in value)) return false;
    if (!('message' in value)) return false;
    return true;
}

export function ErrorBodyFromJSON(json: any): ErrorBody {
    if (json === undefined || json === null) {
        return json;
    }
    return {
        'code': json['code'],
        'message': json['message'],
        'details': !exists(json, 'details') ? undefined : (json['details'] as Array<any>).map(ConflictDetailFromJSON),
    };
}

export function ErrorBodyToJSON(value?: ErrorBody | null): any {
    if (value === undefined || value === null) {
        return value;
    }
    return {
        'code': value.code,
        'message': value.message,
        'details': value.details === undefined ? undefined : (value.details as Array<any>).map(ConflictDetailToJSON),
    };
}
