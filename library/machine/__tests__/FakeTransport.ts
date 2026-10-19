import type {FoundMachine, MachineTransport, ScanDecider} from "@/library/machine/Transport";

import {notification} from "./protocolFixtures";

/**
 * The frame a machine sends to describe itself.
 *
 * Shared because a great deal now depends on it having arrived: connecting is
 * not finished until it has, and no recipe may be sent before it, since it is
 * the only report of the water level.
 */
export function machineInfoFrame(
    overrides: {mode?: string; waterEnough?: number; waterFeed?: number; serial?: string} = {}
): number[] {
    const payload = new Array(63).fill(0);
    const put = (at: number, textValue: string) => {
        for (let i = 0; i < textValue.length; i++) payload[at + i] = textValue.charCodeAt(i);
    };
    put(0, overrides.serial ?? "J15ABC123456");
    put(13, "J15");
    put(19, "V12.0D.500");
    payload[33] = overrides.waterEnough ?? 1;
    payload[36] = overrides.waterFeed ?? 0;
    payload[37] = 30 + 62;
    put(51, overrides.mode ?? "00000000");
    return notification(0x49, 0x9E, payload);
}

/**
 * The shorter info frame firmware V12.0D.210 sends: a 55-byte payload, not 63.
 *
 * Bytes 0-50 are as captured from a Studio on 2026-10-19 (serial
 * J15A01D48G023, frame length 0x43). Bytes 51-54 were cut from the log that
 * reported it, so they are zero here.
 */
export function olderFirmwareInfoFrame(): number[] {
    const payload = [
        ...Array.from("J15A01D48G023", (c) => c.charCodeAt(0)),
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        ...Array.from("V12.0D.210", (c) => c.charCodeAt(0)),
        0x00, 0xDB, 0xC4, 0x47, 0x01, 0x00, 0x01, 0x00, 0x55, 0x0F, 0xDC,
        0x01, 0x01, 0x01, 0xA4, 0x00, 0x00, 0x00, 0xC0, 0x20, 0x71, 0x43,
        0x00, 0x00, 0x00, 0x00
    ];
    return notification(0x49, 0x9E, payload);
}

/**
 * A radio that does exactly what a test tells it to.
 *
 * Records what was written, decoded, so an assertion can read
 * `transport.sent` as a list of command codes rather than as hex. Replays
 * frames on demand, so a test can script the machine's side of a brew.
 */
/**
 * A refusal as the radio actually delivers one.
 *
 * The machine does not reject a second link so much as ignore it, so the
 * failure arrives with nothing to say. A fake that invents a message hides the
 * only case the copy in `Machine.connect` exists for.
 */
function refusal(): Error {
    return new Error("");
}

export class FakeTransport implements MachineTransport {
    /** Every frame written, as raw bytes. */
    public written: Uint8Array[] = [];
    public connectedTo: string | null = null;
    public devices: FoundMachine[] = [{id: "AA:BB", name: "XBLOOM TEST"}];
    public modelNumber = "";
    /**
     * Empty until a scan, exactly as the real transport is.
     *
     * Seeded with a name here would make Task 10's central case pass for the
     * wrong reason: a returning user reconnects without scanning, so an empty
     * name is the normal state and the rule under test is that it must not
     * overwrite what an earlier scan learned.
     */
    public advertisedName = "";
    /** Set to make `connect` reject, for the taken-link case. */
    public refuseConnection = false;
    /**
     * How many of the next connections to refuse.
     *
     * A radio that lets go a moment after it is asked to, which is what iOS
     * does when the app returns to the front.
     */
    public refuseNextConnections = 0;
    /** Identifiers this radio refuses, for the stale-remembered-id case. */
    public refuseIds: string[] = [];
    /** Set to make the next `write` reject, for the failed-send case. */
    /** Wide by default: the narrow link is the case a test opts into. */
    public frameBudget = 244;

    /** Thrown by `connect`, for the failure paths a real radio has. */
    public failConnect: Error | null = null;

    public failNextWrite: string | null = null;
    /**
     * Set to make the write of one particular command reject.
     *
     * `failNextWrite` is no use for a brew any more: every brew opens by asking
     * the machine how it is doing, so "the next write" is that question rather
     * than the frame the test means.
     */
    public failWriteOf: {code: number; reason: string} | null = null;
    /** What the radio says it offers. `null` stands for a stack that refuses. */
    public gatt: string[] | null = [];
    /** What became of each notify subscription, as the real transport reports. */
    public channels: string[] = [];
    /**
     * What the machine answers the info request with.
     *
     * A real one always answers — that is confirmed on hardware — so the fake
     * does too by default. Set to null to play a machine that stays silent,
     * which is the case the brew preflight has to refuse.
     */
    public infoReply: number[] | null = machineInfoFrame();
    /**
     * How many handshakes to leave without the vitals that follow them.
     *
     * A machine that misses the question, which is what a burst of unpaced
     * frames does to it.
     */
    public ignoreInfoRequests = 0;

    private frameListeners = new Set<(frame: Uint8Array, source?: string) => void>();
    private disconnectListeners = new Set<() => void>();

    /** The command code of each frame written, in order. */
    get sent(): number[] {
        return this.written.map((frame) => frame[3] | (frame[4] << 8));
    }

    /** How many scans have run, and what each was asked to decide with. */
    public scans: (ScanDecider | undefined)[] = [];
    private heardNames = new Map<string, string>();

    async scan(_seconds?: number, decide?: ScanDecider): Promise<FoundMachine[]> {
        this.scans.push(decide);
        // As the real transport does: a name is only ever learned by a scan,
        // and it is the machine `attemptLink` will take, which is the first.
        if (this.devices.length > 0) this.advertisedName = this.devices[0].name;
        for (const device of this.devices) this.heardNames.set(device.id, device.name);
        // Every device is heard at once, so a decider has nothing to cut
        // short here: the settle timing is the real transport's alone.
        return this.devices;
    }

    async connect(id: string): Promise<void> {
        if (this.failConnect !== null) throw this.failConnect;
        if (this.refuseNextConnections > 0) {
            this.refuseNextConnections--;
            throw refusal();
        }
        if (this.refuseConnection || this.refuseIds.includes(id)) {
            throw refusal();
        }
        // Keyed by id, as the real transport's name is. Only when a scan
        // heard it, so a returning user still has no name.
        const heard = this.heardNames.get(id);
        if (heard !== undefined) this.advertisedName = heard;
        this.connectedTo = id;
    }

    async describeGatt(): Promise<string[]> {
        if (this.gatt === null) throw new Error("no services");
        return this.gatt;
    }

    async disconnect(): Promise<void> {
        this.connectedTo = null;
    }

    async write(frame: Uint8Array): Promise<void> {
        if (this.connectedTo === null) throw new Error("not connected");
        const outgoing = frame[3] | (frame[4] << 8);
        if (this.failWriteOf !== null && this.failWriteOf.code === outgoing) {
            throw new Error(this.failWriteOf.reason);
        }
        if (this.failNextWrite !== null) {
            const reason = this.failNextWrite;
            this.failNextWrite = null;
            throw new Error(reason);
        }
        this.written.push(frame);
        const code = frame[3] | (frame[4] << 8);
        // As V12.0D.500 does (2026-10-19): the vitals follow a handshake by
        // themselves, and a bare 40521 request is ignored.
        if (code === 8100 && this.infoReply !== null) {
            if (this.ignoreInfoRequests > 0) this.ignoreInfoRequests--;
            else this.emit(this.infoReply);
        }
    }

    onFrame(listener: (frame: Uint8Array, source?: string) => void): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    onDisconnect(listener: () => void): () => void {
        this.disconnectListeners.add(listener);
        return () => this.disconnectListeners.delete(listener);
    }

    isConnected(): boolean {
        return this.connectedTo !== null;
    }

    /** Play a frame from the machine, optionally naming the channel it came on. */
    emit(frame: number[], source?: string): void {
        this.frameListeners.forEach((listener) => listener(Uint8Array.from(frame), source));
    }

    /** Drop the link, as the radio would. */
    drop(): void {
        this.connectedTo = null;
        this.disconnectListeners.forEach((listener) => listener());
    }
}
