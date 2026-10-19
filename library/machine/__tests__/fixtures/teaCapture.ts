import {
    event,
    float32,
    notification,
    status,
    type1,
    type1Bytes
} from "../protocolFixtures";

const utc = (time: string) => Date.parse(`2026-10-16T${time}Z`);

export const teaCaptureMetadata = {
    date: "2026-10-16",
    firmware: "V12.0D.500",
    machineModel: null,
    appBuild: null,
    userConfirmedComplete: true,
    cupChannelValid: false
} as const;

export const teaCaptureUploadPayload = [
    24, 90, 92, 2, 0, 211, 0, 120,
    35, 90, 92, 0, 0, 0, 32, 0,
    35, 90, 80, 0, 0, 226, 32, 0,
    35, 254, 255
] as const;

export const teaCaptureSentBytes = [
    type1Bytes(4513, [...teaCaptureUploadPayload]),
    type1(4512, [])
];

function water(ml: number): number[] {
    return notification(0x4B, 0, float32(ml * 1000));
}

export const teaCaptureTimeline = [
    {at: utc("20:24:03.067"), label: "cycle-start", value: 0, frame: event(40510, 0)},
    {at: utc("20:24:03.751"), label: "water", value: 0.775, frame: water(0.775)},
    {at: utc("20:24:29.253"), label: "water", value: 90, frame: water(90)},
    {at: utc("20:24:29.407"), label: "fill-boundary", value: null, frame: event(9012)},
    {at: utc("20:24:29.909"), label: "steep-start", value: 0x45, frame: status(0x45)},
    {at: utc("20:25:14.536"), label: "steep-end", value: 0x23, frame: status(0x23)},
    {at: utc("20:25:14.536"), label: "water", value: 90.675, frame: water(90.675)},
    {at: utc("20:25:47.458"), label: "water", value: 132.9125, frame: water(132.9125)},
    {at: utc("20:25:47.508"), label: "cycle-start", value: 1, frame: event(40510, 1)},
    {at: utc("20:26:13.502"), label: "water", value: 222.625, frame: water(222.625)},
    {at: utc("20:26:13.690"), label: "fill-boundary", value: null, frame: event(9012)},
    {at: utc("20:26:14.194"), label: "steep-start", value: 0x45, frame: status(0x45)},
    {at: utc("20:26:14.194"), label: "water", value: 222.625, frame: water(222.625)},
    {at: utc("20:27:13.520"), label: "steep-end", value: 0x23, frame: status(0x23)},
    {at: utc("20:27:13.568"), label: "water", value: 223.975, frame: water(223.975)},
    {at: utc("20:27:44.828"), label: "water", value: 260.4, frame: water(260.4)},
    {at: utc("20:27:45.026"), label: "cycle-start", value: 2, frame: event(40510, 2)},
    {at: utc("20:28:11.386"), label: "fill-boundary", value: null, frame: event(9012)},
    {at: utc("20:28:11.386"), label: "water", value: 349.825, frame: water(349.825)},
    {at: utc("20:28:11.895"), label: "steep-start", value: 0x45, frame: status(0x45)},
    {at: utc("20:29:41.523"), label: "steep-end", value: 0x23, frame: status(0x23)},
    {at: utc("20:29:41.523"), label: "water", value: 351.075, frame: water(351.075)},
    {at: utc("20:30:08.896"), label: "water", value: 390.6, frame: water(390.6)},
    {at: utc("20:30:08.948"), label: "ending-start", value: null, frame: event(40511)},
    {at: utc("20:30:10.873"), label: "final-sample", value: 390.6, frame: water(390.6)},
    {at: utc("20:30:10.924"), label: "brew-end", value: null, frame: event(40512)}
] as const;
