import React from "react";
import {Text} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";
import ShelfPhotoMark, {withShelfPhotos} from "@/components/ShelfPhotoMark";
import {renderWithProviders} from "@/test-utils/render";
import ShelfTile from "@/components/ShelfTile";

const fallback = <Text testID="fallback-mark">mark</Text>;
const members = [{uuid: "one", accent: "red", imageURL: "https://a.example/1.jpg"},
    {uuid: "two", accent: "blue"}];
const photos = () => screen.queryAllByTestId("shelf-photo", {includeHiddenElements: true});

it("keeps a one-photo multi-member shelf a four-cell cover", async () => {
    await renderWithProviders(<ShelfPhotoMark members={members} count={9} fallback={fallback}/>);
    expect(photos()).toHaveLength(1);
    expect(screen.getAllByTestId("shelf-cover-cell", {includeHiddenElements: true})).toHaveLength(4);
    expect(photos()[0].props.resizeMode).toBe("contain");
    expect(photos()[0].props.style.width).toBe(21);
});
it("uses the full circle only for one actual member", async () => {
    await renderWithProviders(<ShelfPhotoMark members={members.slice(0, 1)} count={1} fallback={fallback}/>);
    expect(photos()[0].props.style.width).toBe(44);
});
it("holds cell geometry on failure and retries a changed URL", async () => {
    const view = await renderWithProviders(<ShelfPhotoMark members={members} count={2} fallback={fallback}/>);
    await fireEvent(photos()[0], "error");
    expect(photos()).toHaveLength(0);
    expect(screen.getAllByTestId("shelf-cover-cell", {includeHiddenElements: true})).toHaveLength(4);
    await view.rerender(<ShelfPhotoMark members={[{...members[0], imageURL: "https://new.example/photo"}]}
                                      count={2} fallback={fallback}/>);
    expect(photos()).toHaveLength(1);
});
it("falls back without photos and strips only cover members when off", async () => {
    await renderWithProviders(<ShelfPhotoMark members={[]} count={4} fallback={fallback}/>);
    expect(screen.getByTestId("fallback-mark")).toBeTruthy();
    const marks = {tea: {accents: ["red"], coverMembers: members}};
    expect(withShelfPhotos(marks, true)).toEqual(marks);
    expect(withShelfPhotos(marks, false)).toEqual({tea: {accents: ["red"]}});
});

it.each([false, true])("never replaces an automatic glyph, inverted %s, with member photos", async inverted => {
    await renderWithProviders(<ShelfTile shelf={{id: "tea", label: "TEA", kind: "auto", count: 4}}
        members={{accents: ["red"], coverMembers: members}} inverted={inverted} onPress={jest.fn()}/>);
    expect(screen.getByTestId(inverted ? "shelf-mark-glyph-inverted" : "shelf-mark-glyph")).toBeTruthy();
    expect(photos()).toHaveLength(0);
});

const fourPhotos = Array.from({length: 4}, (_, index) => ({
    uuid: `recipe-${index}`, accent: members[0].accent, imageURL: `https://coffee.example/${index}.jpg`
}));

it.each([false, true])("restores the automatic glyph after a photo fails, inverted %s", async inverted => {
    await renderWithProviders(<ShelfTile shelf={{id: "pods", label: "PODS", kind: "auto", count: 6}}
        members={{accents: ["red"], coverMembers: fourPhotos}} inverted={inverted} onPress={jest.fn()}/>);
    await fireEvent(photos()[0], "error");
    expect(photos()).toHaveLength(0);
    expect(screen.getByTestId(inverted ? "shelf-mark-glyph-inverted" : "shelf-mark-glyph")).toBeTruthy();
});

it("retries a replacement automatic-cover URL after falling back", async () => {
    const shelf = {id: "pods", label: "PODS", kind: "auto" as const, count: 6};
    const view = await renderWithProviders(<ShelfTile shelf={shelf}
        members={{accents: ["red"], coverMembers: fourPhotos}} onPress={jest.fn()}/>);
    await fireEvent(photos()[0], "error");
    expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
    const replaced = fourPhotos.map((member, index) => index === 0
        ? {...member, imageURL: "https://coffee.example/replacement.jpg"} : member);
    await view.rerender(<ShelfTile shelf={shelf}
        members={{accents: ["red"], coverMembers: replaced}} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(4);
    expect(photos()[0].props.source.uri).toBe(replaced[0].imageURL);
});

it("restores the automatic glyph if the photo shared by four recipes fails", async () => {
    const copies = fourPhotos.map(member => ({...member, imageURL: fourPhotos[0].imageURL}));
    await renderWithProviders(<ShelfTile shelf={{id: "pods", label: "PODS", kind: "auto", count: 6}}
        members={{accents: ["red"], coverMembers: copies}} onPress={jest.fn()}/>);
    await fireEvent(photos()[0], "error");
    expect(photos()).toHaveLength(0);
    expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
});

it.each(["xbloom", "favourites", "pods", "mostBrewed", "recentlyAdded"])(
    "uses four distinct coffee photos for the approved %s auto shelf", async id => {
        await renderWithProviders(<ShelfTile shelf={{id, label: id, kind: "auto", count: 12}}
            members={{accents: ["red"], coverMembers: fourPhotos}} onPress={jest.fn()}/>);
        expect(photos()).toHaveLength(4);
        expect(photos().every(photo => photo.props.style.width === 21)).toBe(true);
    }
);

it.each(["xbloom", "favourites", "pods", "mostBrewed", "recentlyAdded"])(
    "fills the %s grid with four photographed recipes even when their photo is shared", async id => {
        const copies = fourPhotos.map(member => ({...member, imageURL: fourPhotos[0].imageURL}));
        await renderWithProviders(<ShelfTile shelf={{id, label: id, kind: "auto", count: 6}}
            members={{accents: ["red"], coverMembers: copies}} onPress={jest.fn()}/>);
        expect(photos()).toHaveLength(4);
        expect(photos().every(photo => photo.props.source.uri === fourPhotos[0].imageURL)).toBe(true);
    }
);

it.each([false, true])("keeps eligible cover inversion and preference-off glyph fallback (%s)", async inverted => {
    const mark = {accents: ["red"], coverMembers: fourPhotos};
    const shelf = {id: "pods", label: "XBLOOM PODS", kind: "auto" as const, count: 4};
    const view = await renderWithProviders(<ShelfTile shelf={shelf} members={mark}
        inverted={inverted} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(4);
    await view.rerender(<ShelfTile shelf={shelf} members={withShelfPhotos({pods: mark}, false).pods}
        inverted={inverted} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(0);
    expect(screen.getByTestId(inverted ? "shelf-mark-glyph-inverted" : "shelf-mark-glyph")).toBeTruthy();
});

it.each([
    fourPhotos.slice(0, 3),
    [...fourPhotos.slice(0, 3), fourPhotos[0]],
    [...fourPhotos.slice(0, 3), {uuid: "blank", accent: "red", imageURL: " "}],
    [...fourPhotos.slice(0, 3), {uuid: "portrait-only", accent: "red"}]
].map(cover => ({cover})))("keeps the stock glyph when four actual photos are unavailable (%j)", async ({cover}) => {
    await renderWithProviders(<ShelfTile shelf={{id: "xbloom", label: "XBLOOM", kind: "auto", count: 20}}
        members={{accents: ["red"], coverMembers: cover}} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(0);
    expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
});

it.each(["tea", "allRecipes", "mine", "neverBrewed", "sharedBy:Someone"])(
    "does not replace other auto/author shelf %s even with four photos", async id => {
        await renderWithProviders(<ShelfTile shelf={{id, label: id, kind: "auto", count: 4}}
            members={{accents: ["red"], coverMembers: fourPhotos}} onPress={jest.fn()}/>);
        expect(photos()).toHaveLength(0);
        expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
    }
);

it.each(["manual", "tag"] as const)("preserves mixed %s covers with just one photo", async kind => {
    await renderWithProviders(<ShelfTile shelf={{id: "tag:coffee", label: "Coffee", kind, count: 4}}
        members={{accents: ["red"], coverMembers: members}} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(1);
    expect(screen.getAllByTestId("shelf-cover-cell", {includeHiddenElements: true})).toHaveLength(4);
});
