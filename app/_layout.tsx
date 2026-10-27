import {useFonts} from 'expo-font';
import {DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider} from 'expo-router';
import React, {useEffect, useRef, useState} from 'react';
import {Platform, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {TamaguiProvider} from 'tamagui';
import config from '../tamagui.config' // your configuration
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Toasts} from '@backpackapp-io/react-native-toast';
import {StatusBar} from 'expo-status-bar';
import {NavigationBar} from 'expo-navigation-bar';
import {ShareIntentProvider} from 'expo-share-intent';
import SplashOverlay from '@/components/SplashOverlay';
import {startMachineLink} from '@/hooks/useMachine';
import LiveBrewBar from '@/components/LiveBrewBar';
import RouteWatcher from '@/components/RouteWatcher';
import {LiveBrewProvider} from '@/hooks/useLiveBrew';
import {sharedBrewDatabase, sweepOnLaunch} from '@/hooks/useBrewHistory';
import {useSetting} from '@/hooks/useSetting';
import {useRoasterForegroundSync} from '@/hooks/useRoasterForegroundSync';
import {AppearanceProvider, useAppearance} from '@/hooks/useAppearance';
import {useNativeAppearance} from '@/hooks/useNativeAppearance';
import {notify} from '@/components/XbrwToast';


// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Hoisted to module scope so it is one stable identity, not a fresh object each
// render. `useShareIntent` re-runs its `refreshShareIntent` effect on
// `[url, options.disabled]`, so an inline literal here re-invoked the native
// refresh on every render -- one of the paths by which the same share intent was
// re-delivered and imported twice.
const shareIntentOptions = {
    debug:             false,
    resetOnBackground: true
};

export default function RootLayout() {
    useRoasterForegroundSync();
    const [loaded] = useFonts({
        SpaceMono:        require('../assets/fonts/SpaceMono-Regular.ttf'),
        "Doto-Bold":      require('../assets/fonts/Doto-Bold.ttf'),
        "Doto-ExtraBold": require('../assets/fonts/Doto-ExtraBold.ttf')
    });

    // Having paired a machine, the user expects it to be there. Doing this at
    // the root rather than from a screen matters: Settings holds the only
    // `useMachine` on a normal launch path, so a user who never opens it would
    // never be connected. Silent when nothing has been paired.
    useEffect(() => {
        startMachineLink();
    }, []);

    const [budgetMB] = useSetting("brewTraceBudgetMB");

    // A changed budget does not repeat the launch sweep. Finished brews also
    // sweep after their records have been saved.
    const sweptRef = useRef(false);
    useEffect(() => {
        if (sweptRef.current) return;
        sweptRef.current = true;
        sweepOnLaunch(sharedBrewDatabase(), budgetMB);
    }, [budgetMB]);

    if (!loaded) {
        return null;
    }

    return (
        <ShareIntentProvider options={shareIntentOptions}>
            <GestureHandlerRootView style={{flex: 1}}>
                <TamaguiProvider config={config} defaultTheme="dark">
                    <AppearanceProvider onInvalidPreferences={notify}>
                        <AppFrame/>
                    </AppearanceProvider>
                </TamaguiProvider>
            </GestureHandlerRootView>
        </ShareIntentProvider>
    );
}

function AppFrame() {
    const appearance = useAppearance();
    const {scheme, palette} = appearance;
    useNativeAppearance(appearance);
    const [splashDone, setSplashDone] = useState(false);
    const navigationBase = scheme === "light" ? DefaultTheme : DarkTheme;
    const navigationTheme = {
        ...navigationBase,
        colors: {
            ...navigationBase.colors,
            background: palette.base,
            card: palette.base,
            text: palette.text,
            border: palette.line,
            primary: palette.text,
            notification: palette.danger
        }
    };

    // This frame mounts only after fonts and synchronous preferences are ready.
    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <SafeAreaProvider>
            <ThemeProvider value={navigationTheme}>
                {/* A plain view, not a SafeAreaView. Insetting
                    here inset every screen on every edge, which
                    left the app floating in black bars: the list
                    stopped short of the bottom of the display and
                    the editor's accent slab began below the status
                    bar instead of running up behind it. The insets
                    are applied as padding by the surfaces that
                    actually need them, so backgrounds can reach the
                    edges while their contents do not. */}
                <View style={{flex: 1, backgroundColor: palette.base}}>
                    <LiveBrewProvider>
                        <Stack
                            screenOptions={{
                                headerStyle:      {
                                    backgroundColor: palette.base
                                },
                                headerTintColor:  palette.text,
                                headerTitleStyle: {
                                    fontWeight: 'bold'
                                }
                            }}>
                            <Stack.Screen name="index" options={{}}/>
                            {/* The editor draws its own header,
                                on the accent, inside RecipeHero.
                                Declared here rather than turned
                                off from inside the screen: an
                                effect runs after the first
                                paint, so the native bar it was
                                replacing got one frame to
                                flash. */}
                            <Stack.Screen name="editRecipe"
                                          options={{
                                              headerShown: false,
                                              animation: "slide_from_right"
                                          }}/>
                            {/* These five draw ScreenHeader
                                instead, for the same reason
                                and declared in the same
                                place. */}
                            <Stack.Screen name="settings" options={{headerShown: false}}/>
                            <Stack.Screen name="about" options={{headerShown: false}}/>
                            <Stack.Screen name="licences" options={{headerShown: false}}/>
                            <Stack.Screen name="network" options={{headerShown: false}}/>
                            <Stack.Screen name="machine" options={{headerShown: false}}/>
                            <Stack.Screen name="machineTool" options={{headerShown: false}}/>
                            <Stack.Screen name="machineHome" options={{headerShown: false}}/>
                            <Stack.Screen name="machineSetting" options={{headerShown: false}}/>
                            <Stack.Screen name="easyMode" options={{headerShown: false}}/>
                            <Stack.Screen name="importCloud" options={{headerShown: false}}/>
                            <Stack.Screen name="subscriptions" options={{headerShown: false}}/>
                            <Stack.Screen name="subscription" options={{headerShown: false}}/>
                            <Stack.Screen name="roasters" options={{headerShown: false}}/>
                            <Stack.Screen name="roaster" options={{headerShown: false}}/>
                            <Stack.Screen name="roasterCoffee" options={{headerShown: false}}/>
                            {/* The history list and one brew's
                                record. These were registered
                                nowhere, so they fell through to
                                the default native bar: emptying
                                its title from inside the screen
                                only blanked the words and left
                                the bar itself, a grey strip
                                above the app's own header. */}
                            <Stack.Screen name="brewHistory"
                                          options={{headerShown: false}}/>
                            <Stack.Screen name="brewRecord"
                                          options={{headerShown: false}}/>
                            <Stack.Screen name="brewCompare"
                                          options={{headerShown: false}}/>
                            <Stack.Screen name="hub"
                                          options={{headerShown: false}}/>
                            <Stack.Screen name="hubRecipe"
                                          options={{headerShown: false}}/>
                            {/* The brew screen is the mini bar
                                expanded: it rises from the
                                bottom and a chevron-down puts
                                it back. Declared here rather
                                than nowhere, which is what left
                                it falling through to the
                                default native bar with a
                                `< index` back title. */}
                            <Stack.Screen name="brew"
                                          options={{
                                              headerShown: false,
                                              presentation: "modal",
                                              animation: "slide_from_bottom"
                                          }}/>
                        </Stack>
                        {/* Beside the navigator, not inside a
                            screen: a brew you walked away from
                            has to still be there in Settings. */}
                        {/* Tells the navigation guard which
                            screen a Back press came from. */}
                        <RouteWatcher/>
                        <LiveBrewBar/>
                        <Toasts/>
                        <StatusBar hidden={false} style={scheme === "light" ? "dark" : "light"}/>
                        {Platform.OS === "android" && <NavigationBar style="auto"/>}
                    </LiveBrewProvider>
                </View>
                <SplashOverlay visible={!splashDone}
                               onFinished={() => setSplashDone(true)}/>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
