import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE, GRINDER_OFF_VALUE} from "@/library/Recipe";
import {DOSE, GRIND_SIZE, RATIO, TEMPERATURE} from "@/library/cardLimits";
import {
    applyQuickEdit,
    canSaveDose,
    cloneRecipe,
    DOSE_PRESETS,
    dosePresets,
    recipeAtDose,
    rescaleDose,
    scaledBypassVolume,
    withoutDose,
    describeAdjustment,
    describeKnobBaseline,
    describeTemperatureBaseline,
    effectiveGrind,
    quickEditBounds,
    quickEditProblems,
    quickEditRecordAdjustments,
} from "@/library/quickEdit";

type CoffeeRecipeOptions = {
    volumes?: number[];
    temperatures?: number[];
    dosage?: number;
    ratio?: number;
    grinder?: boolean;
    grindSize?: number;
};

function coffeeRecipe(
    optionsOrVolumes: CoffeeRecipeOptions | number[] = [30, 105, 105],
    temperatures: number[] = [92, 90, 88]
): Recipe {
    const options = Array.isArray(optionsOrVolumes) ? {} : optionsOrVolumes;
    const volumes = Array.isArray(optionsOrVolumes)
        ? optionsOrVolumes
        : options.volumes ?? [30, 105, 105];
    const stageTemperatures = Array.isArray(optionsOrVolumes)
        ? temperatures
        : options.temperatures ?? temperatures;
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = options.dosage ?? 15;
    recipe.ratio = options.ratio ?? 16;
    recipe.grinder = options.grinder ?? true;
    recipe.grindSize = options.grindSize ?? 50;
    recipe.pours = volumes.map((volume, index) =>
        new Pour(
            index + 1,
            volume,
            stageTemperatures[index] ?? stageTemperatures[stageTemperatures.length - 1],
            30,
            0,
            [POUR_PATTERN.CENTERED, POUR_PATTERN.CIRCULAR, POUR_PATTERN.SPIRAL][index] ??
                POUR_PATTERN.CENTERED,
            0
        )
    );
    recipe.backup = [1, 2, 3, 4];
    recipe.offline_backup = [5, 6, 7, 8];
    recipe.uid = [9, 10, 11, 12];
    return recipe;
}

function teaRecipe(): Recipe {
    const recipe = coffeeRecipe([50, 50, 50], [85, 84, 83]);
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 30;
    return recipe;
}

describe("cloneRecipe", () => {
    it("round-trips to an independent recipe and preserves card restore bytes", () => {
        const original = coffeeRecipe();
        const clone = cloneRecipe(original);

        expect(clone).not.toBe(original);
        expect(clone.pours[0]).not.toBe(original.pours[0]);
        expect(clone.pours.map((pour) => pour.volume)).toEqual([30, 105, 105]);
        expect(clone.backup).toEqual([1, 2, 3, 4]);
        expect(clone.offline_backup).toEqual([5, 6, 7, 8]);
        expect(clone.uid).toEqual([9, 10, 11, 12]);

        clone.pours[0].volume = 40;
        clone.backup[0] = 99;

        expect(original.pours[0].volume).toBe(30);
        expect(original.backup).toEqual([1, 2, 3, 4]);
    });
});

describe("applyQuickEdit", () => {
    it("applies dose as an absolute value and rescales stages", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {dose: 20});

        expect(edited.dosage).toBe(20);
        expect(edited.ratio).toBe(16);
        expect(edited.getPourTotalVolume()).toBe(320);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("applies ratio as an absolute whole value and rescales stages", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {ratio: 18});

        expect(edited.dosage).toBe(15);
        expect(edited.ratio).toBe(18);
        expect(edited.getPourTotalVolume()).toBe(270);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("applies grind as an absolute value without changing volumes", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {grind: 62});

        expect(edited.grinder).toBe(true);
        expect(edited.grindSize).toBe(62);
        expect(edited.getPourTotalVolume()).toBe(240);
    });

    it("passes grinder off through unchanged", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {grind: GRINDER_OFF_VALUE});

        expect(edited.grinder).toBe(false);
        expect(edited.grindSize).toBe(GRINDER_OFF_VALUE);
    });

    it("ignores grind adjustments for tea because tea brews without the grinder", () => {
        const edited = applyQuickEdit(teaRecipe(), {grind: 62});

        expect(edited.grindSize).toBe(50);
        expect(edited.grinder).toBe(true);
    });

    it("applies a positive temperature offset to every stage", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {tempOffset: 3});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([95, 93, 91]);
        expect(edited.getPourTotalVolume()).toBe(240);
    });

    it("saturates a positive temperature offset at the upper bound", () => {
        const edited = applyQuickEdit(coffeeRecipe([80, 80, 80], [97, 98, 99]), {tempOffset: 5});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([99, 99, 99]);
    });

    it("moves stages that can still move when other stages saturate", () => {
        const edited = applyQuickEdit(coffeeRecipe([80, 80, 80], [97, 95, 90]), {tempOffset: 3});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([99, 98, 93]);
    });

    it("saturates a negative temperature offset at the lower bound", () => {
        const edited = applyQuickEdit(coffeeRecipe([80, 80, 80], [39, 40, 41]), {tempOffset: -5});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([39, 39, 39]);
    });

    it("applies dose and ratio together once and rescales to their combined target", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {dose: 20, ratio: 18});

        expect(edited.dosage).toBe(20);
        expect(edited.ratio).toBe(18);
        expect(edited.getPourTotalVolume()).toBe(360);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("returns an equal but distinct recipe for an empty adjustment", () => {
        const original = coffeeRecipe();
        const edited = applyQuickEdit(original, {});

        expect(edited).not.toBe(original);
        expect(edited.pours[0]).not.toBe(original.pours[0]);
        expect(edited).toEqual(original);
    });

    it("does not mutate its argument", () => {
        const original = coffeeRecipe();

        applyQuickEdit(original, {dose: 20, ratio: 18, grind: 65, tempOffset: 5});

        expect(original.dosage).toBe(15);
        expect(original.ratio).toBe(16);
        expect(original.grindSize).toBe(50);
        expect(original.pours.map((pour) => pour.temperature)).toEqual([92, 90, 88]);
        expect(original.pours.map((pour) => pour.volume)).toEqual([30, 105, 105]);
    });

    it("ignores ratio adjustments for tea because tea derives ratio from fixed stage volumes", () => {
        const edited = applyQuickEdit(teaRecipe(), {ratio: 20});

        expect(edited.pours.map((pour) => pour.volume)).toEqual([50, 50, 50]);
        expect(edited.ratio).toBe(30);
        expect(edited.isPourVolumeValid()).toBe(true);
    });
});

describe("quickEditBounds", () => {
    it("lets temperature offsets travel while at least one stage can still move", () => {
        expect(quickEditBounds(coffeeRecipe())).toEqual({
            dose: DOSE,
            ratio: RATIO,
            grind: {...GRIND_SIZE, off: GRINDER_OFF_VALUE},
            tempOffset: {min: TEMPERATURE.min - 92, max: TEMPERATURE.max - 88},
        });
    });

    it("narrows tea dose to ten grams", () => {
        expect(quickEditBounds(teaRecipe()).dose).toEqual({min: DOSE.min, max: 10});
    });

    it("marks ratio unavailable for tea", () => {
        expect(quickEditBounds(teaRecipe()).ratio).toBeNull();
    });

    it("marks grind unavailable for tea", () => {
        expect(quickEditBounds(teaRecipe()).grind).toBeNull();
    });
});

describe("quickEditRecordAdjustments", () => {
    it("stores the effective saved grind when the grinder was off", () => {
        const saved = coffeeRecipe();
        saved.grinder = false;
        saved.grindSize = 50;

        expect(effectiveGrind(saved)).toBe(GRINDER_OFF_VALUE);
        expect(quickEditRecordAdjustments(saved, {grind: 50})).toEqual({
            adjustedFromGrind: GRINDER_OFF_VALUE
        });
    });

    it("ignores grind metadata for tea", () => {
        expect(quickEditRecordAdjustments(teaRecipe(), {grind: 62})).toBeUndefined();
    });
});

describe("describeKnobBaseline", () => {
    it("says what the recipe's dose is", () => {
        const recipe = coffeeRecipe({dosage: 18});
        expect(describeKnobBaseline(recipe, "dose", 1)).toBe("recipe 18 g");
    });

    it("says what the recipe's ratio is", () => {
        const recipe = coffeeRecipe({ratio: 16});
        expect(describeKnobBaseline(recipe, "ratio", 1)).toBe("recipe 16");
    });

    it("says OFF where the recipe does not grind", () => {
        const recipe = coffeeRecipe({grinder: false, grindSize: 65});
        expect(describeKnobBaseline(recipe, "grind", 1)).toBe("recipe OFF");
    });

    it("keeps the latent grind size out of it", () => {
        // The grinder toggle does not clear `grindSize`, so a recipe that does
        // not grind still carries a number. The baseline must report what the
        // machine would do, not what the field happens to hold.
        const recipe = coffeeRecipe({grinder: true, grindSize: 65});
        expect(describeKnobBaseline(recipe, "grind", 1)).toBe("recipe 65");
    });

    it("drops the word at a large font scale, like the temperature baseline", () => {
        const recipe = coffeeRecipe({dosage: 18});
        expect(describeKnobBaseline(recipe, "dose", 1.4)).toBe("18 g");
    });
});

describe("quickEditProblems", () => {
    it("reports coffee ratio adjustments that rescale a stage beyond the card limit", () => {
        const problems = quickEditProblems(coffeeRecipe(), {ratio: RATIO.max});

        expect(problems).toEqual(expect.arrayContaining([
            "Stage 2 pours 656 ml. The most is 240 ml.",
            "Stage 3 pours 656 ml. The most is 240 ml.",
        ]));
    });

    it("reports tea dose adjustments that derive an out-of-range ratio", () => {
        const recipe = teaRecipe();
        recipe.pours = [
            new Pour(1, 50, 85, 30, 0, POUR_PATTERN.CENTERED, 0),
            new Pour(2, 50, 84, 30, 0, POUR_PATTERN.CIRCULAR, 0),
            new Pour(3, 50, 83, 30, 0, POUR_PATTERN.SPIRAL, 0),
        ];

        const problems = quickEditProblems(recipe, {dose: DOSE.min});

        expect(problems).toContain("The ratio is 1:270. The range is 1:5-1:100.");
    });

    it("reports no problems for an ordinary in-range adjustment", () => {
        expect(quickEditProblems(coffeeRecipe(), {dose: 16, ratio: 15, tempOffset: 1, grind: 55}))
            .toEqual([]);
    });
});

describe("describeAdjustment", () => {
    it("explains the downstream total when dose changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {dose: 20}))
            .toBe("Stage volumes rescale to 320 ml to match the new dose.");
    });

    it("explains the downstream total when ratio changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {ratio: 18}))
            .toBe("Stage volumes rescale to 270 ml to match the new ratio.");
    });

    it("explains dose and ratio together once", () => {
        expect(describeAdjustment(coffeeRecipe(), {dose: 20, ratio: 18}))
            .toBe("Stage volumes rescale to 360 ml to match the new dose and ratio.");
    });

    it("does not explain grind or temperature changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {grind: 60, tempOffset: 2})).toBeNull();
    });

    it("does not explain an empty adjustment", () => {
        expect(describeAdjustment(coffeeRecipe(), {})).toBeNull();
    });
});

describe("describeTemperatureBaseline", () => {
    it("lists a single stage with the recipe prefix below the font cap", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([240], [88]), 1.3))
            .toBe("recipe 88 °C");
    });

    it("lists three distinct stages from the short side of the boundary", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 90, 92]), 1.3))
            .toBe("recipe 88, 90, 92 °C");
    });

    it("collapses an all-identical three-stage list", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 88]), 1.3))
            .toBe("recipe 88 °C");
    });

    it("keeps partially repeated values in a three-stage list", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 90]), 1.3))
            .toBe("recipe 88, 88, 90 °C");
    });

    it("drops the recipe prefix for a three-stage list at the font cap", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 90]), 1.4))
            .toBe("88, 88, 90 °C");
    });

    it("collapses four stages to a range from the long side of the boundary", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([60, 60, 60, 60], [80, 85, 88, 90]), 1.4))
            .toBe("recipe 80 to 90 °C");
    });

    it("uses one value when every stage shares a temperature", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([60, 60, 60, 60], [88, 88, 88, 88]), 1.4))
            .toBe("88 °C");
    });

    it("formats the baseline at the display boundary in Fahrenheit", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 90, 92]), 1.3, "F"))
            .toBe("recipe 190, 194, 198 °F");
    });
});

describe("dose switch", () => {
    function withBypass(volume: number, recipe: Recipe = coffeeRecipe()): Recipe {
        recipe.bypassEnabled = true;
        recipe.bypassVolume = volume;
        recipe.bypassTemp = 80;
        return recipe;
    }

    describe("dosePresets", () => {
        it("offers the common sizes plus the recipe's own dose, in order", () => {
            expect(DOSE_PRESETS).toEqual([15, 18, 20]);
            expect(dosePresets(coffeeRecipe({dosage: 15}))).toEqual([15, 18, 20]);
            expect(dosePresets(coffeeRecipe({dosage: 12}))).toEqual([12, 15, 18, 20]);
            expect(dosePresets(coffeeRecipe({dosage: 25}))).toEqual([15, 18, 20, 25]);
        });

        it("offers none for tea, whose water does not follow the dose", () => {
            expect(dosePresets(teaRecipe())).toEqual([]);
        });
    });

    describe("scaledBypassVolume", () => {
        it("scales in proportion and rounds to whole millilitres", () => {
            expect(scaledBypassVolume(30, 15, 18)).toEqual({volume: 36, clipped: false});
            expect(scaledBypassVolume(25, 18, 15)).toEqual({volume: 21, clipped: false});
            expect(scaledBypassVolume(4, 20, 5)).toEqual({volume: 1, clipped: false});
        });

        it("holds the volume at the bypass limits and says it was clipped", () => {
            expect(scaledBypassVolume(450, 15, 20)).toEqual({volume: 500, clipped: true});
            expect(scaledBypassVolume(2, 31, 1)).toEqual({volume: 1, clipped: true});
        });

        it("leaves the volume alone when the old dose cannot be divided by", () => {
            expect(scaledBypassVolume(30, 0, 18)).toEqual({volume: 30, clipped: false});
        });
    });

    describe("applyQuickEdit with a new dose", () => {
        it("scales every stage at a fixed ratio and keeps temperatures, pauses and patterns", () => {
            const saved = coffeeRecipe({volumes: [30, 105, 105], dosage: 15});
            saved.pours[1].pauseTime = 20;

            const edited = applyQuickEdit(saved, {dose: 18});

            expect(edited.ratio).toBe(16);
            expect(edited.pours.map((pour) => pour.volume)).toEqual([36, 126, 126]);
            expect(edited.getPourTotalVolume()).toBe(18 * 16);
            expect(edited.pours.map((pour) => pour.temperature)).toEqual([92, 90, 88]);
            expect(edited.pours.map((pour) => pour.pauseTime)).toEqual([0, 20, 0]);
            expect(edited.pours.map((pour) => pour.pourPattern))
                .toEqual(saved.pours.map((pour) => pour.pourPattern));
        });

        it("rounds uneven stages to whole millilitres that still add up", () => {
            const saved = coffeeRecipe({volumes: [45, 95, 100], dosage: 15});

            const edited = applyQuickEdit(saved, {dose: 20});

            for (const pour of edited.pours) {
                expect(Number.isInteger(pour.volume)).toBe(true);
            }
            expect(edited.getPourTotalVolume()).toBe(320);
        });

        it("scales the bypass with the dose and keeps its temperature", () => {
            const saved = withBypass(30, coffeeRecipe({dosage: 15}));

            const edited = applyQuickEdit(saved, {dose: 18});

            expect(edited.bypassVolume).toBe(36);
            expect(edited.bypassTemp).toBe(80);
            expect(saved.bypassVolume).toBe(30);
        });

        it("leaves the bypass alone when only the ratio moves", () => {
            const edited = applyQuickEdit(withBypass(30), {ratio: 17});

            expect(edited.bypassVolume).toBe(30);
        });

        it("leaves a switched-off bypass volume alone", () => {
            const saved = coffeeRecipe({dosage: 15});
            saved.bypassVolume = 30;

            expect(applyQuickEdit(saved, {dose: 18}).bypassVolume).toBe(30);
        });

        it("refuses a dose that pushes a stage past the machine's per-stage limit", () => {
            const saved = coffeeRecipe({volumes: [40, 200], dosage: 15});

            expect(quickEditProblems(saved, {dose: 20}))
                .toContain("Stage 2 pours 267 ml. The most is 240 ml.");
            expect(quickEditProblems(saved, {dose: 18})).toEqual([]);
        });
    });

    describe("describeAdjustment with a bypass", () => {
        it("gives the bypass and the whole cup once the dose moves", () => {
            const saved = withBypass(30, coffeeRecipe({dosage: 15}));

            expect(describeAdjustment(saved, {dose: 18})).toBe(
                "Stage volumes rescale to 288 ml to match the new dose. " +
                "Bypass water rescales to 36 ml, so the cup gets 324 ml."
            );
        });

        it("says when the bypass was held at its limit", () => {
            const saved = withBypass(450, coffeeRecipe({dosage: 15}));

            expect(describeAdjustment(saved, {dose: 20})).toBe(
                "Stage volumes rescale to 320 ml to match the new dose. " +
                "Bypass water stops at 500 ml, the most it can be, so the cup gets 820 ml."
            );
        });

        it("says nothing about the bypass for a ratio change", () => {
            expect(describeAdjustment(withBypass(30), {ratio: 17}))
                .toBe("Stage volumes rescale to 255 ml to match the new ratio.");
        });
    });

    describe("saving a dose", () => {
        it("rescaleDose changes the recipe in place the way a quick edit would", () => {
            const recipe = withBypass(30, coffeeRecipe({dosage: 15}));
            const quick = applyQuickEdit(recipe, {dose: 18});

            rescaleDose(recipe, 18);

            expect(recipe.dosage).toBe(18);
            expect(recipe.pours.map((pour) => pour.volume))
                .toEqual(quick.pours.map((pour) => pour.volume));
            expect(recipe.bypassVolume).toBe(36);
        });

        it("recipeAtDose returns a scaled copy and leaves the original unchanged", () => {
            const original = coffeeRecipe({dosage: 15});

            const scaled = recipeAtDose(original, 18);

            expect(scaled).not.toBe(original);
            expect(scaled.uuid).toBe(original.uuid);
            expect(scaled.dosage).toBe(18);
            expect(original.dosage).toBe(15);
            expect(original.pours.map((pour) => pour.volume)).toEqual([30, 105, 105]);
            expect(scaled.backup).toEqual(original.backup);
        });

        it("canSaveDose needs a changed, brewable dose on coffee", () => {
            const saved = coffeeRecipe({volumes: [40, 200], dosage: 15});

            expect(canSaveDose(saved, {})).toBe(false);
            expect(canSaveDose(saved, {dose: 15})).toBe(false);
            expect(canSaveDose(saved, {dose: 18})).toBe(true);
            expect(canSaveDose(saved, {dose: 20})).toBe(false);
            expect(canSaveDose(teaRecipe(), {dose: 7})).toBe(false);
        });

        it("judges only the dose, not the other one-brew changes", () => {
            expect(canSaveDose(coffeeRecipe({dosage: 15}), {dose: 18, ratio: 100})).toBe(true);
        });

        it("withoutDose keeps every other adjustment", () => {
            expect(withoutDose({dose: 18, ratio: 17, tempOffset: -2}))
                .toEqual({ratio: 17, tempOffset: -2});
        });
    });
});
