import {
    cardWriteProblems,
    DOSE,
    GRIND_SIZE,
    RATIO,
    TEMPERATURE,
    type Range,
} from "@/library/cardLimits";
import {BYPASS_VOLUME, clampBypassVolume} from "@/library/bypassLimits";
import Recipe, {GRINDER_OFF_VALUE} from "@/library/Recipe";
import {toDisplay, unitSuffix, type TemperatureUnit} from "@/library/units";

export type QuickEditAdjustments = {
    dose?: number;
    ratio?: number;
    grind?: number;
    tempOffset?: number;
};

export type QuickEditRecordAdjustments = {
    adjustedFromDose?: number;
    adjustedFromRatio?: number;
    adjustedFromGrind?: number;
    adjustedTempOffset?: number;
};

export type QuickEditBounds = {
    dose: Range;
    ratio: Range | null;
    grind: (Range & {off: typeof GRINDER_OFF_VALUE}) | null;
    tempOffset: Range;
};

export function cloneRecipe(recipe: Recipe): Recipe {
    // Good enough for quick edits: a zero dose would migrate to the default,
    // but zero is already invalid and cannot reach a real brew or card write.
    return new Recipe(undefined, JSON.stringify(recipe));
}

function clamp(value: number, range: Range): number {
    return Math.min(range.max, Math.max(range.min, value));
}

export function applyQuickEdit(recipe: Recipe, adjustments: QuickEditAdjustments): Recipe {
    const edited = cloneRecipe(recipe);

    if (adjustments.grind !== undefined && !edited.isTea()) {
        edited.grindSize = adjustments.grind;
        edited.grinder = adjustments.grind !== GRINDER_OFF_VALUE;
    }

    if (adjustments.tempOffset !== undefined) {
        for (const pour of edited.pours) {
            pour.temperature = clamp(pour.temperature + adjustments.tempOffset, TEMPERATURE);
        }
    }

    if (adjustments.dose !== undefined) {
        scaleBypassForDose(edited, adjustments.dose);
        edited.dosage = adjustments.dose;
    }
    if (adjustments.ratio !== undefined && !edited.isTea()) {
        edited.ratio = adjustments.ratio;
    }
    if (adjustments.dose !== undefined || (adjustments.ratio !== undefined && !edited.isTea())) {
        edited.autoFixPourVolumes();
    }

    return edited;
}

/**
 * The doses offered as one-tap chips beside the dose stepper.
 *
 * Roasters publish one coffee at 15 g and again at 18 g as two recipes, so a
 * library fills with pairs that differ only in size. These are the common
 * sizes, plus the recipe's own dose so there is always a way back. A preset
 * outside the dose range is dropped rather than drawn dead. Tea gets none: its
 * stages are fixed at 90 ml, so a different dose does not scale any water.
 */
export const DOSE_PRESETS: readonly number[] = [15, 18, 20];

export function dosePresets(recipe: Recipe): number[] {
    if (recipe.isTea()) return [];
    const {dose} = quickEditBounds(recipe);
    const offered = DOSE_PRESETS.filter((value) => value >= dose.min && value <= dose.max);
    return [...new Set([...offered, recipe.dosage])].sort((a, b) => a - b);
}

export type ScaledBypass = {
    /** Whole millilitres, inside `BYPASS_VOLUME`. */
    volume: number;
    /** The proportional volume fell outside `BYPASS_VOLUME` and was held at its edge. */
    clipped: boolean;
};

/**
 * Bypass water at a new dose, in proportion to the old one.
 *
 * Bypass is dilution, so a bigger dose needs more of it for the cup to taste
 * the same. It is held inside the range the editor allows rather than refused:
 * the stages are what the machine checks against the dose and ratio, and the
 * bypass never reaches a card. `clipped` lets the panel say it happened.
 */
export function scaledBypassVolume(volume: number, fromDose: number, toDose: number): ScaledBypass {
    if (!Number.isFinite(fromDose) || fromDose <= 0 || !Number.isFinite(toDose)) {
        return {volume, clipped: false};
    }
    const proportional = Math.round(volume * toDose / fromDose);
    const held = clampBypassVolume(proportional);
    return {volume: held, clipped: held !== proportional};
}

/** Scales a live bypass to `dose` in place. Reads the dose before it changes. */
function scaleBypassForDose(recipe: Recipe, dose: number): void {
    if (!recipe.bypassEnabled || recipe.isTea() || dose === recipe.dosage) return;
    recipe.bypassVolume = scaledBypassVolume(recipe.bypassVolume, recipe.dosage, dose).volume;
}

/**
 * Change a recipe's dose in place, with the water following it.
 *
 * The same arithmetic a quick-edit dose uses, for "Save as this dose": the
 * ratio stays, every stage rescales in proportion and is rounded to whole
 * millilitres that add up to dose times ratio, the bypass scales too, and
 * temperatures, pauses and patterns are left exactly as they were.
 */
export function rescaleDose(recipe: Recipe, dose: number): void {
    scaleBypassForDose(recipe, dose);
    recipe.dosage = dose;
    recipe.autoFixPourVolumes();
}

/** A copy of `recipe` at `dose`, for writing back to the library. */
export function recipeAtDose(recipe: Recipe, dose: number): Recipe {
    const scaled = cloneRecipe(recipe);
    rescaleDose(scaled, dose);
    return scaled;
}

/**
 * Whether the quick-edit dose can become the saved one.
 *
 * Only the dose is saved, so only the dose is judged: a ratio or grind moved
 * for this brew stays a one-brew change and has no say over the recipe.
 */
export function canSaveDose(
    recipe: Recipe,
    adjustments: QuickEditAdjustments
): adjustments is QuickEditAdjustments & {dose: number} {
    return adjustments.dose !== undefined
        && adjustments.dose !== recipe.dosage
        && !recipe.isTea()
        && quickEditProblems(recipe, {dose: adjustments.dose}).length === 0;
}

/** The adjustments left once the dose has been saved into the recipe. */
export function withoutDose(adjustments: QuickEditAdjustments): QuickEditAdjustments {
    const rest = {...adjustments};
    delete rest.dose;
    return rest;
}

export function quickEditRecordAdjustments(
    saved: Recipe,
    adjustments: QuickEditAdjustments
): QuickEditRecordAdjustments | undefined {
    const record: QuickEditRecordAdjustments = {};

    if (adjustments.dose !== undefined && adjustments.dose !== saved.dosage) {
        record.adjustedFromDose = saved.dosage;
    }
    if (adjustments.ratio !== undefined && !saved.isTea() && adjustments.ratio !== saved.ratio) {
        record.adjustedFromRatio = saved.ratio;
    }
    const savedGrind = effectiveGrind(saved);
    if (adjustments.grind !== undefined && !saved.isTea() && adjustments.grind !== savedGrind) {
        record.adjustedFromGrind = savedGrind;
    }
    if (adjustments.tempOffset !== undefined && adjustments.tempOffset !== 0) {
        record.adjustedTempOffset = adjustments.tempOffset;
    }

    return Object.keys(record).length === 0 ? undefined : record;
}

export function effectiveGrind(recipe: Recipe): number {
    return recipe.grinder ? recipe.grindSize : GRINDER_OFF_VALUE;
}

/** How a grind value reads, including the one that means the grinder is off. */
export function describeGrind(value: number): string {
    return value === GRINDER_OFF_VALUE ? "OFF" : String(value);
}

export type QuickEditKnob = "dose" | "ratio" | "grind";

/**
 * What the saved recipe says for one knob.
 *
 * The same shape as `describeTemperatureBaseline`, and for the same reason: a
 * panel that changes a value for one brew has to be able to say what it is
 * changing it from. The leading word goes at a large font scale, where the row
 * is tight and "recipe" is the least load-bearing part of the phrase.
 */
export function describeKnobBaseline(
    recipe: Recipe,
    knob: QuickEditKnob,
    fontScale: number
): string {
    const value = knob === "dose"
        ? `${recipe.dosage} g`
        : knob === "ratio"
            ? String(recipe.ratio)
            : describeGrind(effectiveGrind(recipe));

    return fontScale >= 1.4 ? value : `recipe ${value}`;
}

export function quickEditBounds(recipe: Recipe): QuickEditBounds {
    const temperatures = recipe.pours.map((pour) => pour.temperature);
    const minTemperature = temperatures.length > 0 ? Math.min(...temperatures) : TEMPERATURE.min;
    const maxTemperature = temperatures.length > 0 ? Math.max(...temperatures) : TEMPERATURE.max;

    return {
        // These are the per-knob travel limits. Dose, ratio and stage volumes
        // interact after auto-fix, so quickEditProblems reports whether a
        // chosen combination still makes a brewable recipe.
        dose: {
            min: DOSE.min,
            max: recipe.isTea() ? 10 : DOSE.max,
        },
        ratio: recipe.isTea() ? null : RATIO,
        grind: recipe.isTea() ? null : {
            ...GRIND_SIZE,
            off: GRINDER_OFF_VALUE,
        },
        // Deliberately the range where moving the knob still changes at least
        // one stage. Partial saturation inside that range is intended; the
        // tighter shape-preserving range was considered and rejected.
        tempOffset: {
            min: TEMPERATURE.min - maxTemperature,
            max: TEMPERATURE.max - minTemperature,
        },
    };
}

export function quickEditProblems(
    recipe: Recipe,
    adjustments: QuickEditAdjustments,
    temperatureUnit?: TemperatureUnit
): string[] {
    return cardWriteProblems(applyQuickEdit(recipe, adjustments), temperatureUnit);
}

export function describeAdjustment(
    recipe: Recipe,
    adjustments: QuickEditAdjustments
): string | null {
    const changesDose = adjustments.dose !== undefined;
    const changesRatio = adjustments.ratio !== undefined && !recipe.isTea();

    if (!changesDose && !changesRatio) {
        return null;
    }

    const edited = applyQuickEdit(recipe, adjustments);
    const target = edited.getStageTargetVolume();
    const subject = changesDose && changesRatio
        ? "new dose and ratio"
        : changesDose ? "new dose" : "new ratio";
    const stages = `Stage volumes rescale to ${target} ml to match the ${subject}.`;
    const bypass = describeBypassScale(recipe, adjustments, target);
    return bypass === null ? stages : `${stages} ${bypass}`;
}

/**
 * What a new dose does to the bypass, and so to the cup.
 *
 * Said only when the dose moved and the recipe has a bypass. Without one the
 * stage total is already the whole cup, so a second figure would repeat it.
 */
function describeBypassScale(
    recipe: Recipe,
    adjustments: QuickEditAdjustments,
    stageTotal: number
): string | null {
    const dose = adjustments.dose;
    if (dose === undefined || dose === recipe.dosage || !recipe.bypassEnabled || recipe.isTea()) {
        return null;
    }
    const {volume, clipped} = scaledBypassVolume(recipe.bypassVolume, recipe.dosage, dose);
    const cup = stageTotal + volume;
    if (clipped) {
        const edge = volume >= BYPASS_VOLUME.max ? "the most" : "the least";
        return `Bypass water stops at ${volume} ml, ${edge} it can be, so the cup gets ${cup} ml.`;
    }
    return `Bypass water rescales to ${volume} ml, so the cup gets ${cup} ml.`;
}

type TemperatureBaseline = {pours: {temperature: number}[]};

export function describeTemperatureList(temperatures: number[]): string {
    if (temperatures.length === 0) {
        return "";
    }

    const minTemperature = Math.min(...temperatures);
    const maxTemperature = Math.max(...temperatures);

    if (temperatures.length >= 4 && minTemperature !== maxTemperature) {
        return `${minTemperature} to ${maxTemperature}`;
    }

    // A fully identical list reads as one value; a partially repeated list
    // keeps every stage visible because the repetition is part of the shape.
    return minTemperature === maxTemperature
        ? `${minTemperature}`
        : temperatures.join(", ");
}

export function describeTemperatureBaseline(
    recipe: Recipe | TemperatureBaseline,
    fontScale: number,
    temperatureUnit: TemperatureUnit = "C"
): string {
    const temperatures = recipe.pours.map((pour) => toDisplay(pour.temperature, temperatureUnit));
    if (temperatures.length === 0) {
        return "recipe";
    }

    const values = describeTemperatureList(temperatures);
    const minTemperature = Math.min(...temperatures);
    const maxTemperature = Math.max(...temperatures);
    const rangeSummary = temperatures.length >= 4 && minTemperature !== maxTemperature;
    const valueText = `${values} ${unitSuffix(temperatureUnit)}`;
    return fontScale >= 1.4 && !rangeSummary ? valueText : `recipe ${valueText}`;
}
