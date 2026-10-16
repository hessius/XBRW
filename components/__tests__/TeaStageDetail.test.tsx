import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import TeaStageDetail from "@/components/TeaStageDetail";
import {accents} from "@/constants/colors";
import type {TeaStageView} from "@/library/brew/teaCycle";
import {renderWithProviders} from "@/test-utils/render";

const stage: TeaStageView = {
    index: 0,
    fillMl: 90,
    temperatureC: 92,
    steepSeconds: 45,
    fill: {status: "complete", measuredMl: 89.7},
    steep: {status: "complete", elapsedSeconds: 44.627},
    ending: {
        boundary: "unknown", status: "complete", elapsedSeconds: 27.4,
        releaseWaterMl: 42.9, drainSeconds: null
    }
};

describe("TeaStageDetail", () => {
    it("keeps fill, steep and combined release/drain evidence separate", async () => {
        const onClose = jest.fn();
        await renderWithProviders(
            <TeaStageDetail stage={stage} accent={accents.tea[0]} onClose={onClose}/>
        );

        expect(screen.getByText("Target")).toBeTruthy();
        expect(screen.getByText("90 ml · 92°C")).toBeTruthy();
        expect(screen.getByText("Measured fill")).toBeTruthy();
        expect(screen.getByText("89.7 ml")).toBeTruthy();
        expect(screen.getByText("Planned")).toBeTruthy();
        expect(screen.getByText("0:45")).toBeTruthy();
        expect(screen.getByText("Release water")).toBeTruthy();
        expect(screen.getByText("42.9 ml")).toBeTruthy();
        expect(screen.getByText("Drain duration")).toBeTruthy();
        expect(screen.getByText("Unknown")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("tea-stage-detail-close"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not turn missing or interrupted boundaries into zero readings", async () => {
        await renderWithProviders(
            <TeaStageDetail
                stage={{
                    ...stage,
                    fill: {status: "not-observed"},
                    steep: {status: "interrupted"},
                    ending: {boundary: "unknown", status: "interrupted", drainSeconds: null}
                }}
                accent={accents.tea[0]}
                onClose={() => {}}
            />
        );
        expect(screen.getAllByText("Not observed")).toHaveLength(2);
        expect(screen.getAllByText("Interrupted · Elapsed unknown")).toHaveLength(2);
        expect(screen.queryByText("0.0 ml")).toBeNull();
        expect(screen.getByText("Drain duration")).toBeTruthy();
    });
});
