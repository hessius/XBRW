import React from "react";
import {Platform} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";
import {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import RoastDayField from "@/components/RoastDayField";
import {renderWithProviders} from "@/test-utils/render";
import {dayDate, roastDayLabel} from "@/library/coffeeBag";

it("chooses a local calendar day using this platform's picker", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<RoastDayField value="" today="2026-10-23" onChange={onChange}/>);
    await fireEvent.press(screen.getByTestId("bag-roasted-field"));
    const date = dayDate("2026-10-01")!;
    if (Platform.OS === "android") {
        expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(expect.objectContaining({
            maximumDate: dayDate("2026-10-23"), mode: "date"
        }));
        const options = jest.mocked(DateTimePickerAndroid.open).mock.calls.at(-1)![0];
        options.onValueChange?.({nativeEvent: {timestamp: date.getTime(), utcOffset: 0}}, date);
    } else {
        await fireEvent(screen.getByTestId("bag-roasted-calendar"), "valueChange", {}, date);
    }
    expect(onChange).toHaveBeenCalledWith("2026-10-01");
});

it("does not silently replace a saved future date when its calendar is opened", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<RoastDayField value="2026-11-01" today="2026-10-23" onChange={onChange}/>);
    await fireEvent.press(screen.getByTestId("bag-roasted-field"));
    expect(screen.getByTestId("bag-roasted-value"))
        .toHaveTextContent(roastDayLabel("2026-11-01", "2026-10-23"));
    expect(onChange).not.toHaveBeenCalled();
});
