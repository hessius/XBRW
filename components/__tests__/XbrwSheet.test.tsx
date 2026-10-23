import React from "react";
import {StyleSheet, Text} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";

import XbrwSheet, {EXIT_GRACE, insetSnapPoint} from "@/components/XbrwSheet";
import {SCREEN_PADDING} from "@/constants/layout";
import {useTakesBottomInset} from "@/hooks/useBottomInset";
import {renderWithProviders, TEST_INSETS, THREE_BUTTON_METRICS} from "@/test-utils/render";

/** Stands in for the live brew bar, which pads itself by the inset. */
function TakesInset() {
    useTakesBottomInset();
    return null;
}

function framePaddings(): number[] {
    // Tamagui draws a second, empty copy of the frame, so every copy is
    // checked rather than whichever comes first.
    const frames = screen.getAllByTestId("sheet-frame", {includeHiddenElements: true});
    expect(frames.length).toBeGreaterThan(0);
    return frames.map((frame) => StyleSheet.flatten(frame.props.style).paddingBottom);
}

function open(onOpenChange = jest.fn()) {
    return renderWithProviders(
        <XbrwSheet open onOpenChange={onOpenChange} title="ABOUT">
            <Text>the body</Text>
        </XbrwSheet>
    );
}

describe("XbrwSheet", () => {
    it("hides a covered sheet from accessibility without discarding its contents", async () => {
        const view = await renderWithProviders(
            <XbrwSheet open covered onOpenChange={jest.fn()} title="UNDERNEATH">
                <Text>kept underneath</Text>
            </XbrwSheet>
        );
        expect(screen.queryByText("kept underneath")).toBeNull();
        expect(screen.getByText("kept underneath", {includeHiddenElements: true})).toBeTruthy();
        await view.rerender(
            <XbrwSheet open onOpenChange={jest.fn()} title="UNDERNEATH">
                <Text>kept underneath</Text>
            </XbrwSheet>
        );
        expect(screen.getByText("kept underneath")).toBeTruthy();
    });

    it("shows its title and its children", async () => {
        await open();

        expect(screen.getByText("ABOUT")).toBeTruthy();
        expect(screen.getByText("the body")).toBeTruthy();
    });

    it("passes the sheet height to flex content", async () => {
        await open();

        expect(screen.getByLabelText("ABOUT").props.style)
            .toEqual(expect.objectContaining({flex: 1}));
    });

    it("pads its bottom by the inset so full content clears the navigation bar", async () => {
        // Tamagui draws a second, empty copy of the frame, so every copy is
        // checked rather than whichever comes first.
        await open();
        const frames = screen.getAllByTestId("sheet-frame", {includeHiddenElements: true});

        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) {
            expect(StyleSheet.flatten(frame.props.style).paddingBottom)
                .toBe(SCREEN_PADDING + TEST_INSETS.bottom);
        }
    });

    it("ends above a three-button navigation bar", async () => {
        // The recipe sheet's last row, DELETE, sat under the bar until the
        // frame padded by its full 48 points.
        await renderWithProviders(
            <SafeAreaProvider initialMetrics={THREE_BUTTON_METRICS}>
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            </SafeAreaProvider>
        );

        for (const padding of framePaddings()) {
            expect(padding).toBe(SCREEN_PADDING + 48);
        }
    });

    it("leaves the inset to the live brew bar while it is drawn", async () => {
        // The bar sits beside the navigator and pads itself, so the screen
        // the sheet is opened in already ends above the navigation bar.
        await renderWithProviders(
            <SafeAreaProvider initialMetrics={THREE_BUTTON_METRICS}>
                <TakesInset/>
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            </SafeAreaProvider>
        );

        for (const padding of framePaddings()) {
            expect(padding).toBe(SCREEN_PADDING);
        }
    });

    it("grows by the inset so the content keeps the room it was tuned for", () => {
        // 48 points of a 915 point screen is a little over 5 percent.
        expect(insetSnapPoint(60, 48, 915)).toBeCloseTo(60 + 4800 / 915, 5);
        // No inset, no growth.
        expect(insetSnapPoint(60, 0, 915)).toBe(60);
        // Growth stops short of the header the sheet was opened from...
        expect(insetSnapPoint(92, 48, 915)).toBe(95);
        // ...but never shrinks a sheet that asked for more.
        expect(insetSnapPoint(97, 48, 915)).toBe(97);
    });

    it("can be dismissed without the platform gesture", async () => {
        // The only other way out is a backdrop tap or a swipe, neither of which
        // a screen reader announces as a control.
        const onOpenChange = jest.fn();
        await open(onOpenChange);

        await fireEvent.press(screen.getByLabelText("Close"));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("leaves nothing in the tree while closed", async () => {
        // Tamagui alone does not do this: with `open={false}` and no guard of
        // our own it still mounts the sheet frame off screen.
        await renderWithProviders(
            <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                <Text>the body</Text>
            </XbrwSheet>
        );

        // The safe-area provider the test wrapper supplies is the only thing
        // left; the sheet contributes nothing of its own.
        const tree = screen.toJSON();
        expect(Array.isArray(tree) ? tree : [tree]).toHaveLength(1);
        expect(screen.queryByText("the body", {includeHiddenElements: true})).toBeNull();
    });

    describe("prewarming", () => {
        it("is off unless asked for", async () => {
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.queryByTestId("sheet-prewarm", {includeHiddenElements: true}))
                .toBeNull();
        });

        it("builds the body while the sheet is still closed", async () => {
            // A sheet's contents are built on the way in, because Tamagui
            // renders nothing for a closed dialog. For a body of any size that
            // is a visible hitch on the frame it opens, so the measuring is
            // done in advance instead.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.getByText("the body", {includeHiddenElements: true}))
                .toBeTruthy();
        });

        it("keeps the warm copy out of reach", async () => {
            // It is the unmounted sheet's guarantee that has to survive: a
            // sheet nobody has opened must not be readable or touchable. Zero
            // height and zero opacity are not enough on their own -- a screen
            // reader ignores both.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            const warm = screen.getByTestId("sheet-prewarm", {includeHiddenElements: true});
            expect(warm.props.pointerEvents).toBe("none");
            expect(warm.props.accessibilityElementsHidden).toBe(true);
            expect(warm.props.importantForAccessibility).toBe("no-hide-descendants");
            expect(warm.props.style).toEqual(
                expect.objectContaining({height: 0, opacity: 0, position: "absolute"})
            );
        });

        it("takes up no room on the screen it is warming inside", async () => {
            // It is laid out at the real width, so the text measures the way it
            // will really measure -- that measurement is the whole point -- and
            // then clipped away.
            await renderWithProviders(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            const style = screen.getByTestId("sheet-prewarm", {includeHiddenElements: true})
                .props.style as {height: number; overflow: string};
            expect(style.height).toBe(0);
            expect(style.overflow).toBe("hidden");
        });

        it("gives way to the real sheet rather than doubling it", async () => {
            await renderWithProviders(
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT" prewarm>
                    <Text>the body</Text>
                </XbrwSheet>
            );

            expect(screen.queryByTestId("sheet-prewarm", {includeHiddenElements: true}))
                .toBeNull();
            expect(screen.getAllByText("the body")).toHaveLength(1);
        });
    });

    it("stays in the tree long enough to animate away", async () => {
        // Unmounting on the frame the sheet is dismissed removes the animation
        // along with the sheet, so it disappeared rather than left.
        jest.useFakeTimers();
        try {
            const {rerender} = await open();
            expect(screen.getByLabelText("ABOUT").props.accessibilityViewIsModal).toBe(true);

            await rerender(
                <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            );
            expect(screen.queryByText("the body")).toBeTruthy();
            expect(screen.getByLabelText("ABOUT", {includeHiddenElements: true}).props.accessibilityViewIsModal)
                .toBe(false);

            await act(async () => {
                jest.advanceTimersByTime(EXIT_GRACE);
            });
            expect(screen.queryByText("the body")).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });
});

/**
 * The failure that made "Delete all recipes" do nothing on the settings screen.
 *
 * `open`, the mounted flag and the shown flag used to be three separate
 * `useState`s, reconciled during render by a one-shot latch that only fired on
 * a *change* of `open`. A re-render interleaving between the latch and its
 * effects could commit the latch without the mount, and since the latch never
 * fires twice for the same value the sheet stayed out of the tree permanently.
 *
 * On device it looked exactly like a dead button: the press fired, the parent's
 * state flipped to true, and nothing was ever drawn. The evidence is a device
 * log showing the impossible state directly — `open=true rendered=false
 * shown=true` — where the old code's `if (!rendered) return null` discarded a
 * sheet that had already been told to show itself.
 *
 * Honest caveat: these two tests pass against the old implementation as well.
 * Jest's renderer does not interleave renders the way the device did, so they
 * document the invariant rather than reproduce the race. What actually makes
 * the bug unrepresentable is `rendered = phase.rendered || open` plus bundling
 * the three flags into one state, and that was verified from the device log.
 */
describe("XbrwSheet under an unstable parent", () => {
    it("opens even when a stale exit timer lands after it has reopened", async () => {
        const {rerender} = await renderWithProviders(
            <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                <Text>the body</Text>
            </XbrwSheet>
        );
        expect(screen.queryByText("the body")).toBeNull();

        // Reopened before the exit grace from the initial closed state expires,
        // so the timer scheduled while it was closed fires afterwards.
        await act(async () => {
            rerender(
                <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                    <Text>the body</Text>
                </XbrwSheet>
            );
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, EXIT_GRACE + 50));
        });

        expect(screen.getByText("the body")).toBeTruthy();
    });

    it("stays in the tree while a parent re-renders repeatedly during the open", async () => {
        const {rerender} = await renderWithProviders(
            <XbrwSheet open={false} onOpenChange={jest.fn()} title="ABOUT">
                <Text>the body</Text>
            </XbrwSheet>
        );

        // A neighbour re-rendering on its own schedule, as MachineSection does
        // on the settings screen, re-renders the sheet with an unchanged `open`.
        for (let i = 0; i < 5; i += 1) {
            await act(async () => {
                rerender(
                    <XbrwSheet open onOpenChange={jest.fn()} title="ABOUT">
                        <Text>the body</Text>
                    </XbrwSheet>
                );
            });
        }

        expect(screen.getByText("the body")).toBeTruthy();
    });
});
