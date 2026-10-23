import {useRef, useState} from "react";
import {Linking} from "react-native";
import {useCoffeeBag} from "@/hooks/useCoffeeBag";
import {useNow} from "@/hooks/useNow";
import {sharedBagDatabase} from "@/library/CoffeeBagDatabase";
import type CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import {bagEligible, bagRunParam} from "@/library/bagRun";
import {BAG_BEAN_NAME_MAX, balanceLine, dayOf, newBag, reviveBag, type BagTracker, type CoffeeBag} from "@/library/coffeeBag";
import {bagShareBean} from "@/library/brew/handoff/bagBean";
import {beanLink} from "@/library/brew/handoff/beanLink";
import type {BagSheetResult} from "@/components/BagSheet";
import {notify} from "@/components/XbrwToast";
import type Recipe from "@/library/Recipe";

type Panel = {kind: "closed"}
    | {kind: "picker"; mode: "choose" | "existing" | "inventory"}
    | {kind: "form"; id: string | null; gramsLeft: number | null};
const CLOSED: Panel = {kind: "closed"};

export function useBagManager(
    recipe: Recipe | null, enabled: boolean, tracker: BagTracker, open = sharedBagDatabase
) {
    "use no memo";
    // Recipe is the editor's mutable model, not an immutable hook dependency.
    const reading = useCoffeeBag(recipe, enabled, tracker, open);
    const active = enabled && recipe !== null && bagEligible(recipe);
    const uuid = recipe?.uuid ?? "";
    const [scope, setScope] = useState({uuid, active, epoch: 0, panel: CLOSED});
    const sendingBean = useRef(false);
    const [beanBusy, setBeanBusy] = useState(false);
    if (scope.uuid !== uuid || scope.active !== active) {
        setScope({uuid, active, epoch: scope.epoch + 1, panel: CLOSED});
    }
    const panel = scope.uuid === uuid && scope.active === active ? scope.panel : CLOSED;
    const now = useNow(Date.now, active && reading.status === "ready");
    const formBag = reading.status === "ready" && panel.kind === "form" && panel.id !== null
        ? reading.all.find(bag => bag.id === panel.id) ?? null : null;

    function show(next: Panel) {
        setScope(current => ({uuid, active, epoch: current.epoch + 1, panel: next}));
    }
    function close() { show(CLOSED); }
    function perform(work: (store: CoffeeBagDatabase) => void, closes = true) {
        try {
            if (reading.status !== "ready") throw new Error("Coffee bags are unavailable.");
            work(reading.store);
            if (closes) close();
        } catch (error) {
            console.warn("Could not change the coffee bag.", error);
            notify({tone: "error", message: "Could not change the coffee bag. Please try again."});
        }
    }
    function requireSaved() {
        if (reading.status !== "ready" || !reading.saved) {
            notify({tone: "info", message: "Save this recipe before linking a bag. You can still brew without tracking."});
            return false;
        }
        return true;
    }
    function choose() { if (requireSaved()) show({kind: "picker", mode: "choose"}); }
    function inventory() { show({kind: "picker", mode: "inventory"}); }
    function existing() { if (requireSaved()) show({kind: "picker", mode: "existing"}); }
    function add() { if (requireSaved()) show({kind: "form", id: null, gramsLeft: null}); }
    function edit(bag: CoffeeBag) {
        perform(store => {
            const balance = store.balance(bag.id, recipe?.dosage ?? 0, tracker);
            show({kind: "form", id: bag.id,
                gramsLeft: balance.kind === "estimate" ? balance.remainingGrams : null});
        }, false);
    }
    function select(id: string | null) {
        perform(store => store.select(uuid, id, Date.now()));
    }
    function detailsFor(result: BagSheetResult, previous: CoffeeBag | null) {
        return {
            name: result.name, sizeGrams: result.sizeGrams,
            boughtOn: previous?.boughtOn ?? dayOf(Date.now()), roastedOn: result.roastedOn,
            price: result.price, beanName: result.beanName,
            ...result.figures, adviceSource: result.adviceSource
        };
    }
    function save(result: BagSheetResult) {
        perform(store => {
            if (panel.kind !== "form") throw new Error("Open a bag before saving it.");
            const previous = panel.id === null ? null : store.get(panel.id);
            if (panel.id !== null && previous === null) throw new Error("That bag has been removed.");
            const details = detailsFor(result, previous);
            if (previous === null) store.createAndSelect(newBag(details), uuid, Date.now());
            else store.editAndCorrect({...previous, ...details}, result.gramsLeft);
        });
    }
    async function addBean(result: BagSheetResult) {
        if (sendingBean.current) return;
        sendingBean.current = true;
        setBeanBusy(true);
        let opened = false;
        try {
            if (reading.status !== "ready" || recipe === null || tracker !== "beanconqueror"
                || panel.kind !== "form" || panel.id === null) throw new Error("Open a saved bag first.");
            const saved = reading.store.get(panel.id);
            if (saved === null) throw new Error("That bag has been removed.");
            const name = result.beanName?.trim();
            if (!name || name.length > BAG_BEAN_NAME_MAX) throw new Error("Confirm the external bean name.");
            const bag = reviveBag({...saved, ...detailsFor(result, saved), beanName: name});
            if (bag === null) throw new Error("The bag details are invalid.");
            await Linking.openURL(beanLink(bagShareBean(recipe, bag, name)));
            opened = true;
            reading.store.editAndCorrect(bag, result.gramsLeft);
            notify({tone: "info", message: "Opened Beanconqueror's add-bean screen. Confirm the bag there."});
            close();
        } catch (error) {
            console.warn("Could not open or save the Beanconqueror bag.", error);
            notify({tone: "error", message: opened
                ? "Beanconqueror opened, but the bag could not be saved here. Check it before trying again."
                : "Could not open this bag in Beanconqueror. Check the bag details and that Beanconqueror is installed."});
        } finally {
            sendingBean.current = false;
            setBeanBusy(false);
        }
    }
    function currentId() {
        const id = panel.kind === "form" ? panel.id
            : reading.status === "ready" ? reading.selected?.id : null;
        if (id == null) throw new Error("Choose a bag first.");
        return id;
    }
    function finish() { perform(store => store.finish(currentId(), Date.now())); }
    function remove() { perform(store => store.remove(currentId())); }
    function unlink() { perform(store => store.unlink(uuid, currentId())); }
    function summaryFor(bag: CoffeeBag): string {
        try {
            if (reading.status !== "ready") throw new Error("Coffee bags are unavailable.");
            return balanceLine(reading.store.balance(bag.id, recipe?.dosage ?? 0, tracker));
        } catch (error) {
            console.warn("Could not read the bag quantity.", error);
            return "Quantity unavailable. Check this bag.";
        }
    }
    function paramsFor(brewing: Recipe): {bagSelection?: string} {
        if (!enabled || !bagEligible(brewing)) return {};
        try {
            return {bagSelection: bagRunParam(open().selection(brewing.uuid)?.bagId ?? null)};
        } catch (error) {
            console.warn("Could not read the bag selected for brewing.", error);
            notify({tone: "error", message: "The selected bag could not be read. This brew will not be tracked."});
            return {bagSelection: bagRunParam(null)};
        }
    }
    function reorder(url: string) {
        void Linking.openURL(url).catch(error => {
            console.warn("Could not open the coffee's page.", error);
            notify({tone: "error", message: "Could not open the coffee's page."});
        });
    }
    return {
        reading, tracker, now, panel, epoch: scope.epoch, formBag,
        covered: active && panel.kind !== "closed",
        choose, inventory, existing, add, edit, select, save, finish, remove, unlink,
        summaryFor, paramsFor, reorder, close, addBean, beanBusy
    };
}

export type BagManager = ReturnType<typeof useBagManager>;
