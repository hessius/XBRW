import React from "react";
import {StyleSheet} from "react-native";

import ExportButton from "@/components/ExportButton";
import {palette} from "@/constants/colors";
import {buildBackup, parseBackup} from "@/library/backup";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

describe("ExportButton", () => {
    it.each(["red", "rgb(255,0,0)"])(
        "renders a record action with the restored historical accent %s", async accent => {
            const record: BrewRecord = {
                id: "legacy", recipeUuid: "u1", recipeName: "Ethiopia", accent,
                startedAt: 1_700_000_000_000, pouringAt: 1_700_000_010_000,
                endedAt: 1_700_000_200_000, outcome: "done", failure: null,
                pours: 2, waterTotal: 250, cupTotal: 240, heldSeconds: 0
            };
            const recipe = new Recipe(undefined,
                JSON.stringify({pours: [], ratio: 16, dosage: 18, grindSize: 60}));
            const restored = parseBackup(buildBackup([recipe], {}, "2.1.0", [record]));
            expect(restored.ok).toBe(true);
            if (!restored.ok) throw new Error(restored.reason);
            expect(restored.payload.skippedBrews).toBe(0);
            expect(restored.payload.brews[0].accent).toBe(accent);

            const {getByTestId} = await renderWithProviders(
                <ExportButton testID="restored-export" label="Save as image" busy={false}
                              accent={restored.payload.brews[0].accent} onPress={jest.fn()} />
            );
            expect(getByTestId("restored-export-label")).toHaveStyle({color: "#ff0000"});
            expect(getByTestId("restored-export-surface"))
                .toHaveStyle({borderColor: "#ff0000", backgroundColor: palette.base});
        });

    it("shouts its label in the dot-matrix face", async () => {
        const {getByText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={false} onPress={jest.fn()} />
        );

        expect(getByText("SAVE AS IMAGE")).toBeTruthy();
    });

    it("says it is working while the export is in flight", async () => {
        const {getByText, queryByText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={jest.fn()} />
        );

        expect(getByText("WORKING…")).toBeTruthy();
        expect(queryByText("SAVE AS IMAGE")).toBeNull();
    });

    it("does not fire again while it is working", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={onPress} />
        );

        expect(getByLabelText("Save as image").props.accessibilityState)
            .toEqual(expect.objectContaining({disabled: true}));
    });

    it("dims itself while it is working", async () => {
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={true} onPress={jest.fn()} />
        );

        const style = StyleSheet.flatten(getByLabelText("Save as image").props.style);
        expect(style.opacity).toBe(0.5);
    });

    it("is at full strength when it is not working", async () => {
        const {getByLabelText} = await renderWithProviders(
            <ExportButton label="Save as image" busy={false} onPress={jest.fn()} />
        );

        const style = StyleSheet.flatten(getByLabelText("Save as image").props.style);
        expect(style.opacity).toBe(1);
    });

    it("keeps the original muted outline by default", async () => {
        const {getByTestId} = await renderWithProviders(
            <ExportButton testID="export-button" label="Save as image"
                          busy={false} onPress={jest.fn()} />
        );

        expect(getByTestId("export-button-surface"))
            .toHaveStyle({borderColor: palette.line});
        expect(getByTestId("export-button-label"))
            .toHaveStyle({color: palette.dim});
    });

    it("can opt into an accent outline", async () => {
        const accent = palette.info;
        const {getByTestId} = await renderWithProviders(
            <ExportButton testID="export-button" label="Save as image"
                          busy={false} accent={accent} onPress={jest.fn()} />
        );

        expect(getByTestId("export-button-surface"))
            .toHaveStyle({borderColor: accent, backgroundColor: palette.base});
        expect(getByTestId("export-button-label"))
            .toHaveStyle({color: accent});
    });

    it("keeps the busy treatment on an accent outline", async () => {
        const accent = palette.info;
        const {getByLabelText, getByTestId, getByText, queryByText} =
            await renderWithProviders(
                <ExportButton testID="export-button" label="Save as image"
                              busy={true} accent={accent} onPress={jest.fn()} />
            );

        const style = StyleSheet.flatten(getByLabelText("Save as image").props.style);
        expect(style.opacity).toBe(0.5);
        expect(getByText("WORKING…")).toBeTruthy();
        expect(queryByText("SAVE AS IMAGE")).toBeNull();
        expect(getByTestId("export-button-label")).toHaveStyle({color: accent});
    });
});
