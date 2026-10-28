import {useEffect, useRef, useState} from "react";
import {slotWriteAvailability} from "@/components/EasyModeSlots";
import type {useEasyModeSlots} from "@/hooks/useEasyModeSlots";
import type Machine from "@/library/machine/Machine";
import {isActiveBrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";
import {SLOT_NAMES, snapshotRecipe, type SlotIndex, type SlotRecord} from "@/library/slots/slotModel";

type Props = {
    enabled: boolean;
    recipe?: Recipe;
    deviceId: string;
    serial: string | null;
    serialMatches: boolean;
    machine: Pick<Machine, "slotIdentity" | "phase">;
    connect: () => Promise<void>;
    slots: Pick<ReturnType<typeof useEasyModeSlots>, "record" | "available" | "assign" | "writeTo">;
};

type Placement = {
    deviceId: string;
    serial: string | null;
    index: SlotIndex;
    phase: "connecting" | "writing" | "manual" | "confirmed";
    notice: string | null;
};

export function useEasyModePlacement({
    enabled, recipe, deviceId, serial, serialMatches, machine, connect, slots
}: Props) {
    const [placement, setPlacement] = useState<Placement | null>(null);
    const pending = useRef<AbortController | null>(null);
    if (placement !== null && (!enabled || placement.deviceId !== deviceId)) setPlacement(null);
    const current = enabled && placement?.deviceId === deviceId ? placement : null;

    useEffect(() => () => {
        pending.current?.abort();
        pending.current = null;
    }, [enabled, deviceId]);

    async function place(index: SlotIndex): Promise<void> {
        if (!enabled || recipe === undefined || pending.current !== null || current !== null) return;
        const controller = new AbortController();
        pending.current = controller;
        let assigned = false;
        const local = `${recipe.displayName()} is kept in slot ${SLOT_NAMES[index]} on this phone.`;
        try {
            if (!slots.assign(index, recipe)) throw new Error("Could not assign this recipe.");
            assigned = true;
            const drafts: SlotRecord["drafts"] = [...slots.record.drafts];
            drafts[index] = snapshotRecipe(recipe);
            const planned = {...slots.record, drafts};
            const availability = () => slotWriteAvailability({
                record: planned, deviceId, connected: true, available: slots.available, serialMatches,
                busy: machine.phase !== undefined && isActiveBrewPhase(machine.phase)
            });
            const before = availability();
            if (before !== null) throw new Error(before);
            if (machine.slotIdentity === null) {
                setPlacement({deviceId, serial, index, phase: "connecting", notice: null});
                await connect();
            }
            if (controller.signal.aborted) return;
            const actual = machine.slotIdentity;
            if (actual === null) throw new Error("The machine did not connect.");
            if (actual.deviceId !== deviceId || (serial !== null && actual.serial !== serial)) {
                throw new Error("Connected to a different machine. Choose the intended machine and try again.");
            }
            const after = availability();
            if (after !== null) throw new Error(after);
            setPlacement({deviceId, serial: actual.serial, index, phase: "writing", notice: null});
            await slots.writeTo(actual);
            if (!controller.signal.aborted) {
                setPlacement({deviceId, serial: actual.serial, index, phase: "confirmed", notice: null});
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                const reason = error instanceof Error ? error.message : String(error);
                setPlacement({deviceId, serial, index, phase: "manual",
                    notice: `${assigned ? `${local} ` : ""}${reason}`});
            }
        }
        if (pending.current === controller) pending.current = null;
    }

    return {
        place,
        placing: enabled && recipe !== undefined && current?.phase !== "manual",
        pending: current?.phase === "connecting" || current?.phase === "writing",
        connecting: current?.phase === "connecting",
        confirmed: current?.phase === "confirmed" && current.serial === serial,
        index: current?.index ?? null,
        notice: current?.notice ?? null
    };
}
