import { pack, unpack } from 'msgpackr';
import { Point } from '@laser-dac/core';

export enum MessageTypes {
    POINT_REQUEST = 0,
    POINT_RESPONSE = 1,
};

export type PointRequestMessage = {
    type: MessageTypes.POINT_REQUEST;
    num: number;
}

export type PointResponseMessage = {
    type: MessageTypes.POINT_RESPONSE;
    points: Point[];
}

export type NanometerMessage = PointResponseMessage | PointRequestMessage;

export function isPointRequestMessage(msg: any): msg is PointRequestMessage {
    return msg.type === MessageTypes.POINT_REQUEST;
}

export function isPointResponseMessage(msg: any): msg is PointResponseMessage {
    return msg.type === MessageTypes.POINT_RESPONSE;
}

export async function decodeMessage(msg: Buffer | ArrayBuffer | Blob): Promise<NanometerMessage> {
    if (msg instanceof ArrayBuffer) {
        msg = Buffer.from(msg);
        return unpack(msg as Buffer);
    }
    if (msg instanceof Blob) {
        msg = new Uint8Array(await msg.arrayBuffer());
        return unpack(msg as Uint8Array);
    }
    return unpack(msg);
}

export function encodePointRequest(num: number): Buffer {
    return pack({
        'type': MessageTypes.POINT_REQUEST,
        num
    });
}

export function encodePointResponse(points: Point[]): Buffer {
    return pack({
        type: MessageTypes.POINT_RESPONSE,
        points
    });
}
