import React, {useState} from "react";
import {Platform} from "react-native";
import DateTimePicker, {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";
import {dayDate, dayOf, roastDayLabel, roastDayRange} from "@/library/coffeeBag";

type Props = {
    /** The chosen day, `YYYY-MM-DD`, or "" for none. */
    value: string;
    /** Today's local day, read once by the caller so a sheet left open past
     *  midnight does not move its own limits under the person. */
    today: string;
    onChange: (day: string) => void;
};

/**
 * A roast day picked from the platform's own calendar.
 *
 * The row shows the day in words and opens the picker: on Android the system
 * date dialog, on iOS an inline calendar under the row (tap the row again to
 * fold it away). Days run from a year back to today. CLEAR empties it, because
 * the roast day stays optional.
 *
 * The value stays a local `YYYY-MM-DD`: the picker hands back an instant on the
 * chosen day and `dayOf` reads its local calendar day, so no UTC conversion can
 * move it across midnight.
 */
export default function RoastDayField({value, today, onChange}: Props) {
    const {palette, scheme} = useAppearance();
    const [calendarOpen, setCalendarOpen] = useState(false);
    const range = roastDayRange(today, value);
    const minimumDate = dayDate(range.min) ?? undefined;
    const maximumDate = dayDate(range.max) ?? undefined;
    const current = (value === "" ? null : dayDate(value)) ?? dayDate(today) ?? new Date();

    function pick(date: Date) {
        onChange(dayOf(date.getTime()));
    }

    function open() {
        if (Platform.OS === "android") {
            DateTimePickerAndroid.open({
                value: current,
                mode: "date",
                minimumDate,
                maximumDate,
                onValueChange: (_event, date) => pick(date)
            });
            return;
        }
        setCalendarOpen((shown) => !shown);
    }

    const shown = value === "" ? "Not set" : roastDayLabel(value, today);
    const spoken = value === "" ? "Roasted on, not set" : `Roasted on, ${roastDayLabel(value, today, true)}`;

    return (
        <YStack gap="$2">
            <XStack gap="$2" alignItems="center">
                <XStack flex={1} accessible accessibilityRole="button" accessibilityLabel={spoken}
                        accessibilityHint="Opens a calendar to pick the day."
                        testID="bag-roasted-field" onPress={open}
                        minHeight={48} alignItems="center" paddingHorizontal={14}
                        borderRadius={12} backgroundColor={palette.raised}>
                    <Text testID="bag-roasted-value" fontSize={16}
                          color={value === "" ? palette.placeholder : palette.text}>
                        {shown}
                    </Text>
                </XStack>
                {value !== "" && (
                    <XStack accessible accessibilityRole="button" accessibilityLabel="Clear the roast date"
                            testID="bag-roasted-clear"
                            onPress={() => {
                                setCalendarOpen(false);
                                onChange("");
                            }}
                            minHeight={48} minWidth={64} alignItems="center" justifyContent="center"
                            paddingHorizontal="$3" borderRadius="$4"
                            borderWidth={1} borderColor={palette.line}>
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.2} color={palette.dim}>
                            CLEAR
                        </DotMatrixText>
                    </XStack>
                )}
            </XStack>
            {Platform.OS === "ios" && calendarOpen && (
                <DateTimePicker testID="bag-roasted-calendar" value={current} mode="date"
                                display="inline" themeVariant={scheme} accentColor={palette.text}
                                minimumDate={minimumDate} maximumDate={maximumDate}
                                onValueChange={(_event, date) => pick(date)}/>
            )}
        </YStack>
    );
}
