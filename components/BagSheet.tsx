import React, {useState} from "react";
import {ScrollView, TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import RoastDayField from "@/components/RoastDayField";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import {
    BAG_BEAN_NAME_MAX,
    BAG_NAME_MAX,
    BAG_PRESETS,
    calendarDay,
    dayOf,
    isBagGrams,
    isBagPrice,
    isGramsLeft,
    type BagTracker,
    type CoffeeBag,
    type AdviceSource
} from "@/library/coffeeBag";
import {
    ROAST_LEVELS,
    ROAST_LEVEL_DEFAULTS,
    roastDays,
    startingFigures,
    type AdvisedCoffee,
    type RoastFigures,
    type RoastLevelKey
} from "@/library/restPeak";
import {roastAdviceProblem} from "@/library/roastAdvice";

/** What the sheet hands back. `gramsLeft` only when editing in `xbrw` mode. */
export type BagSheetResult = {
    name: string;
    sizeGrams: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
    gramsLeft?: number;
    /** Rest and peak, only with a roast day to count them from. */
    figures?: RoastFigures;
    adviceSource: AdviceSource;
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
     * states guidance, the sheet prefills it while keeping all three values editable.
     */
    coffee?: AdvisedCoffee;
    /** The name Beanconqueror will see on this recipe's brews. */
    beanName: string;
    /** Bumped by the caller on each open, so the fields start fresh. */
    epoch: number;
    /**
     * The sizes to offer in place of the usual presets, e.g. the bags a
     * roaster's catalogue sells. Empty or absent keeps `BAG_PRESETS`.
     */
    sizes?: readonly number[];
    /** The size picked when adding, in place of 250 g. */
    suggestedSize?: number;
    /**
     * What a bag of this size costs, from the roaster's catalogue. Given, the
     * price is asked for in both tracker modes and filled in from the chosen
     * size until the person types their own.
     */
    priceFor?: (grams: number) => number | undefined;
    onSave: (result: BagSheetResult) => void;
    onFinish: () => void;
    onRemove: () => void;
};

const fieldLayout = {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16
};

function Label({children}: {children: string}) {
    const {palette} = useAppearance();
    return (
        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
            {children}
        </DotMatrixText>
    );
}

function Chip({label, spoken, selected, testID, onPress}: {
    label: string; spoken: string; selected: boolean; testID: string; onPress: () => void;
}) {
    const {palette, selection} = useAppearance();
    return (
        <XStack accessible accessibilityRole="radio" accessibilityLabel={spoken}
                accessibilityState={{checked: selected}} testID={testID} onPress={onPress}
                minHeight={44} minWidth={56} alignItems="center" justifyContent="center"
                paddingHorizontal="$3" borderRadius="$4"
                backgroundColor={selected ? selection.fill : palette.raised}
                borderWidth={1} borderColor={selected ? selection.fill : palette.line}>
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.2}
                           color={selected ? selection.ink : palette.text}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

function ActionButton({label, spoken, testID, tone, filled, disabled, onPress}: {
    label: string; spoken: string; testID: string; tone: string;
    filled?: boolean; disabled?: boolean; onPress: () => void;
}) {
    const {palette, primary} = useAppearance();
    return (
        <XStack accessible accessibilityRole="button" accessibilityLabel={spoken}
                accessibilityState={{disabled: disabled === true}} testID={testID}
                onPress={disabled === true ? undefined : onPress}
                minHeight={48} paddingVertical="$2" alignItems="center" justifyContent="center" borderRadius="$4"
                opacity={disabled === true && !filled ? 0.4 : 1}
                backgroundColor={filled === true
                    ? disabled ? palette.control : primary.fill : palette.raised}
                borderWidth={filled === true ? 0 : 1} borderColor={palette.line}>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                           color={filled === true
                               ? disabled ? palette.dim : primary.ink : tone}>
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
    tracker, bag, gramsLeft, suggestedRoastedOn, coffee, beanName,
    onSave, onFinish, onRemove, sizes, suggestedSize, priceFor
}: Omit<Props, "open" | "onOpenChange" | "epoch">) {
    const {palette} = useAppearance();
    const fieldStyle = {...fieldLayout, color: palette.text, backgroundColor: palette.raised};
    const advised = startingFigures(coffee);
    const startRest = bag?.restDays ?? advised.figures.restDays;
    const startPeak = bag?.peakDay ?? advised.figures.peakDay;
    const presets = sizes !== undefined && sizes.length > 0 ? sizes : BAG_PRESETS;
    const startSize = bag?.sizeGrams ?? suggestedSize ?? 250;
    const startPrice = bag?.price ?? (bag === null ? priceFor?.(startSize) : undefined);
    const [size, setSize] = useState(String(startSize));
    const [custom, setCustom] = useState(!presets.includes(startSize));
    // Read once for this form's calendar limit.
    const [today] = useState(() => dayOf(Date.now()));
    // A missing roast day stays unknown, rather than inventing one.
    const [roasted, setRoasted] = useState(
        bag !== null ? bag.roastedOn ?? "" : suggestedRoastedOn ?? "");
    const [price, setPrice] = useState(startPrice !== undefined ? String(startPrice) : "");
    // Follows the chosen size until the person types a price of their own.
    const [priceTyped, setPriceTyped] = useState(false);
    const [name, setName] = useState(bag?.name ?? "");
    const [externalName, setExternalName] = useState(bag?.beanName ?? beanName);
    const [left, setLeft] = useState(gramsLeft !== null ? String(gramsLeft) : "");
    const [leftTouched, setLeftTouched] = useState(false);
    const [level, setLevel] = useState<RoastLevelKey | null>(
        bag === null ? advised.level ?? null : null);
    const [rest, setRest] = useState(String(startRest));
    const [peak, setPeak] = useState(String(startPeak));
    const [best, setBest] = useState(String(bag?.bestUntilDay ?? advised.figures.bestUntilDay));
    const [adviceEdited, setAdviceEdited] = useState(false);

    const sizeGrams = wholeNumber(size);
    const sizeOk = isBagGrams(sizeGrams);
    const roastedOn = roasted.trim() === "" ? undefined : calendarDay(roasted);
    const roastOk = roasted.trim() === "" || (roastedOn !== undefined && roastedOn <= today);
    const priceValue = price.trim() === "" ? undefined : priceNumber(price);
    const priceOk = price.trim() === "" || isBagPrice(priceValue);
    const editingLeft = bag !== null && tracker === "xbrw";
    const leftValue = wholeNumber(left);
    const leftOk = !editingLeft || !leftTouched || isGramsLeft(leftValue);
    const nameValue = name.trim();
    const nameOk = nameValue.length > 0 && nameValue.length <= BAG_NAME_MAX;
    const externalValue = externalName.trim();
    const restValue = roastDays(rest);
    const peakValue = roastDays(peak);
    const bestValue = roastDays(best);
    const figures = restValue !== undefined && peakValue !== undefined && bestValue !== undefined
        ? {restDays: restValue, peakDay: peakValue, bestUntilDay: bestValue} : undefined;
    const figuresError = figures === undefined ? "Enter whole days, 0 to 540." : roastAdviceProblem(figures);
    const source = adviceEdited ? "user" : bag?.adviceSource ?? advised.source;
    const valid = sizeOk && roastOk && priceOk && leftOk && nameOk && figuresError === null
        && externalValue.length <= BAG_BEAN_NAME_MAX;

    function pickLevel(key: RoastLevelKey) {
        setLevel(key);
        setAdviceEdited(true);
        setRest(String(ROAST_LEVEL_DEFAULTS[key].restDays));
        setPeak(String(ROAST_LEVEL_DEFAULTS[key].peakDay));
        setBest(String(ROAST_LEVEL_DEFAULTS[key].bestUntilDay));
    }

    function save() {
        if (!valid || sizeGrams === undefined) return;
        onSave({
            name: nameValue,
            sizeGrams,
            ...(roastedOn !== undefined ? {roastedOn} : {}),
            ...(priceValue !== undefined ? {price: priceValue} : {}),
            ...(externalValue ? {beanName: externalValue} : {}),
            ...(editingLeft && leftTouched && leftValue !== undefined ? {gramsLeft: leftValue} : {}),
            ...(figures !== undefined ? {figures} : {}),
            adviceSource: source
        });
    }

    return (
        <ScrollView keyboardShouldPersistTaps="handled">
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {tracker === "xbrw"
                        ? "Only brews explicitly assigned to this bag count towards its estimate."
                        : "Quantities are tracked in Beanconqueror. Nothing is sent when you save."}
                </Text>

                <YStack gap="$2">
                    <Label>BAG NAME</Label>
                    <TextInput accessibilityLabel="Bag name" value={name} onChangeText={setName}
                               maxLength={BAG_NAME_MAX} style={fieldStyle}/>
                    {!nameOk && <Text fontSize={12} color={palette.danger}>Give this physical bag a name.</Text>}
                </YStack>

                <YStack gap="$2">
                    <Label>BAG SIZE</Label>
                    <XStack gap="$2" flexWrap="wrap" accessibilityRole="radiogroup"
                            accessibilityLabel="Bag size">
                        {presets.map((grams) => (
                            <Chip key={grams} label={`${grams}G`} spoken={`${grams} grams`}
                                  testID={`bag-size-${grams}`}
                                  selected={!custom && sizeGrams === grams}
                                  onPress={() => {
                                      setCustom(false);
                                      setSize(String(grams));
                                      const known = priceFor?.(grams);
                                      if (!priceTyped && known !== undefined) setPrice(String(known));
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
                    {!roastOk && <Text color={palette.danger} fontSize={12}>
                        Check the roast date. It cannot be in the future.
                    </Text>}
                </YStack>

                    <YStack gap="$2" testID="bag-rest-peak">
                        <Label>ESTIMATED WINDOW</Label>
                        <Text fontSize={12} color={palette.dim}>
                            {source === "coffee" ? "Provided with coffee"
                                : source === "user" ? "Your guidance"
                                    : advised.level ? "Estimated peak window" : "Generic estimate"}
                        </Text>
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
                                                       setAdviceEdited(true);
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
                                                       setAdviceEdited(true);
                                                   }}
                                                   style={fieldStyle}/>
                                    </YStack>
                                    <YStack flex={1} gap="$1">
                                        <Label>WINDOW END</Label>
                                        <TextInput accessibilityLabel="Estimated window ends after roasting"
                                                   value={best} keyboardType="number-pad"
                                                   onChangeText={text => {
                                                       setBest(text); setLevel(null); setAdviceEdited(true);
                                                   }} style={fieldStyle}/>
                                    </YStack>
                                </XStack>
                                <Text testID="bag-rest-peak-note" fontSize={12}
                                      color={figuresError === null ? palette.dim : palette.danger}>
                                    {figuresError ?? "Days after the roast date. Pick a roast to fill them in, or type your own."}
                                </Text>
                    </YStack>

                {editingLeft && (
                    <YStack gap="$2">
                        <Label>GRAMS LEFT</Label>
                        <TextInput testID="bag-left-field" accessibilityLabel="Grams left in the bag"
                                   value={left} onChangeText={text => {
                                       setLeft(text); setLeftTouched(true);
                                   }} keyboardType="number-pad"
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
                                <TextInput testID="bag-bean-name-field" accessibilityLabel="Beanconqueror bean name"
                                           value={externalName} onChangeText={setExternalName}
                                           maxLength={BAG_BEAN_NAME_MAX} autoCorrect={false}
                                           placeholderTextColor={palette.placeholder}
                                           style={fieldStyle}/>
                            <Text fontSize={12} color={palette.dim}>
                                Optional. Match the name of this physical bag in Beanconqueror.
                            </Text>
                        </YStack>
                    </>
                )}

                    <YStack gap="$2">
                        <Label>PRICE</Label>
                        <TextInput testID="bag-price-field" accessibilityLabel="Price"
                                   value={price}
                                   onChangeText={(text) => {
                                       setPrice(text);
                                       setPriceTyped(true);
                                   }}
                                   keyboardType="decimal-pad" placeholder="Optional"
                                   placeholderTextColor={palette.placeholder}
                                   style={fieldStyle}/>
                        {!priceOk && (
                            <Text fontSize={12} color={palette.danger}>
                                Enter a price like 24.50.
                            </Text>
                        )}
                    </YStack>

                <ActionButton label={bag === null ? "ADD AND USE BAG" : "SAVE"}
                              spoken={bag === null ? "Add and use bag" : "Save bag"}
                              testID="bag-save" tone={palette.text} filled disabled={!valid}
                              onPress={save}/>
                {bag !== null && (
                    <XStack gap="$2">
                        {bag.finishedAt === undefined && <YStack flex={1}>
                            <ActionButton label="FINISHED" spoken="Mark this bag finished"
                                          testID="bag-sheet-finish" tone={palette.text}
                                          onPress={onFinish}/>
                        </YStack>}
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
