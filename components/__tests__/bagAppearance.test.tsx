import React from "react";
import {Platform} from "react-native";
import {fireEvent, screen, within} from "@testing-library/react-native";

import BagPickerSheet from "@/components/BagPickerSheet";
import BagSection from "@/components/BagSection";
import BagSheet from "@/components/BagSheet";
import ReadyToBrewCard from "@/components/ReadyToBrewCard";
import RoastDayField from "@/components/RoastDayField";
import {SelectedBagRow} from "@/components/SelectedBagRow";
import {accents, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {bagFixture} from "@/test-utils/bags";
import {renderWithProviders} from "@/test-utils/render";

const noop = () => {};
const bag = bagFixture({name: "October bag"});
const choices: AppearanceChoice[] = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));

it("retains the open calendar and selected day when appearance changes", async () => {
    const tree = (choice: AppearanceChoice) => (
        <AppearanceScope choice={choice}>
            <RoastDayField value="2026-10-12" today="2026-10-23" onChange={noop}/>
        </AppearanceScope>
    );
    const view = await renderWithProviders(tree({theme: "original", recipeColours: "original"}));
    await fireEvent.press(screen.getByTestId("bag-roasted-field"));
    await view.rerender(tree({theme: "light", recipeColours: "themed"}));
    expect(screen.getByTestId("bag-roasted-field")).toHaveStyle({
        backgroundColor: resolveAppearance({theme: "light", recipeColours: "themed"}).palette.raised
    });
    if (Platform.OS === "ios") {
        const calendar = screen.getByTestId("bag-roasted-calendar");
        expect(calendar.props.themeVariant).toBe("light");
        expect(calendar.props.value).toEqual(new Date(2026, 9, 12));
    }
});

it.each(choices)("keeps bag controls and recipe actions legible in $theme/$recipeColours", async choice => {
    const appearance = resolveAppearance(choice);
    const {palette} = appearance;
    const view = await renderWithProviders(
        <AppearanceScope choice={choice}>
            <SelectedBagRow label={bag.name} detail="Check remaining coffee" onPress={noop}/>
            <BagSection tracker="xbrw" bag={bag} balance={{kind: "needsCheck"}}
                onChoose={noop} onInventory={noop} onOpenSheet={noop}
                onFinish={noop} onReorder={noop}/>
            <ReadyToBrewCard item={{bagId: bag.id, recipeUuid: "a"}} name="October recipe"
                accent={accents.coffee[0]} bagLine="October bag, Check remaining coffee"
                emphasised onOpen={noop} onBrew={noop} onDismiss={noop} onReorder={noop}/>
        </AppearanceScope>
    );
    const selected = screen.getByRole("button",
        {name: "Bag, October bag, Check remaining coffee"});
    expect(selected).toHaveStyle({borderTopColor: palette.line});
    expect(within(selected).getByText(bag.name)).toHaveStyle({color: palette.text});
    expect(within(selected).getByText("Check remaining coffee")).toHaveStyle({color: palette.dim});
    expect(screen.getByTestId("bag-facts")).toHaveTextContent("250 g bag. Roasted 2026-10-12.");
    expect(screen.getByTestId("bag-facts")).toHaveStyle({color: palette.dim});
    expect(screen.getByTestId("bag-remaining")).toHaveStyle({color: palette.text});
    expect(screen.getByTestId("ready-to-brew")).toHaveStyle({backgroundColor: palette.surface});
    expect(screen.getByRole("button", {name: "Brew October recipe"}))
        .toHaveStyle({backgroundColor: appearance.recipe(accents.coffee[0]).fill});

    await view.rerender(
        <AppearanceScope choice={choice}>
            <BagPickerSheet open onOpenChange={noop} recipeName="October recipe"
                linked={[bag]} selectedId={bag.id} summaryFor={() => "Check remaining coffee"}
                onSelect={noop} onLinkExisting={noop} onAdd={noop}/>
        </AppearanceScope>
    );
    expect(screen.getByRole("radio", {name: /October bag/})).toBeChecked();
    expect(screen.getByRole("radio", {name: /No bag/})).not.toBeChecked();

    await view.rerender(
        <AppearanceScope choice={choice}>
            <BagSheet open epoch={1} bag={null} tracker="xbrw" gramsLeft={null}
                beanName="" onOpenChange={noop} onSave={noop} onFinish={noop} onRemove={noop}/>
        </AppearanceScope>
    );
    expect(screen.getByTestId("bag-save")).toBeDisabled();
    expect(screen.getByLabelText("Bag name")).toHaveStyle({color: palette.text});
    expect(screen.getByTestId("bag-roast-medium")).not.toBeChecked();
});
