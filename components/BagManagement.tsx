import {Text} from "tamagui";
import BagSection from "@/components/BagSection";
import BagSheet from "@/components/BagSheet";
import BagPickerSheet from "@/components/BagPickerSheet";
import {SelectedBagRow} from "@/components/SelectedBagRow";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import type {BagManager} from "@/hooks/useBagManager";
import {BAG_BEAN_NAME_MAX, balanceLine, roastDayFromCoffee} from "@/library/coffeeBag";
import {freshnessOf, freshnessProblem} from "@/library/restPeak";
import {httpsUrl} from "@/library/podCoffee";
import type Recipe from "@/library/Recipe";

export function BagChoice({manager}: {manager: BagManager}) {
    const {palette} = useAppearance();
    const {reading} = manager;
    if (reading.status === "off") return null;
    if (reading.status === "error") {
        return <Text accessibilityRole="alert" color={palette.warn} fontSize={12}>{reading.message}</Text>;
    }
    if (!reading.saved || !reading.linked.some(bag => bag.finishedAt === undefined)) return null;
    return <SelectedBagRow label={reading.selected?.name ?? "No bag"}
        detail={reading.balance ? balanceLine(reading.balance) : "Brew without tracking"}
        onPress={manager.choose}/>;
}

export function BagAbout({manager, recipe}: {manager: BagManager; recipe: Recipe}) {
    const {palette} = useAppearance();
    const {reading, now} = manager;
    if (reading.status === "off") return null;
    if (reading.status === "error") {
        return <Text accessibilityRole="alert" color={palette.warn}>{reading.message}</Text>;
    }
    const selected = reading.selected;
    return <BagSection tracker={manager.tracker} saved={reading.saved} bag={selected}
        balance={reading.balance} warning={reading.warning}
        freshness={selected && now !== null ? freshnessOf(selected, now) : null}
        problem={selected && now !== null ? freshnessProblem(selected, now) : null}
        reorderUrl={httpsUrl(recipe.coffee?.url) ?? httpsUrl(recipe.recipeUrl)}
        onOpenSheet={() => { if (selected) manager.edit(selected); }}
        onChoose={manager.choose} onInventory={manager.inventory}
        onUnlink={selected ? manager.unlink : undefined}
        onFinish={manager.finish} onReorder={manager.reorder}/>;
}

export function BagManagementSheets({manager, recipe}: {manager: BagManager; recipe: Recipe | null}) {
    const {palette} = useAppearance();
    const {reading, panel, formBag} = manager;
    function onOpenChange(open: boolean) { if (!open) manager.close(); }
    if (reading.status === "off" || panel.kind === "closed") return null;
    const missing = panel.kind === "form" && panel.id !== null && formBag === null;
    if (reading.status === "error" || missing) {
        return <XbrwSheet open onOpenChange={onOpenChange} title="Coffee bags" heightPercent={35}>
            <Text accessibilityRole="alert" color={palette.warn} padding="$4">
                {reading.status === "error" ? reading.message : "That bag has been removed."}
            </Text>
        </XbrwSheet>;
    }
    if (panel.kind === "picker") {
        return <BagPickerSheet open onOpenChange={onOpenChange} mode={panel.mode}
            recipeName={recipe?.displayName() ?? "this recipe"}
            linked={reading.linked} all={reading.all} selectedId={reading.selected?.id ?? null}
            summaryFor={manager.summaryFor} onSelect={manager.select}
            onLinkExisting={manager.existing} onAdd={manager.add} onEdit={manager.edit}
            onBack={reading.saved ? manager.choose : undefined}/>;
    }
    return <BagSheet open epoch={manager.epoch} onOpenChange={onOpenChange}
        tracker={manager.tracker} bag={formBag} gramsLeft={panel.gramsLeft}
        coffee={recipe?.coffee} suggestedRoastedOn={roastDayFromCoffee(recipe?.coffee?.roastingDate)}
        beanName={(recipe?.coffee?.name ?? recipe?.displayName() ?? "").slice(0, BAG_BEAN_NAME_MAX)}
        onSave={manager.save} onFinish={manager.finish} onRemove={manager.remove}
        onAddBean={manager.addBean} beanBusy={manager.beanBusy}/>;
}
