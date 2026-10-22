import React from "react";

import BrewRateChart from "@/components/BrewRateChart";
import BrewTrace from "@/components/BrewTrace";
import CompareTrace from "@/components/CompareTrace";
import FlowSparkline from "@/components/FlowSparkline";
import type {FlowPoint} from "@/library/brew/flowRate";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {channelStyle, PLAN_MIN_OPACITY} from "@/library/brew/traceStyle";
import Pour from "@/library/Pour";
import {renderWithProviders, Providers} from "@/test-utils/render";
import {accents, mix, resolveAppearance} from "@/constants/colors";
import {traceAnimationFor} from "@/hooks/useTraceAnimation";
import {THEME_IDS} from "@/library/appearance";
import {processColor, StyleSheet} from "react-native";
import BrewHistoryRow from "@/components/BrewHistoryRow";
import BrewSummary from "@/components/BrewSummary";
import BrewStoryCard from "@/components/BrewStoryCard";
import BrewStageRung from "@/components/BrewStageRung";
import BrewBypassRung from "@/components/BrewBypassRung";
import CompareTable from "@/components/CompareTable";
import {storySummaryBudget} from "@/library/brew/storyCard";
import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * The charts and sparkline must agree about what a channel looks like.
 *
 * `BrewTrace` and `CompareTrace` are separate components on purpose: one draws
 * a brew and the other draws a difference, and folding the second into the
 * first would have put a second brew's worth of branching through every path
 * in a long file. The cost of that decision is drift, and this is the thing
 * that stops it. The drawers read `library/brew/traceStyle.ts`; this asserts
 * that they really do at the rendered SVG host path.
 *
 * If this fails, do not fix it by copying a value from one file to the other.
 * Find the hard-coded stroke that was added and move it into `traceStyle`.
 */

const ACCENT = "#C86A3B";
const SAMPLES: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 15_000, water: 120, cup: 90, pour: 1},
    {at: 30_000, water: 250, cup: 235, pour: 1}
];
const POURS = [
    new Pour(1, 120, 93, 40, 0, 0, 15),
    new Pour(2, 130, 92, 40, 0, 0, 0)
];
const PLAN_PATH = "M0 160 L150 40 L300 0";
const FLOW_SERIES: FlowPoint[] = [
    {at: 1_000, cup: 1, water: 2},
    {at: 1_100, cup: 1.2, water: 2.2},
    {at: 1_200, cup: 1.1, water: 2.1}
];

const CHOICES = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const TRACE_CHOICES = CHOICES.flatMap(choice =>
    [...accents.coffee, ...accents.tea].map(accent => ({...choice, accent})));

function rgb(colour: string | {payload: number}): number[] {
    const value = typeof colour === "string" ? Number(processColor(colour)) : colour.payload;
    return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function composite(foreground: number[], background: number[], opacity: number): number[] {
    return foreground.map((channel, i) => channel * opacity + background[i] * (1 - opacity));
}

function contrast(a: number[], b: number[]): number {
    const luminance = (channels: number[]) => {
        const linear = channels.map(channel => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("historical appearance is presentation, never a history migration", () => {
    it.each(CHOICES)("renders history, record, comparison and story in $theme/$recipeColours", async choice => {
        const appearance = resolveAppearance(choice);
        const canonical = accents.coffee[0];
        const samples = SAMPLES.map(sample => ({...sample}));
        const brew: StoredBrew = {
            id: "history", recipeUuid: "deleted-recipe", recipeName: "Snapshot",
            accent: canonical.toLowerCase(), startedAt: 0, endedAt: 30_000,
            outcome: "done", failure: null, pours: 2, waterTotal: 250,
            cupTotal: 235, heldSeconds: 0, hasStream: true
        };
        const before = JSON.stringify({brew, samples});
        const summary = (
            <BrewSummary recipeName={brew.recipeName} hasStream samples={samples}
                         recipeInputs={{dose: 15, ratio: 16}}
                         stages={POURS} accent={brew.accent} width={360}
                         plannedSeconds={30} water={250} cup={235} seconds={30}
                         activeIndex={2} stageWater={[120, 130]} stalls={[[], []]}
                         stagesUnavailable={false}/>
        );
        const budget = storySummaryBudget({
            width: 360, stages: 2, hasRateChart: false, hasCoffee: false,
            hasRating: false, tags: [], fontScale: 1
        });
        const tree = await renderWithProviders(
            <Providers appearance={choice}>
                <BrewHistoryRow brew={brew} onPress={() => {}}/>
                <BrewStoryCard width={360} budget={budget} summary={summary}
                               when="Snapshot time" accent={brew.accent}
                               rating={0} coffee={null} tags={[]}/>
                <CompareTrace subject={samples} reference={samples} accent={brew.accent}
                              verdict="differed" width={300} height={160} maxT={30} maxV={260}/>
                <CompareTable rows={[]} accent={brew.accent}/>
            </Providers>
        );
        expect(processColor(StyleSheet.flatten(tree.getByTestId("history-row-mark").props.style).backgroundColor))
            .toBe(processColor(appearance.recipe(canonical).fill));
        expect(StyleSheet.flatten(tree.getByTestId("brew-story-card").props.style).backgroundColor)
            .toBe(appearance.palette.base);
        expect(StyleSheet.flatten(tree.getByTestId("brew-capture").props.style).backgroundColor)
            .toBe(appearance.palette.base);
        expect(tree.getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.recipe(canonical).ink)}));
        expect(tree.getByTestId("trace-cup-subject").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.recipe(canonical).cupInk)}));
        expect(tree.getByTestId("trace-cup-reference").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.palette.dim)}));
        expect(tree.getByTestId("trace-cup-subject-ground").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.palette.base)}));
        expect(processColor(StyleSheet.flatten(tree.getByText("250").props.style).color))
            .toBe(processColor(appearance.recipe(canonical).ink));
        expect(StyleSheet.flatten(tree.getByText("235").props.style).color)
            .toBe(appearance.palette.text);
        expect(StyleSheet.flatten(tree.getByText("DOSE").props.style).color)
            .toBe(appearance.palette.dim);
        expect(JSON.stringify({brew, samples})).toBe(before);
    });

    it.each(CHOICES)("keeps missing-stream and not-watched information readable in $theme/$recipeColours", async choice => {
        const appearance = resolveAppearance(choice);
        const brew: StoredBrew = {
            id: "unwatched", recipeUuid: "deleted", recipeName: "Snapshot",
            accent: accents.coffee[0], startedAt: 0, endedAt: 30_000,
            outcome: "done", failure: null, pours: 2, waterTotal: 0,
            cupTotal: 0, heldSeconds: 0, hasStream: false, watched: false
        };
        const before = JSON.stringify(brew);
        const tree = await renderWithProviders(
            <Providers appearance={choice}>
                <BrewHistoryRow brew={brew} onPress={() => {}}/>
                <BrewSummary recipeName="Snapshot" hasStream={false} samples={[]}
                             stages={[]} accent={brew.accent} width={360}
                             plannedSeconds={30} water={250} cup={235} seconds={30}
                             activeIndex={0} stageWater={[]} stalls={[]} stagesUnavailable/>
                <CompareTrace subject={[]} reference={SAMPLES} accent={brew.accent}
                              verdict="differed" width={300} height={160} maxT={30} maxV={260}/>
            </Providers>
        );
        for (const label of ["NOT WATCHED", "NO TRACE KEPT", "Recipe deleted. Stages not available."]) {
            for (const node of tree.getAllByText(label)) {
                expect(StyleSheet.flatten(node.props.style).color).toBe(appearance.palette.dim);
            }
        }
        expect(tree.queryByTestId("trace-cup-subject")).toBeNull();
        expect(tree.getByTestId("trace-cup-reference").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.palette.dim)}));
        expect(JSON.stringify(brew)).toBe(before);
    });

    it.each(["#C86A3B", "tomato", "rgba(120, 80, 40, 0.5)"])("retains legacy snapshot %s without consulting a source recipe", async accent => {
        const appearance = resolveAppearance({theme: "light", recipeColours: "themed"});
        const before = JSON.stringify(SAMPLES);
        const tree = await renderWithProviders(
            <Providers appearance={appearance.choice}>
                <BrewTrace pours={POURS} samples={SAMPLES} accent={accent}
                           width={300} height={160} plannedSeconds={30} compact/>
            </Providers>
        );
        expect(appearance.recipe(accent).canonical).toBe(accent);
        expect(appearance.recipe(accent).fill).toBe(accent);
        expect(tree.getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(appearance.recipe(accent).ink)}));
        expect(JSON.stringify(SAMPLES)).toBe(before);
    });

    it.each(CHOICES)("keeps future stage and bypass information opaque on $theme/$recipeColours", async choice => {
        const tree = await renderWithProviders(
            <Providers appearance={choice}>
                <BrewStageRung pour={POURS[0]} index={0} state="pending"
                               accent={accents.coffee[0]} laneSeconds={60} barHeight={12}
                               delivered={0} pauseElapsed={0} stalls={[]} testID="future-stage"/>
                <BrewBypassRung volume={20} temperature={90} delivered={0} state="pending"
                                accent={accents.coffee[0]} laneSeconds={60} barHeight={12}
                                testID="future-bypass"/>
            </Providers>
        );
        for (const id of ["future-stage", "future-bypass"]) {
            expect(StyleSheet.flatten(tree.getByTestId(id).props.style).opacity ?? 1).toBe(1);
        }
    });

    it.each(TRACE_CHOICES)("keeps actual hatch, selected text and paused plan readable on $theme/$recipeColours/$accent", async choice => {
        const appearance = resolveAppearance(choice);
        const base = rgb(appearance.palette.base);
        const raised = rgb(appearance.palette.raised);
        const pauses = [{from: 1_000, to: 20_000, pour: 1, reason: "overflow" as const}];
        const tree = await renderWithProviders(
            <Providers appearance={choice}>
                <BrewStageRung pour={POURS[0]} index={0} state="active" selected
                               accent={choice.accent} laneSeconds={60} barHeight={12}
                               delivered={0} pauseElapsed={0} stalls={[]}/>
                <CompareTrace subject={SAMPLES} reference={[]} accent={choice.accent}
                              verdict="differed" width={300} height={160} maxT={30} maxV={260}
                              subjectPlan={PLAN_PATH} subjectPauses={pauses}/>
            </Providers>
        );
        for (const kind of ["dim", "bright"]) {
            const stroke = tree.getByTestId(`segment-hatch-1-${kind}-stroke`).props.stroke;
            expect(contrast(rgb(stroke), raised)).toBeGreaterThanOrEqual(3);
        }
        for (const label of ["01", "93°", "0/120 ml"]) {
            const colour = StyleSheet.flatten(tree.getByText(label).props.style).color;
            expect(contrast(rgb(colour), raised)).toBeGreaterThanOrEqual(4.5);
        }
        const band = tree.getByTestId("trace-pause-subject-overflow-0").props;
        const ground = composite(rgb(band.fill), base, band.fillOpacity);
        const plan = tree.getByTestId("trace-plan-subject").props;
        expect(contrast(composite(rgb(plan.stroke), ground, plan.strokeOpacity ?? 1), ground))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(TRACE_CHOICES)("keeps trace information readable over the actual selected, paused and shaded grounds on $theme/$recipeColours/$accent", async choice => {
        const appearance = resolveAppearance(choice);
        const accent = choice.accent;
        const base = rgb(appearance.palette.base);
        const raised = rgb(appearance.palette.raised);
        const tree = await renderWithProviders(
            <Providers appearance={choice}>
                <BrewTrace pours={POURS} stages={POURS} samples={SAMPLES} accent={accent}
                           width={300} height={160} plannedSeconds={30} selectedIndex={0}
                           planHeadAt={0.5} holding
                           bypass={{volume: 20, temperature: 90, delivered: 0,
                               startedAt: null, state: "pending"}}
                           pauseIntervals={[{from: 1_000, to: 20_000, pour: 1, reason: "manual"}]}/>
                <CompareTrace subject={[]} reference={SAMPLES} accent={accent}
                              verdict="differed" width={300} height={160} maxT={30} maxV={260}
                              subjectPlan={PLAN_PATH} referencePlan={PLAN_PATH}/>
            </Providers>
        );
        const band = tree.getByTestId("trace-pause-manual-0").props;
        const fillTop = choice.theme === "blue" ? 0.24 : 0.28;
        const alphaByte = Math.round(fillTop * 255);
        const nativeFill = Number(processColor(appearance.recipe(accent).ink));
        expect(JSON.stringify(tree.toJSON()))
            .toContain(`"gradient":[0,${(nativeFill & 0x00ffffff) | (alphaByte << 24)},`);
        const ground = composite(rgb(appearance.recipe(accent).ink),
            composite(rgb(band.fill), raised, band.fillOpacity), alphaByte / 255);
        const plan = tree.getByTestId("trace-plan").props;
        expect(contrast(composite(rgb(plan.stroke), ground, plan.strokeOpacity), ground))
            .toBeGreaterThanOrEqual(3);
        const label = tree.getByTestId("trace-temp-label-0").props;
        expect(contrast(rgb(label.fill), ground)).toBeGreaterThanOrEqual(4.5);
        for (const id of ["trace-head", "trace-bypass"]) {
            expect(contrast(rgb(tree.getByTestId(id).props.stroke), ground)).toBeGreaterThanOrEqual(3);
        }
        for (const channel of ["water", "cup"]) {
            // The channel's base-colour clearance is an actual SVG underlay,
            // not a contrast calculation against a background it never sees.
            const backing = tree.getByTestId(`trace-${channel}-ground`).props;
            const line = tree.getByTestId(`trace-${channel}`).props;
            expect(rgb(backing.stroke)).toEqual(base);
            expect(backing.strokeWidth).toBeGreaterThan(line.strokeWidth);
            expect(contrast(rgb(line.stroke), rgb(backing.stroke))).toBeGreaterThanOrEqual(3);
        }
        expect(tree.queryByTestId("trace-cup-subject")).toBeNull();
        for (const id of ["trace-plan-subject", "trace-plan-reference",
            "trace-water-reference", "trace-cup-reference"]) {
            const line = tree.getByTestId(id).props;
            expect(contrast(composite(rgb(line.stroke), base, line.strokeOpacity ?? 1), base))
                .toBeGreaterThanOrEqual(3);
        }
    });

    it.each(TRACE_CHOICES)("keeps the actual waking trough readable on $theme/$recipeColours/$accent", async choice => {
        const appearance = resolveAppearance(choice);
        const motion = traceAnimationFor("waking", 0, true, 120);
        expect(motion.opacity).toBe(0.45);
        expect(motion.opacity).toBe(PLAN_MIN_OPACITY);
        const before = JSON.stringify(POURS);
        for (const compact of [true, false]) {
            const tree = await renderWithProviders(
                <Providers appearance={choice}>
                    <BrewTrace pours={POURS} samples={[]} accent={choice.accent}
                               width={300} height={160} plannedSeconds={30} compact={compact}
                               planOpacity={motion.opacity} planDashed={motion.dashed}
                               planColor={mix(appearance.palette.muted,
                                   appearance.recipe(choice.accent).ink, motion.warmth)}/>
                </Providers>
            );
            const plan = tree.getByTestId("trace-plan").props;
            expect(plan.strokeOpacity).toBe(motion.opacity);
            expect(plan.strokeWidth).toBe(1.5);
            expect(plan.strokeDasharray).toEqual(["4", "4"]);
            const base = rgb(appearance.palette.base);
            const ratio = contrast(composite(rgb(plan.stroke), base, plan.strokeOpacity), base);
            expect(ratio).toBeGreaterThanOrEqual(3);
            await tree.unmount();
        }
        expect(JSON.stringify(POURS)).toBe(before);
    });

    it("refits a mounted breathing plan when the appearance changes", async () => {
        const motion = traceAnimationFor("waking", 0, true, 120);
        const draw = (theme: "original" | "light") => (
            <Providers appearance={{theme, recipeColours: "original"}}>
                <BrewTrace pours={POURS} samples={[]} accent={accents.coffee[0]}
                           width={300} height={160} plannedSeconds={30} compact
                           planOpacity={motion.opacity}/>
            </Providers>
        );
        const tree = await renderWithProviders(draw("original"));
        const originalStroke = tree.getByTestId("trace-plan").props.stroke;
        await tree.rerender(draw("light"));
        const plan = tree.getByTestId("trace-plan").props;
        const base = rgb(resolveAppearance({theme: "light", recipeColours: "original"}).palette.base);
        expect(plan.stroke).not.toEqual(originalStroke);
        expect(plan.strokeOpacity).toBe(motion.opacity);
        expect(contrast(composite(rgb(plan.stroke), base, plan.strokeOpacity), base))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(TRACE_CHOICES)("preserves a visible breath above the fitted trough on $theme/$recipeColours/$accent", async choice => {
        const appearance = resolveAppearance(choice);
        const base = rgb(appearance.palette.base);
        const draw = (elapsed: number) => {
            const motion = traceAnimationFor("waking", elapsed, true, 120);
            return (
                <Providers appearance={choice}>
                    <BrewTrace pours={POURS} samples={[]} accent={choice.accent}
                               width={300} height={160} plannedSeconds={30}
                               planOpacity={motion.opacity}
                               planColor={mix(appearance.palette.muted,
                                   appearance.recipe(choice.accent).ink, motion.warmth)}/>
                </Providers>
            );
        };
        const tree = await renderWithProviders(draw(0));
        const trough = tree.getByTestId("trace-plan").props;
        const troughContrast = contrast(composite(rgb(trough.stroke), base, trough.strokeOpacity), base);
        await tree.rerender(draw(1700));
        const peak = tree.getByTestId("trace-plan").props;
        expect(peak.strokeOpacity).toBe(1);
        // Even the peak's ink is safe at the trough: fitting must not undo
        // opacity on each tick and flatten the animation to constant contrast.
        expect(contrast(composite(rgb(peak.stroke), base, PLAN_MIN_OPACITY), base))
            .toBeGreaterThanOrEqual(3);
        expect(contrast(rgb(peak.stroke), base)).toBeGreaterThan(troughContrast);
    });
});

/** The attributes that make a channel recognisable. */
const GRAMMAR = [
    "stroke",
    "strokeWidth",
    "strokeDasharray",
    "strokeLinecap",
    "strokeLinejoin"
] as const;

function styleOf(node: {props: Record<string, unknown>}) {
    return Object.fromEntries(GRAMMAR.map((key) => [key, node.props[key]]));
}

function firstDashLength(value: unknown): number {
    if (typeof value !== "string") return 0;
    if (Array.isArray(value)) return Number(value[0]);
    return Number(value.split(" ")[0]);
}

function firstMarkLength(value: unknown): number {
    if (typeof value !== "string") return 0;
    const match = /l\s*([-\d.]+)\s+0/.exec(value);
    return match ? Number(match[1]) : 0;
}

describe("the two charts draw the same channels the same way", () => {
    it.each([
        ["water", "trace-water", "trace-water-subject"],
        ["cup", "trace-cup", "trace-cup-subject"]
    ])("agrees about %s", async (_channel, single, paired) => {
        const one = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const two = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} />
        );

        expect(styleOf(two.getByTestId(paired)))
            .toEqual(styleOf(one.getByTestId(single)));
    });

    it("agrees about the shared plan line", async () => {
        const one = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const two = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} subjectPlan={PLAN_PATH} />
        );

        expect(styleOf(two.getByTestId("trace-plan-subject")))
            .toEqual(styleOf(one.getByTestId("trace-plan")));
    });

    it.each([
        ["water", "trace-water", "trace-water-reference"],
        ["cup", "trace-cup", "trace-cup-reference"]
    ])("uses the same reference grammar for %s in separate and overlay", async (
        _channel,
        single,
        paired
    ) => {
        const separate = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       role="reference" width={300} height={160}
                       plannedSeconds={30} compact />
        );
        const overlay = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} />
        );

        expect(styleOf(separate.getByTestId(single)))
            .toEqual(styleOf(overlay.getByTestId(paired)));
    });
});

describe("the flow sparkline draws the cup grammar", () => {
    it("matches the rendered cup channel", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const sparkline = await renderWithProviders(
            <FlowSparkline values={[1, 2, 1.5]} accent={ACCENT} />
        );

        expect(styleOf(sparkline.getByTestId(
            "flow-sparkline-path",
            {includeHiddenElements: true}
        )))
            .toEqual(styleOf(trace.getByTestId("trace-cup")));
    });
});

describe("the rate chart draws the shared grammar", () => {
    it("matches the rendered water channel", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const rate = await renderWithProviders(
            <BrewRateChart series={FLOW_SERIES} accent={ACCENT} width={300} maxT={3} />
        );

        expect(styleOf(rate.getByTestId("rate-chart-water")))
            .toEqual(styleOf(trace.getByTestId("trace-water")));
    });

    it("keeps the cup colour and rendered mark length while spacing rate dots by time", async () => {
        const trace = await renderWithProviders(
            <BrewTrace pours={POURS} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const rate = await renderWithProviders(
            <BrewRateChart series={FLOW_SERIES} accent={ACCENT} width={300} maxT={3} />
        );
        const traceCup = styleOf(trace.getByTestId("trace-cup"));
        const rateCup = styleOf(rate.getByTestId("rate-chart-cup"));
        const sharedCup = channelStyle("cup", {accent: ACCENT,
            appearance: resolveAppearance({theme: "original", recipeColours: "original"})});

        expect(rateCup).toEqual({
            ...traceCup,
            strokeDasharray: undefined,
            strokeLinejoin:  undefined
        });
        expect(firstMarkLength(rate.getByTestId("rate-chart-cup").props.d)
            + Number(rateCup.strokeWidth))
            .toBe(firstDashLength(sharedCup.strokeDasharray) + sharedCup.strokeWidth);
    });
});
