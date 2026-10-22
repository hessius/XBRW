import React from "react";
import {act, fireEvent, screen, within} from "@testing-library/react-native";
import {processColor, StyleSheet} from "react-native";
import {makeMutable} from "react-native-reanimated";
import {Toasts, toast} from "@backpackapp-io/react-native-toast";

import DotMatrixText from "@/components/DotMatrixText";
import DotIcon from "@/components/DotIcon";
import Stepper from "@/components/Stepper";
import TextFieldRow from "@/components/TextFieldRow";
import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import MachineDot from "@/components/MachineDot";
import CloudImportRow from "@/components/CloudImportRow";
import {CoffeeBadgeTag, AlertDot, WatchToggle} from "@/components/CatalogueParts";
import WriteSweep from "@/components/WriteSweep";
import Wordmark from "@/components/Wordmark";
import DigitRoll from "@/components/DigitRoll";
import ScrollFade from "@/components/ScrollFade";
import RecipePhoto from "@/components/RecipePhoto";
import PourProfile from "@/components/PourProfile";
import BrewTrace from "@/components/BrewTrace";
import BrewMiniBar from "@/components/BrewMiniBar";
import BrewStageRung from "@/components/BrewStageRung";
import QuickEditPanel from "@/components/QuickEditPanel";
import {BeanProfileDeck} from "@/components/BeanProfileDeck";
import {BeanProfileSheet} from "@/components/BeanProfileSheet";
import {notify} from "@/components/XbrwToast";
import {resolveAppearance, palette} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {DEFAULT_APPEARANCE, THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {renderWithProviders} from "@/test-utils/render";
import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";
import type {BeanProfile} from "@/library/beanProfile";

const noop = () => {};
const animatedSize = makeMutable(18);
const explicit = palette.info;
const cloudEntry = {
    cloudId: 1, name: "Imported", status: "unchanged" as const,
    recipe: new Recipe(undefined, undefined), selected: false, selectable: true
};
const pours = [new Pour(1, 70, 93, 40, 0, 0, 20)];
const progress = makeMutable(1);
const recipe = new Recipe(undefined, undefined);
recipe.dosage = 18;
recipe.ratio = 16;
recipe.pours = pours;
const profile: BeanProfile = {
    counted: 9, untagged: {brews: 0, rated: 0, avgRating: 0},
    rows: [{field: "process", value: "Natural", brews: 9, rated: 4, avgRating: 4.5}]
};

function Defaults({choice}: {choice: AppearanceChoice}) {
    return (
        <AppearanceScope choice={choice}>
            <Wordmark/>
            <DigitRoll value={7} suffix=" ML"/>
            <ScrollFade progress={progress} testID="fade"/>
            <ScrollFade progress={progress} color={explicit} testID="explicit-fade"/>
            <RecipePhoto uri="file://bag.jpg" size={40} radius={4} testID="photo"/>
            <RecipePhoto uri="file://bag.jpg" size={40} radius={4} backing={explicit} testID="explicit-photo"/>
            <PourProfile pours={pours} width={100} height={40} testID="profile"/>
            <PourProfile pours={pours} width={100} height={40} dotted testID="dotted-profile"/>
            <PourProfile pours={pours} width={100} height={40} fill={explicit} stroke={explicit} dot={explicit}
                         testID="explicit-profile"/>
            <BrewTrace pours={pours} samples={[]} accent={explicit} width={100} height={40} plannedSeconds={40}/>
            <BrewMiniBar recipeName="Coffee" dose={18} pours={pours} samples={[]} accent={explicit}
                         phase={{name: "done"}} elapsed={0} holding={false} heldSeconds={0}
                         onOpen={noop} onDismiss={noop}/>
            <BrewStageRung pour={pours[0]} index={0} state="done" accent={explicit}
                           laneSeconds={40} barHeight={11} delivered={70} pauseElapsed={20} stalls={[]}/>
            <QuickEditPanel recipe={recipe} adjustments={{dose: 20}} accent={explicit}
                            temperatureUnit="C" onChange={noop}/>
            <BeanProfileDeck profile={profile} onShowAll={noop}/>
            <BeanProfileSheet profile={profile} open onOpenChange={noop}/>
        </AppearanceScope>
    );
}

function Consumers({choice}: {choice: AppearanceChoice}) {
    return (
        <AppearanceScope choice={choice}>
            <DotMatrixText testID="static-text">READOUT</DotMatrixText>
            <DotMatrixText testID="animated-text" animatedFontSize={animatedSize}>LIVE</DotMatrixText>
            <DotMatrixText testID="explicit-text" color={explicit}>EXPLICIT</DotMatrixText>
            <DotIcon name="plus" size={18}/>
            <Stepper label="Dose" value={18} min={1} max={31} step={1} onChange={noop}/>
            <TextFieldRow topic="name" label="Name" initialValue=""
                          placeholder="A name" showHint={false} onCommit={noop}/>
            <RecipeOverflowSheet open canRefreshName={false} onOpenChange={noop}
                                 onShare={noop} onDuplicate={noop} onDelete={noop}/>
            <MachineDot status="connecting" collapsed={false} onPress={noop}/>
            <CloudImportRow entry={cloudEntry} onToggle={noop}/>
            <CoffeeBadgeTag badge="new" testID="new-badge"/>
            <CoffeeBadgeTag badge="back" testID="back-badge"/>
            <AlertDot count={2} testID="alert-dot"/>
            <WatchToggle on onChange={noop}/>
            <WriteSweep blocksWritten={1} totalBlocks={3}/>
            <Toasts overrideScreenReaderEnabled={false}/>
        </AppearanceScope>
    );
}

describe("persistent appearance consumers", () => {
    afterEach(async () => { await act(() => toast.remove()); });

    it("recolours existing text, glyphs, fields, controls, open sheet and actual toaster without resetting entry", async () => {
        await renderWithProviders(<Consumers choice={DEFAULT_APPEARANCE}/>);
        await fireEvent.press(screen.getByLabelText("Edit Dose"));
        await fireEvent.changeText(screen.getByLabelText("Dose"), "23");
        await act(() => notify({tone: "error", message: "Still mounted"}));
        expect(screen.getByTestId("toast-view")).toBeTruthy();
        expect(screen.getByRole("alert", {includeHiddenElements: true})).toBeTruthy();

        for (const theme of ["light", ...THEME_IDS] as const) {
            for (const recipeColours of ["original", "themed"] as const) {
                const choice = {theme, recipeColours};
                const {palette} = resolveAppearance(choice);
                await screen.rerender(<Consumers choice={choice}/>);
                expect(screen.getByTestId("static-text")).toHaveStyle({color: palette.text});
                expect(screen.getByTestId("animated-text")).toHaveStyle({color: palette.text});
                expect(screen.getByTestId("explicit-text")).toHaveStyle({color: explicit});
                expect(screen.getAllByTestId("dot-icon-dot", {includeHiddenElements: true})
                    .some(node => StyleSheet.flatten(node.props.style).backgroundColor === palette.text)).toBe(true);
                expect(screen.getByLabelText("Dose").props.value).toBe("23");
                expect(screen.getByLabelText("Dose")).toHaveStyle({color: palette.text});
                expect(screen.getByLabelText("Increase Dose")).toHaveStyle({
                    backgroundColor: palette.control, borderColor: palette.line
                });
                expect(screen.getByPlaceholderText("A name").props.placeholderTextColor).toBe(palette.placeholder);
                expect(screen.getByTestId("overflow-share-label")).toHaveStyle({color: palette.text});
                expect(screen.getByRole("alert", {includeHiddenElements: true})).toHaveStyle({
                    backgroundColor: palette.surface, borderTopColor: palette.line
                });
                expect(screen.getByText("Still mounted", {includeHiddenElements: true})).toHaveStyle({color: palette.text});
                expect(screen.getByText("ERROR", {includeHiddenElements: true})).toHaveStyle({color: palette.danger});
                expect(screen.getAllByTestId("sheet-frame", {includeHiddenElements: true})
                    .some(node => StyleSheet.flatten(node.props.style).backgroundColor === palette.surface)).toBe(true);
            }
        }
    });

    it("updates module-time tone maps and filled-surface foregrounds in place", async () => {
        await renderWithProviders(<Consumers choice={DEFAULT_APPEARANCE}/>);
        const choice = {theme: "light", recipeColours: "themed"} as const;
        const appearance = resolveAppearance(choice);
        const {palette} = appearance;
        await screen.rerender(<Consumers choice={choice}/>);
        expect(screen.getByTestId("cloud-import-status")).toHaveStyle({color: palette.dim});
        expect(screen.getByTestId("new-badge")).toHaveStyle({color: palette.info});
        expect(screen.getByTestId("back-badge")).toHaveStyle({color: palette.success});
        expect(within(screen.getByTestId("alert-dot", {includeHiddenElements: true}))
            .getByText("2", {includeHiddenElements: true}))
            .toHaveStyle({color: appearance.onFill(palette.info).text});
        expect(screen.getAllByTestId("write-sweep-block").map(node =>
            StyleSheet.flatten(node.props.style).backgroundColor))
            .toEqual([palette.success, palette.text, palette.line]);
        expect(within(screen.getByTestId("machine-dot-lit", {includeHiddenElements: true}))
            .getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0])
            .toHaveStyle({backgroundColor: palette.warn});
    });

    it.each([
        ["success", "DONE", "success"],
        ["info", "NOTE", "info"]
    ] as const)("updates a mounted %s toast through its actual host", async (tone, label, token) => {
        await renderWithProviders(<Consumers choice={DEFAULT_APPEARANCE}/>);
        await act(() => notify({tone, message: "Through the host"}));
        const choice = {theme: "light", recipeColours: "original"} as const;
        await screen.rerender(<Consumers choice={choice}/>);
        expect(within(screen.getByTestId("toast-view"))
            .getByText(label, {includeHiddenElements: true}))
            .toHaveStyle({color: resolveAppearance(choice).palette[token]});
    });

    it("updates optional defaults and helper ink while preserving explicit presentation colours", async () => {
        const rendered = await renderWithProviders(<Defaults choice={DEFAULT_APPEARANCE}/>);
        const choice = {theme: "light", recipeColours: "themed"} as const;
        const appearance = resolveAppearance(choice);
        const {palette} = appearance;
        await screen.rerender(<Defaults choice={choice}/>);
        expect(screen.getByText("XBRW")).toHaveStyle({color: palette.text});
        expect(screen.getByText(" ML", {includeHiddenElements: true})).toHaveStyle({color: palette.text});
        expect(screen.getByTestId("photo", {includeHiddenElements: true}).parent)
            .toHaveStyle({backgroundColor: palette.raised});
        expect(screen.getByTestId("explicit-photo", {includeHiddenElements: true}).parent)
            .toHaveStyle({backgroundColor: explicit});
        const foreground = appearance.onFill(palette.text);
        expect(within(screen.getByTestId("profile")).getByTestId("profile-wash").props.fill.payload)
            .toBe(processColor(foreground.profileFill));
        expect(within(screen.getByTestId("explicit-profile")).getByTestId("profile-wash").props.fill.payload)
            .toBe(processColor(explicit));
        expect(within(screen.getByTestId("dotted-profile")).getAllByTestId("profile-dot")[0].props.fill.payload)
            .toBe(processColor(foreground.profileDot));
        expect(screen.getAllByTestId("trace-plan").every(node => node.props.stroke.payload === processColor(palette.muted))).toBe(true);
        expect(screen.getByTestId("quick-edit-dose-baseline")).toHaveStyle({color: palette.dim});
        expect(screen.getAllByText("4.5 · 9", {includeHiddenElements: true})
            .every(node => StyleSheet.flatten(node.props.style).color === palette.info)).toBe(true);
        expect(screen.getAllByText("Natural", {includeHiddenElements: true})
            .every(node => StyleSheet.flatten(node.props.style).color === palette.text)).toBe(true);
        const json = JSON.stringify(rendered.toJSON());
        expect(json).toContain(`,1,${Number(processColor(palette.base)) | 0}]`);
        expect(json).toContain(`,1,${Number(processColor(explicit)) | 0}]`);
    });
});
