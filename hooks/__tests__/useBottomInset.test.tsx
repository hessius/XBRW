import React from "react";
import {Platform} from "react-native";
import {renderHook} from "@testing-library/react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";

import {
    pinnedBarPadding, useBottomInset, useScrollEndPadding, useTakesBottomInset
} from "@/hooks/useBottomInset";
import {THREE_BUTTON_METRICS} from "@/test-utils/render";

function threeButton({children}: {children: React.ReactNode}) {
    return <SafeAreaProvider initialMetrics={THREE_BUTTON_METRICS}>{children}</SafeAreaProvider>;
}

describe("useBottomInset", () => {
    it("is the bottom inset while nothing is drawn under the screen", async () => {
        const {result} = await renderHook(() => useBottomInset(), {wrapper: threeButton});
        expect(result.current).toBe(48);
    });

    it("is zero while the live brew bar takes the inset, and returns after", async () => {
        const {result} = await renderHook(() => useBottomInset(), {wrapper: threeButton});
        const bar = await renderHook(() => useTakesBottomInset());

        expect(result.current).toBe(0);

        await bar.unmount();
        expect(result.current).toBe(48);
    });
});

describe("useScrollEndPadding", () => {
    it("clears a three-button bar", async () => {
        const {result} = await renderHook(() => useScrollEndPadding(48), {wrapper: threeButton});
        expect(result.current).toBe(48 + 24);
    });
});

describe("pinnedBarPadding", () => {
    it("sinks into the home indicator on iOS only", () => {
        expect(pinnedBarPadding(48, 5)).toBe(Platform.OS === "ios" ? 43 : 48);
        expect(pinnedBarPadding(0, 5)).toBe(0);
    });
});
