import React from "react";
import {Pressable, Text} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import ViewShot from "react-native-view-shot";
import * as viewShotModule from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import {useBrewExport, type BrewExportSource} from "@/hooks/useBrewExport";
import type {StoredBrew} from "@/library/BrewDatabase";
import {notify} from "@/components/XbrwToast";
import {Providers, renderWithProviders as render} from "@/test-utils/render";
import {AppearanceScope, useAppearance} from "@/hooks/useAppearance";
import {toExportJson} from "@/library/brew/brewExport";
import BrewSummary from "@/components/BrewSummary";
import {resolveAppearance} from "@/constants/colors";
import {Text as ThemeText} from "tamagui";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const {mockCapture} = viewShotModule as unknown as {mockCapture: jest.Mock};

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

const source = (): BrewExportSource => ({
    record,
    samples: [{at: 0, water: 0, cup: 0, pour: 1}]
});

// A harness so the hook's ViewShot ref is wired to the (mocked) ViewShot,
// which is what makes `capture()` resolve to a URL. Defined at module scope.
function Harness({src, prepare, summary = false}: {
    src: () => BrewExportSource | null;
    prepare?: () => Promise<void>;
    summary?: boolean;
}) {
    const {shotRef, shareImage, shareData, busy, captureChoice} = useBrewExport(src, prepare);
    const appearance = useAppearance();
    const [mounted, setMounted] = React.useState(true);
    return (
        <>
            {mounted && <ViewShot ref={shotRef}>
                <AppearanceScope choice={captureChoice ?? appearance.choice}>
                    <ThemeText testID="capture-theme" color="$color">Theme</ThemeText>
                    {summary ? <BrewSummary
                        recipeName={record.recipeName} accent={record.accent}
                        hasStream={false} samples={[]} stages={[]} width={390}
                        plannedSeconds={120} water={250} cup={244} seconds={126}
                        activeIndex={null} stageWater={[]} stalls={[]}
                        stagesUnavailable
                    /> : <Text>content</Text>}
                </AppearanceScope>
            </ViewShot>}
            <Pressable accessibilityRole="button" accessibilityLabel="image"
                       onPress={() => void shareImage()} />
            <Pressable accessibilityRole="button" accessibilityLabel="data"
                       onPress={() => void shareData()} />
            <Pressable accessibilityLabel="double image"
                       onPress={() => { void shareImage(); void shareImage(); }}/>
            <Pressable accessibilityLabel="double data"
                       onPress={() => { void shareData(); void shareData(); }}/>
            <Text testID="busy">{busy ? "busy" : "idle"}</Text>
            <Text testID="choice">{JSON.stringify(captureChoice)}</Text>
            <Text testID="current">{JSON.stringify(appearance.choice)}</Text>
            <Pressable accessibilityLabel="missing ref" onPress={() => setMounted(false)}/>
            <Pressable accessibilityLabel="restore ref" onPress={() => setMounted(true)}/>
        </>
    );
}

describe("useBrewExport", () => {
    beforeEach(() => {
        mockCapture.mockReset().mockResolvedValue("file:///mock/brew.png");
        (notify as jest.Mock).mockClear();
        (Sharing.shareAsync as jest.Mock).mockClear();
        (Sharing.isAvailableAsync as jest.Mock).mockReset();
        (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
        (FSFile as unknown as jest.Mock).mockClear();
    });

    it("captures the shot and shares it as a PNG the photo library accepts", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("image"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock/brew.png",
                expect.objectContaining({mimeType: "image/png", UTI: "public.png"})
            )
        );
    });

    it("names the shared image after the brew", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("image"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({dialogTitle: "ethiopia-guji-1970-01-01.png"})
            )
        );
    });

    it("writes the brew as JSON and shares the file", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("data"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock-cache/ethiopia-guji-1970-01-01.json",
                expect.objectContaining({mimeType: "application/json"})
            )
        );
        const instance = (FSFile as unknown as jest.Mock).mock
            .instances[0] as {write: jest.Mock};
        expect(instance.write).toHaveBeenCalled();
        expect(instance.write).toHaveBeenCalledWith(toExportJson(record, source().samples));
    });

    it("does nothing when there is nothing to export", async () => {
        const {getByLabelText} = await render(<Harness src={() => null} />);
        await fireEvent.press(getByLabelText("image"));
        await fireEvent.press(getByLabelText("data"));
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it("ignores a second image press while the first is still in flight", async () => {
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>((r) => { releaseFirst = r; })
        );
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("image"));
        await fireEvent.press(getByLabelText("image"));
        await waitFor(() => expect(releaseFirst).toBeDefined());
        await act(() => releaseFirst(true));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });

    it("freezes before prepare, keeps independent guards, and releases to the latest choice", async () => {
        const prepare = deferred<void>();
        const light = {theme: "light", recipeColours: "themed"} as const;
        const blue = {theme: "blue", recipeColours: "original"} as const;
        const {rerender} = await render(
            <Providers appearance={light}><Harness src={source} prepare={() => prepare.promise} summary/></Providers>
        );
        const themedText = screen.getByTestId("capture-theme").props.style;
        await fireEvent.press(screen.getByLabelText("image"));
        expect(screen.getByTestId("choice")).toHaveTextContent(JSON.stringify(light));
        await rerender(
            <Providers appearance={blue}><Harness src={source} prepare={() => prepare.promise} summary/></Providers>
        );
        await fireEvent.press(screen.getByLabelText("image"));
        await fireEvent.press(screen.getByLabelText("data"));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(screen.getByTestId("busy")).toHaveTextContent("busy");
        expect(screen.getByTestId("current")).toHaveTextContent(JSON.stringify(blue));
        expect(screen.getByTestId("choice")).toHaveTextContent(JSON.stringify(light));
        expect(screen.getByTestId("brew-capture")).toHaveStyle({
            backgroundColor: resolveAppearance(light).palette.base
        });
        expect(screen.getByTestId("capture-theme").props.style).toEqual(themedText);
        await act(() => prepare.resolve());
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("idle"));
        expect(screen.getByTestId("choice")).toHaveTextContent("null");
        expect(screen.getByTestId("brew-capture")).toHaveStyle({
            backgroundColor: resolveAppearance(blue).palette.base
        });
        expect(screen.getByTestId("capture-theme").props.style).not.toEqual(themedText);
        expect(mockCapture).toHaveBeenCalledTimes(1);
        await fireEvent.press(screen.getByLabelText("image"));
        await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("idle"));
    });

    it.each(["prepare", "capture", "empty capture", "missing ref"] as const)(
        "reports %s failure, unfreezes, and permits a fresh attempt", async (failure) => {
            const prepare = jest.fn(async () => {});
            if (failure === "prepare") prepare.mockRejectedValueOnce(new Error("prepare failed"));
            if (failure === "capture") mockCapture.mockRejectedValueOnce(new Error("capture failed"));
            if (failure === "empty capture") mockCapture.mockResolvedValueOnce(undefined);
            await render(<Harness src={source} prepare={prepare}/>);
            if (failure === "missing ref") await fireEvent.press(screen.getByLabelText("missing ref"));
            await fireEvent.press(screen.getByLabelText("image"));
            await waitFor(() => expect(notify).toHaveBeenCalledWith({
                tone: "error", message: "Could not create this image. Please try again."
            }));
            expect(Sharing.shareAsync).not.toHaveBeenCalled();
            expect(screen.getByTestId("choice")).toHaveTextContent("null");
            expect(screen.getByTestId("busy")).toHaveTextContent("idle");
            if (failure === "missing ref") await fireEvent.press(screen.getByLabelText("restore ref"));
            await fireEvent.press(screen.getByLabelText("image"));
            await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        }
    );

    it("guards image and data double taps synchronously before React commits", async () => {
        const capture = deferred<string>();
        const dataShare = deferred<void>();
        mockCapture.mockReturnValueOnce(capture.promise);
        (Sharing.shareAsync as jest.Mock).mockReturnValueOnce(dataShare.promise);
        await render(<Harness src={source}/>);
        await fireEvent.press(screen.getByLabelText("double image"));
        await fireEvent.press(screen.getByLabelText("double data"));
        await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        await act(() => capture.resolve("file:///fresh.png"));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
        expect(screen.getByTestId("busy")).toHaveTextContent("busy");
        expect(screen.getByTestId("choice")).toHaveTextContent("null");
        await act(() => dataShare.resolve());
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("idle"));
    });

    it.each(["cancelled", "unavailable"])("unfreezes after sharing is %s without a capture error", async (failure) => {
        if (failure === "cancelled") (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error("cancelled"));
        else (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
        await render(<Harness src={source}/>);
        await fireEvent.press(screen.getByLabelText("image"));
        await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("idle"));
        expect(screen.getByTestId("choice")).toHaveTextContent("null");
        expect(notify).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("image"));
        await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("idle"));
    });

    it("waits two paints without prepare and preserves the native capture receiver", async () => {
        const frames: FrameRequestCallback[] = [];
        const raf = jest.spyOn(global, "requestAnimationFrame").mockImplementation((frame) => {
            frames.push(frame);
            return frames.length;
        });
        mockCapture.mockImplementation(function(this: {capture: unknown}) {
            expect(this.capture).toBe(mockCapture);
            return Promise.resolve("file:///mock/brew.png");
        });
        try {
            await render(<Harness src={source}/>);
            frames.splice(0);
            await fireEvent.press(screen.getByLabelText("image"));
            expect(mockCapture).not.toHaveBeenCalled();
            await act(() => frames.shift()!(0));
            expect(mockCapture).not.toHaveBeenCalled();
            await act(() => frames.shift()!(1));
            await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
            expect(notify).not.toHaveBeenCalled();
        } finally {
            raf.mockRestore();
        }
    });

    it("ignores a second data press while the first is still in flight", async () => {
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>((r) => { releaseFirst = r; })
        );
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("data"));
        await fireEvent.press(getByLabelText("data"));
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
});

describe("useBrewExport's prepare step", () => {
    it("finishes preparing before it photographs the screen", async () => {
        // The order is the entire point: the record screen clears its selected
        // stage in `prepare`, and a capture taken first would bake the
        // highlight into a picture nobody can tap. Asserting only that both ran
        // would pass with them in either order.
        const order: string[] = [];
        const prepare = async () => { order.push("prepare"); };
        (Sharing.shareAsync as jest.Mock).mockImplementation(async () => {
            order.push("share");
        });
        // `mockCapture` exists only on the shared mock in jest.setup.js, not on
        // the real module, so it has to be reached through a cast.
        const {mockCapture} = viewShotModule as unknown as
            {mockCapture: jest.Mock<Promise<string>, []>};
        mockCapture.mockImplementation(async () => {
            order.push("capture");
            return "file:///mock/brew.png";
        });

        const {getByLabelText} = await render(
            <Harness src={source} prepare={prepare} />
        );
        await fireEvent.press(getByLabelText("image"));
        await waitFor(() => expect(order).toEqual(["prepare", "capture", "share"]));
        mockCapture.mockReset();
        mockCapture.mockResolvedValue("file:///mock/brew.png");
        (Sharing.shareAsync as jest.Mock).mockReset();
    });

    it("still exports for a caller that has nothing to prepare", async () => {
        const {getByLabelText} = await render(<Harness src={source} />);
        await fireEvent.press(getByLabelText("image"));
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    });
});
