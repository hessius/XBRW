import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {Dimensions, View} from "react-native";

import TeaStageLadder, {type TeaStageView} from "@/components/TeaStageLadder";
import {accents} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function stages(): TeaStageView[] {
    return [45, 60, 90].map((steepSeconds, index) => ({
        index,
        fillMl: 90,
        temperatureC: index === 2 ? 80 : 92,
        steepSeconds,
        fill: {status: "not-observed"},
        steep: {status: "not-observed"},
        ending: {boundary: "unknown", status: "not-observed", drainSeconds: null}
    }));
}

describe("TeaStageLadder", () => {
    it("shows explicit stage observations and does not invent a measurement", async () => {
        await renderWithProviders(
            <TeaStageLadder stages={stages()} accent={accents.tea[0]}/>
        );

        expect(screen.getByText("STEEP 03")).toBeTruthy();
        expect(screen.getAllByText("FILL · 90 ml target · 92°C")).toHaveLength(2);
        expect(screen.getByText("FILL · 90 ml target · 80°C")).toBeTruthy();
        for (const duration of ["0:45", "1:00", "1:30"]) {
            expect(screen.getByText(`STEEP · ${duration} planned · elapsed unknown`)).toBeTruthy();
        }
        expect(screen.getByLabelText(/Tea stage 3.*Not observed.*Release \+ drain/)).toBeTruthy();
        expect(screen.queryByText(/0 ml measured|40 ml release water/)).toBeNull();
        expect(screen.getAllByText("RELEASE + DRAIN · drain duration unknown"))
            .toHaveLength(3);
    });

    it("caps elapsed steep display at plan without declaring completion", async () => {
        const observed = stages();
        observed[0].fill = {status: "complete", measuredMl: 89.5};
        observed[0].steep = {status: "observing", elapsedSeconds: 130};
        await renderWithProviders(
            <TeaStageLadder stages={observed} accent={accents.tea[0]}/>
        );

        expect(screen.getByText("FILL · 90 ml target · 92°C · 89.5 ml measured")).toBeTruthy();
        expect(screen.getByText("STEEP · 0:45 planned · 2:10 elapsed")).toBeTruthy();
        expect(screen.getByText("Planned time reached; completion not observed")).toBeTruthy();
        expect(screen.getByLabelText(/Tea stage 3.*Steep: Not observed/)).toBeTruthy();
    });

    it("selects a stage accessibly and shows only evidence-backed combined timing", async () => {
        const onSelectStage = jest.fn();
        const observed = stages();
        observed[1].fill.measuredMl = 89.7;
        observed[1].steep = {status: "complete", elapsedSeconds: 60};
        observed[1].ending = {
            boundary: "unknown", status: "complete", elapsedSeconds: 30,
            releaseWaterMl: 37.8, drainSeconds: null
        };
        await renderWithProviders(
            <TeaStageLadder stages={observed} accent={accents.tea[0]}
                            onSelectStage={onSelectStage}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /Tea stage 2/}));
        expect(onSelectStage).toHaveBeenCalledWith(1);
        expect(screen.getByText("RELEASE + DRAIN · 0:30 elapsed · 37.8 ml release water · drain duration unknown"))
            .toBeTruthy();
    });

    it("keeps phase labels available in a narrow large-text viewport", async () => {
        const window = {width: 320, height: 568, scale: 2, fontScale: 2};
        Dimensions.set({window, screen: window});
        await renderWithProviders(
            <View style={{width: 240}}>
                <TeaStageLadder stages={stages()} accent={accents.tea[0]}/>
            </View>
        );

        expect(screen.getAllByText("FILL · 90 ml target · 92°C")).toHaveLength(2);
        expect(screen.getByText("STEEP · 1:00 planned · elapsed unknown")).toBeTruthy();
        expect(screen.getAllByText("RELEASE + DRAIN · drain duration unknown")).toHaveLength(3);
    });
});
