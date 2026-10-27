import {useRef, useState, useSyncExternalStore} from "react";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ControlSnapshot, SettingEditorState, SettingId} from "@/library/machine/controlModel";
import {validateSetting} from "@/library/machine/controlModel";
import {applySettingProposal, emptySettingEditor, proposeReading} from "@/library/machine/settingEditor";

export function useMachineSettingSupport(controls: MachineControls, identity: ControlIdentity, id: SettingId) {
    const {deviceId, serial} = identity;
    return useSyncExternalStore(
        controls.subscribeToolSupport,
        () => controls.describeSettings({deviceId, serial}, id),
        () => controls.describeSettings({deviceId, serial}, id)
    );
}

/** Drafts belong to an identity/setting-keyed screen, not the shared controller. */
export function useMachineSetting(
    identity: ControlIdentity, id: SettingId, controls: MachineControls, snapshot: ControlSnapshot
) {
    const support = useMachineSettingSupport(controls, identity, id);
    const [draft, setDraft] = useState<SettingEditorState>(() => emptySettingEditor(id));
    const [error, setError] = useState<string | null>(null);
    const [applied, setApplied] = useState(false);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const editable = !pending && snapshot.phase === "closed" && support.unavailable === null;
    let valid = false;
    try {
        if (draft.proposal !== null) {
            validateSetting(draft.id, draft.proposal, support.policy);
            valid = true;
        }
    } catch { /* A missing or invalid qualification cannot enable Apply. */ }

    async function perform(action: () => Promise<void>, applying = false): Promise<void> {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setError(null);
        setApplied(false);
        try {
            await action();
            if (applying) setApplied(true);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Machine setting operation failed.");
        } finally {
            busy.current = false;
            setPending(false);
        }
    }

    function change(next: SettingEditorState): void {
        if (!editable || next.id !== id) return;
        setDraft(next);
        setApplied(false);
        setError(null);
    }

    function chooseCurrent(): void {
        if (!editable || support.reading !== "current" || snapshot.settings === null) return;
        change(proposeReading(id, snapshot.settings));
    }

    return {
        support, draft, change, chooseCurrent, editable, pending, applied, error,
        canApply: editable && valid && support.reading === "current",
        read: () => { if (editable) void perform(() => controls.readSettings(identity, id)); },
        apply: () => {
            if (editable && valid && support.reading === "current") {
                void perform(() => applySettingProposal(controls, identity, draft), true);
            }
        },
        recover: () => { if (support.recoverable) void perform(() => controls.recover()); }
    };
}
