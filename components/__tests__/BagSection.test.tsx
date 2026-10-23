import React from "react";
import {screen} from "@testing-library/react-native";
import BagSection from "@/components/BagSection";
import {bagFixture} from "@/test-utils/bags";
import {renderWithProviders} from "@/test-utils/render";

it("does not mistake an uncertain local balance for external tracking", async () => {
    await renderWithProviders(<BagSection tracker="xbrw" bag={bagFixture()}
        balance={{kind: "needsCheck"}} onOpenSheet={() => {}} onChoose={() => {}}
        onInventory={() => {}} onFinish={() => {}} onReorder={() => {}}/>);
    expect(screen.getByText("Check remaining coffee")).toBeTruthy();
    expect(screen.queryByText(/Tracked in Beanconqueror/)).toBeNull();
});
