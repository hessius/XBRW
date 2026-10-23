/**
 * A brew is pinned to the link it started on.
 *
 * The pre-flight asks the machine how it is doing and can wait several
 * seconds for an answer. A machine picked by hand in that window replaces the
 * link, and the recipe must not go to the new machine instead.
 */
import Machine from "@/library/machine/Machine";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {coffee} from "@/library/slots/__tests__/fixtures";

async function connectOnlyCodes(): Promise<Set<number>> {
    const transport = new FakeTransport();
    await new Machine(transport, {frameGapMs: 0}).connect("X");
    return new Set(transport.sent);
}

it("refuses to send when the link is replaced during the pre-flight", async () => {
    const connectOnly = await connectOnlyCodes();
    const transport = new FakeTransport();
    transport.devices = [{id: "WORK", name: "XBLOOM"}, {id: "HOME", name: "XBLOOM"}];
    const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 40});
    // No vitals on this link, so the pre-flight handshakes and waits.
    transport.infoReply = null;
    await machine.connect("WORK");

    const brewing = machine.brew(coffee());
    await new Promise((resolve) => setTimeout(resolve, 10));
    const before = transport.sent.length;
    transport.infoReply = machineInfoFrame();
    await machine.connect("HOME");

    await expect(brewing).rejects.toThrow();
    expect(transport.connectedTo).toBe("HOME");
    // Everything sent since the switch is the connect to Home, never a recipe.
    expect(transport.sent.slice(before).filter((code) => !connectOnly.has(code))).toEqual([]);
});

it("still brews when nothing changed during the pre-flight", async () => {
    const connectOnly = await connectOnlyCodes();
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 40});
    await machine.connect("WORK");

    await machine.brew(coffee());

    expect(transport.sent.filter((code) => !connectOnly.has(code)).length).toBeGreaterThan(0);
});

it.each([
    {method: "brew", action: "cancel"},
    {method: "brew", action: "replace"},
    {method: "switchToProAndRetry", action: "cancel"},
    {method: "switchToProAndRetry", action: "replace"}
] as const)("keeps $method owned across target verification and $action", async ({method, action}) => {
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0});
    await machine.connect("WORK");
    let release: () => void = () => { throw new Error("Verification has not started"); };
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered: () => void = () => { throw new Error("Verification was not observed"); };
    const checking = new Promise<void>(resolve => { entered = resolve; });
    const brewing = machine[method](coffee(), async () => {
        entered();
        await held;
    }).catch((error: unknown) => error);
    await checking;

    if (action === "cancel") await machine.cancelBrew();
    else await machine.connect("HOME");
    const phase = machine.phase;
    transport.written = [];
    release();
    const outcome = await brewing;

    expect(transport.sent).toEqual([]);
    expect(machine.phase).toEqual(phase);
    if (action === "cancel") expect(outcome).toBeUndefined();
    else expect(outcome).toBeInstanceOf(Error);
});
