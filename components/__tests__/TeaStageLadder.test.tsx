import React from "react";
import {screen, within} from "@testing-library/react-native";

import TeaStageLadder, {type TeaStageView} from "@/components/TeaStageLadder";
import {accents} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

// Offline previews only: these statuses and boundaries are invented, not BLE mappings.
function syntheticStages(): TeaStageView[] {
    return [45, 60, 90].map((steepSeconds, index) => ({
        fillMl: 90,
        temperatureC: index === 2 ? 80 : 92,
        steepSeconds,
        fill: {status: "not-observed"},
        steep: {status: "not-observed"},
        ending: {boundary: "unknown", combined: {status: "not-observed"}}
    }));
}

describe("TeaStageLadder — explicitly synthetic offline previews", () => {
    it("keeps all three planned fills, temperatures and steep times visible without observations", async () => {
        await renderWithProviders(<TeaStageLadder stages={syntheticStages()} accent={accents.tea[0]}/>);

        expect(screen.getByText("STAGE 03")).toBeTruthy();
        expect(screen.getAllByText("FILL · 90 ml target · 92°C")).toHaveLength(2);
        expect(screen.getByText("FILL · 90 ml target · 80°C")).toBeTruthy();
        for (const duration of ["0:45", "1:00", "1:30"]) {
            expect(screen.getByText(`STEEP · ${duration} planned · elapsed unknown`)).toBeTruthy();
        }
        const third = screen.getByLabelText(/Tea stage 3.*Fill: Not observed.*Steep: Not observed.*Release \+ drain: Not observed/);
        expect(within(third).getAllByText("Not observed")).toHaveLength(3);
        expect(screen.getByLabelText(/Tea stage 3.*90 ml target.*80°C.*1:30 planned.*elapsed unknown/)).toBeTruthy();
        expect(screen.queryByText(/0 ml measured/)).toBeNull();
        expect(screen.getAllByText("RELEASE + DRAIN · duration unknown")).toHaveLength(3);
    });

    it("caps a synthetic steep display at its plan without completing it or later stages", async () => {
        const stages = syntheticStages();
        stages[0].fill = {status: "complete", measuredMl: 89.5};
        stages[0].steep = {status: "observing", elapsedSeconds: 130};
        await renderWithProviders(<TeaStageLadder stages={stages} accent={accents.tea[0]}/>);

        expect(screen.getByText("FILL · 90 ml target · 92°C · 89.5 ml measured")).toBeTruthy();
        expect(screen.getByText("STEEP · 0:45 planned · ≥0:45 elapsed")).toBeTruthy();
        expect(screen.getByText("Planned time reached; completion not observed")).toBeTruthy();
        expect(screen.getByLabelText(/Tea stage 1.*Fill: Observed complete.*Steep: Observing/)).toBeTruthy();
        expect(screen.getByLabelText(/Tea stage 3.*Steep: Not observed/)).toBeTruthy();
    });

    it("distinguishes an explicitly interrupted combined ending from completion", async () => {
        const stages = syntheticStages();
        stages[1].fill = {status: "complete"};
        stages[1].steep = {status: "complete", elapsedSeconds: 60};
        stages[1].ending = {boundary: "unknown", combined: {status: "interrupted"}};
        await renderWithProviders(<TeaStageLadder stages={stages} accent={accents.tea[0]}/>);

        const second = screen.getByLabelText(/Tea stage 2.*Release \+ drain: Interrupted/);
        expect(within(second).getByText("Interrupted")).toBeTruthy();
        expect(within(second).getByText("RELEASE + DRAIN · duration unknown")).toBeTruthy();
        expect(within(second).queryByText(/0:00 elapsed/)).toBeNull();
    });

    it("separates release and drain only with an explicit synthetic boundary and preserves measured zero", async () => {
        const stages = syntheticStages();
        stages[0].ending = {
            boundary: "known",
            release: {status: "complete", elapsedSeconds: 12},
            drain: {status: "observing", elapsedSeconds: 0}
        };
        await renderWithProviders(<TeaStageLadder stages={stages} accent={accents.tea[0]}/>);

        expect(screen.getByText("RELEASE · 0:12 elapsed")).toBeTruthy();
        expect(screen.getByText("DRAIN · 0:00 elapsed")).toBeTruthy();
        expect(screen.getByLabelText(/Tea stage 1.*Release: Observed complete.*Drain: Observing/)).toBeTruthy();
    });
});
