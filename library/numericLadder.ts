export type NumericLadder = {min: number; max: number; step: number};

export function validNumericPolicy({min, max, step}: NumericLadder): boolean {
    return [min, max, step].every(Number.isFinite) && min <= max && step > 0;
}

/** Value-space tolerance, bounded absolutely and relative to one rung. */
export function onNumericLadder(value: number, {min, max, step}: NumericLadder): boolean {
    const index = Math.round((value - min) / step);
    const nearest = min + index * step;
    const tolerance = Math.min(
        1e-9, step * 1e-9,
        Number.EPSILON * 8 * Math.max(1, Math.abs(value), Math.abs(min), Math.abs(nearest))
    );
    return Number.isFinite(value) && value >= min && value <= max
        && Number.isSafeInteger(index) && Number.isFinite(nearest)
        && Math.abs(value - nearest) <= tolerance;
}

function lastIndex(policy: NumericLadder): number {
    const count = (policy.max - policy.min) / policy.step;
    return onNumericLadder(policy.max, policy) ? Math.round(count) : Math.floor(count);
}

/** Editing needs representable indices, not an enumerated or capped array. */
export function editableNumericLadder(policy: NumericLadder): boolean {
    return validNumericPolicy(policy) && Number.isSafeInteger(lastIndex(policy));
}

function decimals(value: number): number {
    const [coefficient, exponent = "0"] = String(value).split("e");
    return Math.max(0, (coefficient.split(".")[1] ?? "").length - Number(exponent));
}

function rung(policy: NumericLadder, index: number): number {
    if (!editableNumericLadder(policy)) throw new Error("Numeric ladder cannot be edited safely.");
    const bounded = Math.max(0, Math.min(lastIndex(policy), index));
    const raw = policy.min + bounded * policy.step;
    const rounded = Number(raw.toFixed(Math.min(100, Math.max(decimals(policy.min), decimals(policy.step)))));
    if (onNumericLadder(rounded, policy)) return rounded;
    if (onNumericLadder(raw, policy)) return raw;
    throw new Error("Numeric ladder rung cannot be represented safely.");
}

export function snapNumericLadder(value: number, policy: NumericLadder): number {
    return rung(policy, Math.round((value - policy.min) / policy.step));
}

export function stepNumericLadder(value: number, direction: 1 | -1, policy: NumericLadder): number {
    const position = (value - policy.min) / policy.step;
    const index = onNumericLadder(value, policy) ? Math.round(position) + direction
        : direction === 1 ? Math.ceil(position) : Math.floor(position);
    return rung(policy, index);
}
