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
