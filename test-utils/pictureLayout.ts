import {fireEvent, screen} from "@testing-library/react-native";

export async function pictureLayout(id: string, width: number, height: number, x = 0, y = 0) {
    await fireEvent(screen.getByTestId(id), "layout", {nativeEvent: {layout: {x, y, width, height}}});
}

export async function measureTilePicture(available = 170, content = 70) {
    await pictureLayout("recipe-tile-metadata-width", available, 20);
    await fireEvent(screen.getByTestId("recipe-tile-metadata-measure", {includeHiddenElements: true}),
                    "contentSizeChange", content, 15);
}

export async function measureCardPicture() {
    await pictureLayout("recipe-card-surface", 390, 116);
    await pictureLayout("recipe-card-title-row", 358, 40, 16, 16);
    await pictureLayout("recipe-card-badges", 54, 15, 260, 0);
    await pictureLayout("recipe-card-bottom-row", 358, 34, 16, 66);
    await pictureLayout("recipe-card-figures", 190, 34);
    await fireEvent(screen.getByTestId("recipe-card-prose-measure", {includeHiddenElements: true}),
                    "contentSizeChange", 120, 25);
}

export async function measureReadyPicture() {
    await pictureLayout("ready-to-brew-open", 300, 60);
    await fireEvent(screen.getByTestId("ready-to-brew-text-measure", {includeHiddenElements: true}),
                    "contentSizeChange", 220, 50);
}
