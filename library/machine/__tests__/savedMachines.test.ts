import {
    MACHINE_LABEL_MAX,
    addSavedMachine,
    bestSavedMachine,
    machineColourOf,
    machineLabel,
    machineOrderWord,
    machineTag,
    makeDefaultMachine,
    moveSavedMachine,
    nextMachineColour,
    parseSavedMachines,
    removeSavedMachine,
    replaceSavedMachineId,
    resolveSavedMachines,
    scanVerdict,
    serialiseSavedMachines,
    splitByRange,
    unsavedMachines,
    updateSavedMachine,
    type ActiveMachine,
    type SavedMachine
} from "@/library/machine/savedMachines";
import {machineColours, palette} from "@/constants/colors";

function saved(id: string, overrides: Partial<SavedMachine> = {}): SavedMachine {
    return {
        id, label: "", model: "studio", modelString: "", advertisedName: "", serial: "",
        ...overrides
    };
}

const NOBODY: ActiveMachine = {deviceId: "", model: "studio", modelString: "", name: ""};

/** Five saved machines, as a cafe with a long counter might have. */
const CAFE = ["bar-1", "bar-2", "window", "back", "spare"].map((id) => saved(id, {label: id}));

describe("reading the stored list", () => {
    it("reads what it wrote", () => {
        const machines = [saved("a", {label: "Home", colour: 0}),
                          saved("b", {label: "Work", model: "original", colour: 1})];
        expect(parseSavedMachines(serialiseSavedMachines(machines))).toEqual(machines);
    });

    it("stores nothing at all for an empty list", () => {
        // The default is "", so an emptied list reads back exactly as a phone
        // that never had one.
        expect(serialiseSavedMachines([])).toBe("");
    });

    it("keeps the good entries of a damaged list rather than losing every machine", () => {
        const raw = JSON.stringify([
            saved("a"), {id: "b", label: 3}, "nonsense", saved("c", {model: "original"}),
            {...saved("d"), model: "toaster"}
        ]);
        expect(parseSavedMachines(raw).map((entry) => entry.id)).toEqual(["a", "c"]);
    });

    it("reads a list written before serials were kept", () => {
        const {serial: _, ...old} = saved("a", {label: "Home"});
        expect(parseSavedMachines(JSON.stringify([old])))
            .toEqual([saved("a", {label: "Home", colour: 0})]);
    });

    it("keeps the higher-priority copy of a duplicated id", () => {
        const raw = JSON.stringify([saved("a", {label: "first"}), saved("a", {label: "second"})]);
        expect(parseSavedMachines(raw)).toEqual([saved("a", {label: "first", colour: 0})]);
    });

    it("treats anything that is not a JSON array as no list", () => {
        expect(parseSavedMachines("{")).toEqual([]);
        expect(parseSavedMachines("{}")).toEqual([]);
    });
});

describe("migrating somebody with one remembered machine", () => {
    it("gives them a list of one, their machine, as the default, with their model", () => {
        const machines = resolveSavedMachines("", {
            deviceId: "AA:BB", model: "original", modelString: "J15", name: "XBLOOM 1"
        });
        // Green, the colour the link glyph has always drawn one machine in.
        expect(machines).toEqual([saved("AA:BB", {
            model: "original", modelString: "J15", advertisedName: "XBLOOM 1", colour: 0
        })]);
    });

    it("gives nobody a machine they never paired", () => {
        expect(resolveSavedMachines("", NOBODY)).toEqual([]);
    });

    it("believes the active machine's own keys over the stored copy", () => {
        // The settings row, a restore and Studio detection all write
        // `machineModel` without knowing the list exists.
        const raw = serialiseSavedMachines([saved("a", {label: "Home"}), saved("b", {label: "Work"})]);
        const machines = resolveSavedMachines(raw, {
            deviceId: "b", model: "original", modelString: "X", name: "N"
        });
        expect(machines[0]).toEqual(saved("a", {label: "Home", colour: 0}));
        expect(machines[1]).toEqual(saved("b", {
            label: "Work", model: "original", modelString: "X", advertisedName: "N", colour: 1
        }));
    });
});

describe("telling machines apart", () => {
    it("uses the user's name, then the advertised one, then its place", () => {
        expect(machineLabel(saved("a", {label: " Home ", advertisedName: "XBLOOM"}), 0)).toBe("Home");
        expect(machineLabel(saved("a", {advertisedName: "XBLOOM"}), 0)).toBe("XBLOOM");
        expect(machineLabel(saved("a"), 2)).toBe("xBloom 3");
    });

    it("tags a machine by the end of its serial once it has one", () => {
        expect(machineTag(saved("AA:BB:CC", {serial: "j15a01d48h051"}))).toBe("#H051");
    });

    it("falls back to the end of the Bluetooth id before it has connected", () => {
        expect(machineTag(saved("AA:BB:CC:DD:7F:3A"))).toBe("ID 7F3A");
        expect(machineTag({id: "6e400001-b5a3-f393-e0a9-e50e24dc0a9e"})).toBe("ID 0A9E");
    });

    it("trims and caps a name", () => {
        const [entry] = updateSavedMachine([saved("a")], "a", {label: `  ${"x".repeat(60)}  `});
        expect(entry.label).toHaveLength(MACHINE_LABEL_MAX);
    });

    it("allows two machines the same name", () => {
        const machines = updateSavedMachine(
            updateSavedMachine([saved("a"), saved("b")], "a", {label: "Bar"}), "b", {label: "Bar"}
        );
        expect(machines.map((entry) => entry.label)).toEqual(["Bar", "Bar"]);
    });
});

describe("the order", () => {
    const ids = (machines: SavedMachine[]) => machines.map((entry) => entry.id);

    it("makes a machine the default by moving it to the top", () => {
        expect(ids(makeDefaultMachine(CAFE, "back"))).toEqual(["back", "bar-1", "bar-2", "window", "spare"]);
    });

    it("moves one place at a time and stops at the ends", () => {
        expect(ids(moveSavedMachine(CAFE, "window", -1))).toEqual(["bar-1", "window", "bar-2", "back", "spare"]);
        expect(ids(moveSavedMachine(CAFE, "window", 1))).toEqual(["bar-1", "bar-2", "back", "window", "spare"]);
        expect(ids(moveSavedMachine(CAFE, "bar-1", -1))).toEqual(ids(CAFE));
        expect(ids(moveSavedMachine(CAFE, "spare", 1))).toEqual(ids(CAFE));
    });

    it("has no limit on how many machines it holds", () => {
        const many = Array.from({length: 12}, (_, index) => saved(`m${index}`));
        expect(parseSavedMachines(serialiseSavedMachines(many))).toHaveLength(12);
        expect(ids(makeDefaultMachine(many, "m11"))[0]).toBe("m11");
    });

    it("removes one and keeps the rest in order", () => {
        expect(ids(removeSavedMachine(CAFE, "bar-2"))).toEqual(["bar-1", "window", "back", "spare"]);
    });

    it("keeps a machine's name and place when its identifier changes", () => {
        const machines = replaceSavedMachineId([saved("old", {label: "Home"})], "old", "new");
        expect(machines).toEqual([saved("new", {label: "Home"})]);
    });
});

describe("choosing from one scan", () => {
    const priority = CAFE.map((entry) => entry.id);

    it("stops as soon as the default is heard", () => {
        expect(scanVerdict([{id: "bar-1"}], priority)).toBe("stop");
    });

    it("waits a little longer when only a lower machine has been heard", () => {
        expect(scanVerdict([{id: "back"}], priority)).toBe("settle");
    });

    it("ignores xBlooms nobody saved", () => {
        expect(scanVerdict([{id: "someone-elses"}], priority)).toBe("continue");
    });

    it("with five saved and three nearby, the default not among them, takes the highest nearby", () => {
        const heard = [{id: "spare"}, {id: "window"}, {id: "unsaved"}, {id: "bar-2"}];
        expect(bestSavedMachine(heard, CAFE)?.id).toBe("bar-2");
    });

    it("follows the user's order, not the order machines were heard in", () => {
        expect(bestSavedMachine([{id: "spare"}, {id: "back"}], CAFE)?.id).toBe("back");
    });

    it("prefers the machine on screen when it is heard, whatever its rank", () => {
        expect(bestSavedMachine([{id: "bar-1"}, {id: "back"}], CAFE, "back")?.id).toBe("back");
        expect(scanVerdict([{id: "back"}], priority, "back")).toBe("stop");
    });

    it("waits a little for the machine on screen when only the default has been heard", () => {
        expect(scanVerdict([{id: "bar-1"}], priority, "back")).toBe("settle");
    });

    it("falls back to the order when the machine on screen is not heard", () => {
        expect(bestSavedMachine([{id: "spare"}, {id: "window"}], CAFE, "back")?.id).toBe("window");
    });

    it("ignores a preferred id that is not saved", () => {
        expect(bestSavedMachine([{id: "stranger"}, {id: "spare"}], CAFE, "stranger")?.id).toBe("spare");
        expect(scanVerdict([{id: "bar-1"}], priority, "stranger")).toBe("stop");
    });

    it("never offers an unsaved machine when no saved one is heard", () => {
        expect(bestSavedMachine([{id: "unsaved"}], CAFE)).toBeNull();
    });

    it("marks the others nearby, in order, and the rest not nearby", () => {
        const heard = ["spare", "window", "bar-2"];
        const {inRange, away} = splitByRange(CAFE, heard, null);
        expect(inRange.map(({machine}) => machine.id)).toEqual(["bar-2", "window", "spare"]);
        expect(inRange.map(({index}) => index)).toEqual([1, 2, 4]);
        expect(away.map(({machine}) => machine.id)).toEqual(["bar-1", "back"]);
    });

    it("counts the connected machine as nearby, though a connected machine does not advertise", () => {
        const {inRange} = splitByRange(CAFE, ["window"], "bar-2");
        expect(inRange.map(({machine}) => machine.id)).toEqual(["bar-2", "window"]);
    });

    it("marks nothing either way before anybody has looked", () => {
        const {inRange, away} = splitByRange(CAFE, null, "bar-2");
        expect(inRange).toEqual([]);
        expect(away).toHaveLength(5);
    });
});

describe("adding one of several unsaved machines", () => {
    it("lists every unsaved machine, loudest first as a hint, saved ones left out", () => {
        const heard = [
            {id: "bar-1", name: "XBLOOM", rssi: -30},
            {id: "far", name: "XBLOOM", rssi: -90},
            {id: "near", name: "XBLOOM", rssi: -45},
            {id: "quiet", name: "XBLOOM"}
        ];
        expect(unsavedMachines(heard, CAFE).map((entry) => entry.id)).toEqual(["near", "far", "quiet"]);
    });

    it("keeps the order heard when the radio gives no strength", () => {
        const heard = [{id: "x", name: ""}, {id: "y", name: ""}];
        expect(unsavedMachines(heard, []).map((entry) => entry.id)).toEqual(["x", "y"]);
    });
});

describe("machine colours", () => {
    it("draws a machine with no colour in today's connected green", () => {
        expect(machineColourOf({}).ink).toBe(palette.success);
        expect(machineColourOf({}).muted).toBe(palette.successMuted);
    });

    it("gives the first machine green and the next ones the next unused colours", () => {
        const raw = JSON.stringify([saved("a"), saved("b"), saved("c")]);
        expect(parseSavedMachines(raw).map((machine) => machine.colour)).toEqual([0, 1, 2]);
    });

    it("never moves a colour somebody chose, and fills the gaps around it", () => {
        const raw = JSON.stringify([saved("a"), saved("b", {colour: 0}), saved("c")]);
        expect(parseSavedMachines(raw).map((machine) => machine.colour)).toEqual([1, 0, 2]);
    });

    it("reads back a colour it stored", () => {
        const raw = serialiseSavedMachines([saved("a", {colour: 3}), saved("b", {colour: 2})]);
        expect(parseSavedMachines(raw).map((machine) => machine.colour)).toEqual([3, 2]);
    });

    it("replaces a colour that is not in the palette rather than dropping the machine", () => {
        const raw = JSON.stringify([{...saved("a"), colour: 99}, {...saved("b"), colour: "red"}]);
        expect(parseSavedMachines(raw).map((machine) => [machine.id, machine.colour]))
            .toEqual([["a", 0], ["b", 1]]);
    });

    it("gives an added machine the first colour nobody has", () => {
        const list = addSavedMachine([saved("a", {colour: 0}), saved("b", {colour: 2})], saved("c"));
        expect(list[2].colour).toBe(1);
    });

    it("repeats colours as evenly as it can once every one is taken", () => {
        const taken = machineColours.map((_, colour) => ({colour}));
        expect(nextMachineColour(taken)).toBe(0);
        expect(nextMachineColour([...taken, {colour: 0}])).toBe(1);
    });

    it("changes a colour through an update, and ignores one that is not in the palette", () => {
        const list = [saved("a", {colour: 0})];
        expect(updateSavedMachine(list, "a", {colour: 2})[0].colour).toBe(2);
        expect(updateSavedMachine(list, "a", {colour: 42})[0].colour).toBe(0);
        expect(updateSavedMachine([saved("a")], "a", {label: "Home"})[0]).not.toHaveProperty("colour");
    });

    it("keeps a machine's colour when its identifier changes or it moves", () => {
        const list = [saved("a", {colour: 3}), saved("b", {colour: 1})];
        expect(replaceSavedMachineId(list, "a", "a2")[0].colour).toBe(3);
        expect(makeDefaultMachine(list, "b").map((machine) => machine.colour)).toEqual([1, 3]);
    });
});

describe("the connect order in words", () => {
    it("says nothing with one machine, because there is no order", () => {
        expect(machineOrderWord(0, 1)).toBeNull();
        expect(machineOrderWord(0, 0)).toBeNull();
    });

    it.each([
        [0, "Tried 1st"], [1, "Tried 2nd"], [2, "Tried 3rd"], [3, "Tried 4th"],
        [10, "Tried 11th"], [11, "Tried 12th"], [12, "Tried 13th"], [20, "Tried 21st"]
    ])("calls place %i of several %s", (index, words) => {
        expect(machineOrderWord(index, 30)).toBe(words);
    });
});
