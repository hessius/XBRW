import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import ShelfTile from "@/components/ShelfTile";
import {withShelfPhotos} from "@/components/ShelfPhotoMark";
import {renderWithProviders} from "@/test-utils/render";
import {palette, resolveAppearance} from "@/constants/colors";
import {DEFAULT_APPEARANCE} from "@/library/appearance";

const shelf = {id: "roaster:Acme", label: "Acme", kind: "auto" as const, count: 9};
const photos = () => screen.queryAllByTestId("shelf-photo", {includeHiddenElements: true});
const cells = () => screen.getAllByTestId("shelf-cover-cell", {includeHiddenElements: true});
const members = (count: number) => ({
    accents: [palette.text, palette.dim, palette.surface],
    coverMembers: Array.from({length: 4}, (_, n) => ({
        uuid: `coffee-${n}`, accent: [palette.text, palette.dim, palette.surface, palette.raised][n],
        ...(n < count ? {imageURL: `https://coffee.example/${n}.jpg`} : {})
    }))
});

it.each([0, 1, 2, 3, 4])("draws %s roaster photos in individual cells without changing the 44pt mark", async count => {
    await renderWithProviders(<ShelfTile shelf={shelf} members={members(count)} onPress={jest.fn()}/>);
    expect(screen.getByRole("button", {name: "Acme, auto shelf, 9 recipes"})).toBeTruthy();
    expect(photos()).toHaveLength(count);
    if (count === 0) {
        expect(screen.getByTestId("shelf-mark-initial")).toHaveTextContent("A");
        expect(screen.getByTestId("shelf-mark")).toHaveStyle({width: 44, height: 44});
    } else {
        expect(screen.getByTestId("shelf-photo-mark", {includeHiddenElements: true}))
            .toHaveStyle({width: 44, height: 44});
        expect(cells()).toHaveLength(4);
        cells().forEach((cell, index) => expect(cell).toHaveStyle({
            width: 21, height: 21, backgroundColor: members(count).coverMembers[index].accent
        }));
        expect(photos().every(photo => photo.props.style.width === 21)).toBe(true);
    }
});

it.each([false, true])("uses the initial and correct contrast when photos are disabled, inverted %s", async inverted => {
    const mark = withShelfPhotos({[shelf.id]: members(4)}, false)[shelf.id];
    await renderWithProviders(<ShelfTile shelf={shelf} members={mark} inverted={inverted} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(0);
    expect(screen.getByTestId("shelf-mark-initial")).toHaveTextContent("A");
    expect(screen.getByTestId("shelf-mark-initial-text"))
        .toHaveStyle({color: inverted ? palette.text
            : resolveAppearance(DEFAULT_APPEARANCE).onFill(palette.text).text});
});

it("uses accents on individual failures, the initial on all failures, and retries a replacement URI", async () => {
    const mark = members(2);
    const view = await renderWithProviders(<ShelfTile shelf={shelf} members={mark} onPress={jest.fn()}/>);
    await fireEvent(photos()[0], "error");
    expect(photos()).toHaveLength(1);
    expect(cells()).toHaveLength(4);
    expect(cells()[0]).toHaveStyle({backgroundColor: mark.coverMembers[0].accent});
    await fireEvent(photos()[0], "error");
    expect(screen.getByTestId("shelf-mark-initial")).toBeTruthy();
    const replacement = {...mark, coverMembers: mark.coverMembers.map((member, n) => n === 0
        ? {...member, imageURL: "https://coffee.example/new.jpg"} : member)};
    await view.rerender(<ShelfTile shelf={shelf} members={replacement} onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(1);
    expect(photos()[0].props.source.uri).toBe("https://coffee.example/new.jpg");
});

it("treats a repeated URL as separate saved recipes and isolates failures to each mounted shelf", async () => {
    const mark = members(2);
    mark.coverMembers[1].imageURL = mark.coverMembers[0].imageURL;
    await renderWithProviders(<>
        <ShelfTile shelf={shelf} members={mark} onPress={jest.fn()}/>
        <ShelfTile shelf={{...shelf, id: "roaster:Other", label: "Other"}} members={mark} onPress={jest.fn()}/>
    </>);
    expect(photos()).toHaveLength(4);
    await fireEvent(photos()[0], "error");
    expect(photos()).toHaveLength(2);
    expect(screen.getByTestId("shelf-mark-initial")).toHaveTextContent("A");
});

it.each([["  49th Coffee", "4"], ["Élan", "É"], ["東京", "東"], ["“Acme”", "A"], ["ß Coffee", "ß"]])(
    "uses the literal leading letter or digit of %s without brand aliases", async (label, initial) => {
        await renderWithProviders(<ShelfTile shelf={{...shelf, label}}
            members={members(0)} onPress={jest.fn()}/>);
        expect(screen.getByTestId("shelf-mark-initial")).toHaveTextContent(initial);
        if (/^[A-Z0-9]$/.test(initial)) {
            expect(screen.getByTestId("shelf-mark-initial-text")).toHaveStyle({fontFamily: "Doto-Bold"});
        } else {
            expect(screen.getByTestId("shelf-mark-initial-text")).not.toHaveStyle({fontFamily: "Doto-Bold"});
        }
    }
);

it("keeps an empty active roaster shelf's initial without member art", async () => {
    await renderWithProviders(<ShelfTile shelf={{...shelf, count: 0}} onPress={jest.fn()}/>);
    expect(screen.getByTestId("shelf-mark-initial")).toHaveTextContent("A");
    expect(screen.getByRole("button", {name: "Acme, auto shelf, 0 recipes"})).toBeTruthy();
});

it("never enlarges the only roaster photo even on a single-member shelf", async () => {
    await renderWithProviders(<ShelfTile shelf={{...shelf, count: 1}}
        members={{accents: [palette.text], coverMembers: members(1).coverMembers.slice(0, 1)}}
        onPress={jest.fn()}/>);
    expect(photos()).toHaveLength(1);
    expect(photos()[0]).toHaveStyle({width: 21, height: 21});
    expect(cells()).toHaveLength(4);
});
