import React, {useState} from "react";
import {ScrollView, TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import RoastDayField from "@/components/RoastDayField";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import {
    BAG_BEAN_NAME_MAX,
    BAG_PRESETS,
    calendarDay,
    dayOf,
    isBagGrams,
    isBagPrice,
    isGramsLeft,
    type BagTracker,
    type CoffeeBag
} from "@/library/coffeeBag";
import {
    ROAST_LEVELS,
    ROAST_LEVEL_DEFAULTS,
    figuresFrom,
    figuresProblem,
    roastDays,
    startingFigures,
    type AdvisedCoffee,
    type RoastFigures,
    type RoastLevelKey
} from "@/library/restPeak";

/** What the sheet hands back. `gramsLeft` only when editing in `xbrw` mode. */
export type BagSheetResult = {
    sizeGrams: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
    gramsLeft?: number;
    /** Rest and peak, only with a roast day to count them from. */
    figures?: RoastFigures;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tracker: BagTracker;
    /** The open bag being edited, or null to add one. */
    bag: CoffeeBag | null;
    /** Grams left now, for the edit field. Ignored when adding. */
    gramsLeft: number | null;
    /** A roast day to start from when adding, from the pod. */
    suggestedRoastedOn?: string;
    /**
     * The recipe's coffee, for its roast advice and roast level. When it
     * states a rest and a peak (a BrewMind link, the roaster catalogue) the
     * sheet shows them rather than asking.
     */
    coffee?: AdvisedCoffee;
    /** The name Beanconqueror will see on this recipe's brews. */
    beanName: string;
    /** True when a pod fixes the name, so it is shown but not editable. */
    beanNameFixed: boolean;
    /** Bumped by the caller on each open, so the fields start fresh. */
    epoch: number;
    onSave: (result: BagSheetResult) => void;
    onFinish: () => void;
    onRemove: () => void;
};

const fieldStyle = {
    color: palette.text,
    backgroundColor: palette.raised,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16
};

function Label({children}: {children: string}) {
    return (
        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
            {children}
        </DotMatrixText>
    );
}

function Chip({label, spoken, selected, testID, onPress}: {
    label: string; spoken: string; selected: boolean; testID: string; onPress: () => void;
}) {
    return (
        <XStack accessible accessibilityRole="radio" accessibilityLabel={spoken}
                accessibilityState={{checked: selected}} testID={testID} onPress={onPress}
                minHeight={44} minWidth={56} alignItems="center" justifyContent="center"
                paddingHorizontal="$3" borderRadius="$4"
                backgroundColor={selected ? palette.text : palette.raised}
                borderWidth={1} borderColor={selected ? palette.text : palette.line}>
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.2}
                           color={selected ? palette.base : palette.text}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

function ActionButton({label, spoken, testID, tone, filled, disabled, onPress}: {
    label: string; spoken: string; testID: string; tone: string;
    filled?: boolean; disabled?: boolean; onPress: () => void;
}) {
    return (
        <XStack accessible accessibilityRole="button" accessibilityLabel={spoken}
                accessibilityState={{disabled: disabled === true}} testID={testID}
                onPress={disabled === true ? undefined : onPress}
                height={48} alignItems="center" justifyContent="center" borderRadius="$4"
                opacity={disabled === true ? 0.4 : 1}
                backgroundColor={filled === true ? tone : palette.raised}
                borderWidth={filled === true ? 0 : 1} borderColor={palette.line}>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                           color={filled === true ? onAccent.text : tone}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

/** Whole numbers only; anything else reads as nothing typed. */
function wholeNumber(text: string): number | undefined {
    const trimmed = text.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** A price with an optional decimal part, `,` accepted as the decimal mark. */
function priceNumber(text: string): number | undefined {
    const trimmed = text.trim().replace(",", ".");
    return /^\d+(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : undefined;
}

/**
 * The fields, keyed by the caller's epoch so each open starts from the bag
 * rather than from whatever was typed last time. A remount is the house answer
 * to state that must follow a prop: the compiler forbids seeding it from an
 * effect.
 */
function BagForm({
    tracker, bag, gramsLeft, suggestedRoastedOn, coffee, beanName, beanNameFixed,
    onSave, onFinish, onRemove
}: Omit<Props, "open" | "onOpenChange" | "epoch">) {
    const advised = startingFigures(coffee);
    const startRest = bag?.restDays ?? advised.figures.restDays;
    const startPeak = bag?.peakDay ?? advised.figures.peakDay;
    const startSize = bag?.sizeGrams ?? 250;
    const [size, setSize] = useState(String(startSize));
    const [custom, setCustom] = useState(!BAG_PRESETS.includes(startSize));
    // Read once: the picker's limits and the new-bag default both hang off it.
    const [today] = useState(() => dayOf(Date.now()));
    // A new bag starts on today, the likeliest day for a bag opened on the
    // spot, unless the pod names its own roast day. An edited bag keeps what
    // it has, including nothing.
    const [roasted, setRoasted] = useState(
        bag !== null ? bag.roastedOn ?? "" : suggestedRoastedOn ?? today);
    const [price, setPrice] = useState(bag?.price !== undefined ? String(bag.price) : "");
    const [name, setName] = useState(bag?.beanName ?? beanName);
    const [left, setLeft] = useState(gramsLeft !== null ? String(gramsLeft) : "");
    const [level, setLevel] = useState<RoastLevelKey | null>(
        bag?.restDays === undefined ? advised.level : null);
    const [rest, setRest] = useState(String(startRest));
    const [peak, setPeak] = useState(String(startPeak));

    const sizeGrams = wholeNumber(size);
    const sizeOk = isBagGrams(sizeGrams);
    const roastedOn = roasted.trim() === "" ? undefined : calendarDay(roasted);
    const roastOk = roasted.trim() === "" || roastedOn !== undefined;
    const priceValue = price.trim() === "" ? undefined : priceNumber(price);
    const priceOk = price.trim() === "" || isBagPrice(priceValue);
    const editingLeft = bag !== null && tracker === "xbrw";
    const leftValue = wholeNumber(left);
    const leftOk = !editingLeft || isGramsLeft(leftValue);
    const nameValue = (beanNameFixed ? beanName : name).trim();
    const nameOk = tracker === "xbrw" || nameValue !== "";
    // The roaster's word is shown, not asked for; otherwise the person sets it.
    const fromRoaster = advised.source === "coffee";
    const restValue = roastDays(rest);
    const peakValue = roastDays(peak);
    const figuresError = fromRoaster ? null : figuresProblem(restValue, peakValue);
    const figures: RoastFigures | undefined = roastedOn === undefined ? undefined
        : fromRoaster ? advised.figures
        : figuresError === null && restValue !== undefined && peakValue !== undefined
            ? figuresFrom(restValue, peakValue, level ?? advised.level) : undefined;
    const figuresOk = roastedOn === undefined || figures !== undefined;
    const valid = sizeOk && roastOk && priceOk && leftOk && nameOk && figuresOk;

    function pickLevel(key: RoastLevelKey) {
        setLevel(key);
        setRest(String(ROAST_LEVEL_DEFAULTS[key].restDays));
        setPeak(String(ROAST_LEVEL_DEFAULTS[key].peakDay));
    }

    function save() {
        if (!valid || sizeGrams === undefined) return;
        onSave({
            sizeGrams,
            ...(roastedOn !== undefined ? {roastedOn} : {}),
            ...(priceValue !== undefined ? {price: priceValue} : {}),
            ...(tracker === "beanconqueror" ? {beanName: nameValue} : {}),
            ...(editingLeft && leftValue !== undefined ? {gramsLeft: leftValue} : {}),
            ...(figures !== undefined ? {figures} : {})
        });
    }

    const sending = tracker === "beanconqueror" && bag === null;

    return (
        <ScrollView keyboardShouldPersistTaps="handled">
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {tracker === "xbrw"
                        ? "Each brew of this recipe takes its dose from the bag."
                        : "The bag goes to Beanconqueror, which takes each brew you send it from the bag."}
                </Text>

                <YStack gap="$2">
                    <Label>BAG SIZE</Label>
                    <XStack gap="$2" flexWrap="wrap" accessibilityRole="radiogroup"
                            accessibilityLabel="Bag size">
                        {BAG_PRESETS.map((grams) => (
                            <Chip key={grams} label={`${grams}G`} spoken={`${grams} grams`}
                                  testID={`bag-size-${grams}`}
                                  selected={!custom && sizeGrams === grams}
                                  onPress={() => {
                                      setCustom(false);
                                      setSize(String(grams));
                                  }}/>
                        ))}
                        <Chip label="OTHER" spoken="Other size" testID="bag-size-other"
                              selected={custom} onPress={() => setCustom(true)}/>
                    </XStack>
                    {custom && (
                        <TextInput testID="bag-size-field" accessibilityLabel="Bag size in grams"
                                   value={size} onChangeText={setSize} keyboardType="number-pad"
                                   placeholder="Grams" placeholderTextColor={palette.placeholder}
                                   style={fieldStyle}/>
                    )}
                    {!sizeOk && (
                        <Text testID="bag-size-error" fontSize={12} color={palette.danger}>
                            Enter a size in whole grams.
                        </Text>
                    )}
                </YStack>

                <YStack gap="$2">
                    <Label>ROASTED ON</Label>
                    <RoastDayField value={roasted} today={today} onChange={setRoasted}/>
                    <Text fontSize={12} color={palette.dim}>
                        Optional. The date on the bag.
                    </Text>
                </YStack>

                {roastedOn !== undefined && (
                    <YStack gap="$2" testID="bag-rest-peak">
                        <Label>REST AND PEAK</Label>
                        {fromRoaster ? (
                            <Text testID="bag-rest-peak-roaster" fontSize={13} color={palette.text}>
                                {`From the roaster: rest ${advised.figures.restDays} days, peak on day ${advised.figures.peakDay}.`}
                            </Text>
                        ) : (
                            <>
                                <XStack gap="$2" flexWrap="wrap" accessibilityRole="radiogroup"
                                        accessibilityLabel="Roast">
                                    {ROAST_LEVELS.map(({key, label, spoken}) => (
                                        <Chip key={key} label={label} spoken={spoken}
                                              testID={`bag-roast-${key}`}
                                              selected={level === key}
                                              onPress={() => pickLevel(key)}/>
                                    ))}
                                </XStack>
                                <XStack gap="$2">
                                    <YStack flex={1} gap="$1">
                                        <Label>REST DAYS</Label>
                                        <TextInput testID="bag-rest-field"
                                                   accessibilityLabel="Rest days after roasting"
                                                   value={rest} keyboardType="number-pad"
                                                   onChangeText={(text) => {
                                                       setRest(text);
                                                       setLevel(null);
                                                   }}
                                                   style={fieldStyle}/>
                                    </YStack>
                                    <YStack flex={1} gap="$1">
                                        <Label>PEAK DAY</Label>
                                        <TextInput testID="bag-peak-field"
                                                   accessibilityLabel="Peak day after roasting"
                                                   value={peak} keyboardType="number-pad"
                                                   onChangeText={(text) => {
                                                       setPeak(text);
                                                       setLevel(null);
                                                   }}
                                                   style={fieldStyle}/>
                                    </YStack>
                                </XStack>
                                <Text testID="bag-rest-peak-note" fontSize={12}
                                      color={figuresError === null ? palette.dim : palette.danger}>
                                    {figuresError ?? "Days after the roast date. Pick a roast to fill them in, or type your own."}
                                </Text>
                            </>
                        )}
                    </YStack>
                )}

                {editingLeft && (
                    <YStack gap="$2">
                        <Label>GRAMS LEFT</Label>
                        <TextInput testID="bag-left-field" accessibilityLabel="Grams left in the bag"
                                   value={left} onChangeText={setLeft} keyboardType="number-pad"
                                   placeholderTextColor={palette.placeholder} style={fieldStyle}/>
                        <Text fontSize={12} color={leftOk ? palette.dim : palette.danger}>
                            {leftOk
                                ? "Correct this if you used some another way. Brews count down from here."
                                : "Enter what is left in whole grams."}
                        </Text>
                    </YStack>
                )}

                {tracker === "beanconqueror" && (
                    <>
                        <YStack gap="$2">
                            <Label>BEAN NAME</Label>
                            {beanNameFixed ? (
                                <Text testID="bag-bean-name" fontSize={16} color={palette.text}>
                                    {beanName}
                                </Text>
                            ) : (
                                <TextInput testID="bag-bean-name-field" accessibilityLabel="Bean name"
                                           value={name} onChangeText={setName}
                                           maxLength={BAG_BEAN_NAME_MAX} autoCorrect={false}
                                           placeholderTextColor={palette.placeholder}
                                           style={fieldStyle}/>
                            )}
                            <Text fontSize={12} color={nameOk ? palette.dim : palette.danger}>
                                {nameOk
                                    ? "Brews you send from this recipe go to the bean with this name."
                                    : "Give the bean a name."}
                            </Text>
                        </YStack>
                        <YStack gap="$2">
                            <Label>PRICE</Label>
                            <TextInput testID="bag-price-field" accessibilityLabel="Price"
                                       value={price} onChangeText={setPrice}
                                       keyboardType="decimal-pad" placeholder="Optional"
                                       placeholderTextColor={palette.placeholder}
                                       style={fieldStyle}/>
                            {!priceOk && (
                                <Text fontSize={12} color={palette.danger}>
                                    Enter a price like 24.50.
                                </Text>
                            )}
                        </YStack>
                    </>
                )}

                <ActionButton label={sending ? "SEND TO BEANCONQUEROR" : "SAVE"}
                              spoken={sending ? "Save the bag and send it to Beanconqueror" : "Save bag"}
                              testID="bag-save" tone={palette.text} filled disabled={!valid}
                              onPress={save}/>
                {bag !== null && (
                    <XStack gap="$2">
                        <YStack flex={1}>
                            <ActionButton label="FINISHED" spoken="Mark this bag finished"
                                          testID="bag-sheet-finish" tone={palette.text}
                                          onPress={onFinish}/>
                        </YStack>
                        <YStack flex={1}>
                            <ActionButton label="REMOVE" spoken="Remove this bag"
                                          testID="bag-sheet-remove" tone={palette.danger}
                                          onPress={onRemove}/>
                        </YStack>
                    </XStack>
                )}
            </YStack>
        </ScrollView>
    );
}

/**
 * Add or edit the bag a recipe draws on.
 *
 * FINISHED keeps the bag and every brew; REMOVE deletes the bag only, for one
 * added by mistake. Neither touches brew history.
 */
export default function BagSheet({open, onOpenChange, epoch, ...form}: Props) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={form.bag === null ? "I bought a bag" : "Your bag"} heightPercent={75}>
            <BagForm key={`${form.bag?.id ?? "new"}-${epoch}`} {...form}/>
        </XbrwSheet>
    );
}
