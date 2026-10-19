import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RenameSheet from "@/components/RenameSheet";
import {renderWithProviders} from "@/test-utils/render";

function props(over: Partial<React.ComponentProps<typeof RenameSheet>> = {}) {
    return {
        open:         true,
        onOpenChange: jest.fn(),
        name:         "Ethiopia",
        borrowedName: "",
        onRename:     jest.fn(),
        ...over
    };
}

describe("RenameSheet", () => {
    it("opens on the name the recipe has now", async () => {
        await renderWithProviders(<RenameSheet {...props()}/>);

        expect(screen.getByTestId("rename-field").props.value).toBe("Ethiopia");
    });

    it("hands over a trimmed name and closes", async () => {
        const onRename = jest.fn();
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <RenameSheet {...props({onRename, onOpenChange})}/>
        );

        await fireEvent.changeText(screen.getByTestId("rename-field"), "  Kenya  ");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("Kenya");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    describe("a long name", () => {
        // Pre-filled, a long name is common. Single line, Android scrolled it to
        // its end and cut the first visible letter at the field's edge.
        it("wraps, with its padding on the field itself", async () => {
            await renderWithProviders(<RenameSheet {...props()}/>);

            const field = screen.getByTestId("rename-field");
            expect(field.props.multiline).toBe(true);
            const style = Object.assign({}, ...[field.props.style].flat());
            expect(style.paddingHorizontal).toBeGreaterThan(0);
            expect(style.maxHeight).toBeGreaterThan(style.lineHeight * 2);
        });

        it("saves on return rather than breaking the line", async () => {
            const onRename = jest.fn();
            const onOpenChange = jest.fn();
            await renderWithProviders(<RenameSheet {...props({onRename, onOpenChange})}/>);

            const field = screen.getByTestId("rename-field");
            expect(field.props.submitBehavior).toBe("blurAndSubmit");
            await fireEvent.changeText(field, "Kenya");
            await fireEvent(field, "submitEditing", {nativeEvent: {text: "Kenya"}});

            expect(onRename).toHaveBeenCalledWith("Kenya");
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it("drops a pasted line break, joining the lines with a space", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({onRename})}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"),
                                       "Ecuador | Vinka Farm\r\n  Anaerobic\n");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("Ecuador | Vinka Farm Anaerobic");
        });

        it("still counts a pod name pasted with a line break as unchanged", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({
                name: "", borrowedName: "Kenya Nyeri", onRename
            })}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "Kenya\nNyeri");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("");
        });
    });

    it("accepts an emptied name, which means follow the pod", async () => {
        // Not a missing value. `displayName()` falls back to the pod name when
        // yours is empty, so clearing the field is how a renamed recipe is put
        // back on its pod's name.
        const onRename = jest.fn();
        await renderWithProviders(<RenameSheet {...props({onRename})}/>);

        await fireEvent.changeText(screen.getByTestId("rename-field"), "");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("");
    });

    it("greets a reopening with the name the recipe has now", async () => {
        // The draft is seeded per opening, not per mount: the sheet is mounted
        // for the life of the screen, so a name changed by a revert, an import
        // or the ABOUT row would otherwise be shown the string the user last
        // typed here.
        const view = await renderWithProviders(<RenameSheet {...props()}/>);

        await fireEvent.changeText(screen.getByTestId("rename-field"), "Abandoned");
        await fireEvent.press(screen.getByLabelText("Close"));
        await view.rerender(<RenameSheet {...props({name: "Kenya Nyeri"})}/>);

        expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
    });

    it("says what clearing the name does, rather than leaving it to be discovered", async () => {
        await renderWithProviders(<RenameSheet {...props()}/>);

        expect(screen.getByText("Clear it to follow the pod name."))
            .toBeTruthy();
        // Said to a screen reader on the field too, which is where focus lands.
        expect(screen.getByTestId("rename-field").props.accessibilityHint)
            .toBe("Clear it to follow the pod name.");
    });

    describe("a recipe following its pod", () => {
        // Its own name is empty and its title is borrowed. The field opens on
        // that title, because it is the name on screen, but saving it untouched
        // must not turn it into a rename that freezes the pod's current name.
        const following = {name: "", borrowedName: "Kenya Nyeri"};

        it("opens on the borrowed name, so there is something to edit", async () => {
            await renderWithProviders(<RenameSheet {...props(following)}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
        });

        it("hands back an empty name when the borrowed one is saved unchanged", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({...following, onRename})}/>);

            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("");
        });

        it.each(["Kenya\nNyeri", "Kenya\r\n  Nyeri", "Caf\u00e9\nColombia"])(
            "keeps following a multiline pod name saved untouched: %j", async borrowedName => {
                const onRename = jest.fn();
                await renderWithProviders(<RenameSheet {...props({
                    name: "", borrowedName, onRename
                })}/>);

                await fireEvent.press(screen.getByTestId("rename-confirm"));

                expect(onRename).toHaveBeenCalledWith("");
            }
        );

        it("still counts the borrowed name as unchanged with stray spaces", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({...following, onRename})}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), " Kenya Nyeri ");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("");
        });

        it("counts the borrowed name as unchanged in either Unicode form", async () => {
            // A precomposed and a decomposed accent are the same name to a
            // person. Case is not folded: recasing a name is a rename.
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({
                name: "", borrowedName: "Caf\u00e9 Colombia", onRename
            })}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "Cafe\u0301 Colombia");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("");
        });

        it("keeps a recased borrowed name as a rename", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({...following, onRename})}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "KENYA NYERI");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("KENYA NYERI");
        });

        it("keeps what is being typed when the pod name lookup lands", async () => {
            // The editor fetches the pod name on mount, so the answer can arrive
            // with the sheet already open and the field already edited.
            const onRename = jest.fn();
            const view = await renderWithProviders(
                <RenameSheet {...props({name: "", borrowedName: "", onRename})}/>
            );

            await fireEvent.changeText(screen.getByTestId("rename-field"), "My own");
            await view.rerender(<RenameSheet {...props({...following, onRename})}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("My own");
            await fireEvent.press(screen.getByTestId("rename-confirm"));
            expect(onRename).toHaveBeenCalledWith("My own");
        });

        it("moves an untouched field to the pod name when the lookup lands", async () => {
            // And saving it then compares against the name that arrived.
            const onRename = jest.fn();
            const view = await renderWithProviders(
                <RenameSheet {...props({name: "", borrowedName: "", onRename})}/>
            );

            await view.rerender(<RenameSheet {...props({...following, onRename})}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
            await fireEvent.press(screen.getByTestId("rename-confirm"));
            expect(onRename).toHaveBeenCalledWith("");
        });

        it("moves an untouched field from one pod name to a newer one", async () => {
            const onRename = jest.fn();
            const view = await renderWithProviders(
                <RenameSheet {...props({...following, onRename})}/>
            );

            await view.rerender(<RenameSheet {...props({
                name: "", borrowedName: "Kenya Nyeri AA", onRename
            })}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri AA");
            await fireEvent.press(screen.getByTestId("rename-confirm"));
            expect(onRename).toHaveBeenCalledWith("");
        });

        it("hands back an edited name as the recipe's own", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({...following, onRename})}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "Kenya Nyeri light");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("Kenya Nyeri light");
        });

        it("hands back an empty name when the field is cleared", async () => {
            const onRename = jest.fn();
            await renderWithProviders(<RenameSheet {...props({...following, onRename})}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "");
            await fireEvent.press(screen.getByTestId("rename-confirm"));

            expect(onRename).toHaveBeenCalledWith("");
        });

        it("offers the borrowed name again after the field was cleared and saved", async () => {
            // Clearing leaves the recipe's name empty, as it was, so nothing the
            // sheet is handed changes. The next opening still shows the title.
            const view = await renderWithProviders(<RenameSheet {...props(following)}/>);

            await fireEvent.changeText(screen.getByTestId("rename-field"), "");
            await fireEvent.press(screen.getByTestId("rename-confirm"));
            await view.rerender(<RenameSheet {...props({...following, open: true})}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
        });

        it("offers the borrowed name again after a dismissed edit", async () => {
            const onOpenChange = jest.fn();
            const view = await renderWithProviders(
                <RenameSheet {...props({...following, onOpenChange})}/>
            );

            await fireEvent.changeText(screen.getByTestId("rename-field"), "Abandoned");
            await fireEvent.press(screen.getByLabelText("Close"));
            await view.rerender(<RenameSheet {...props({...following, onOpenChange, open: true})}/>);

            expect(screen.getByTestId("rename-field").props.value).toBe("Kenya Nyeri");
        });
    });

    it("opens on the recipe's own name and keeps it when saved unchanged", async () => {
        // A recipe with its own name never offers the borrowed one, and saving
        // it untouched is not a request to go back to the pod.
        const onRename = jest.fn();
        await renderWithProviders(
            <RenameSheet {...props({name: "Sunday", borrowedName: "Kenya Nyeri", onRename})}/>
        );

        expect(screen.getByTestId("rename-field").props.value).toBe("Sunday");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("Sunday");
    });

    it("keeps the pod name typed over a recipe's own name as its own", async () => {
        // Only a recipe already following its pod is put back on it. Typing
        // the pod name over your own name freezes that string; USE THIS NAME
        // on ABOUT is the way back to following.
        const onRename = jest.fn();
        await renderWithProviders(
            <RenameSheet {...props({name: "Sunday", borrowedName: "Kenya Nyeri", onRename})}/>
        );

        await fireEvent.changeText(screen.getByTestId("rename-field"), "Kenya Nyeri");
        await fireEvent.press(screen.getByTestId("rename-confirm"));

        expect(onRename).toHaveBeenCalledWith("Kenya Nyeri");
    });

    it("opens empty when the recipe has no pod name to borrow", async () => {
        // The caller passes only `xbloomName`, so a recipe titled by its
        // Recipe ID or the generated placeholder opens empty.
        await renderWithProviders(<RenameSheet {...props({name: "", borrowedName: ""})}/>);

        expect(screen.getByTestId("rename-field").props.value).toBe("");
    });
});
