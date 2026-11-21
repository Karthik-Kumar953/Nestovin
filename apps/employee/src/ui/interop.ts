import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

/**
 * NativeWind maps className only on core components. Register Reanimated's
 * Animated.View so motion wrappers (Stagger, skeletons, cards) take classes.
 * Imported once from the root layout.
 */
cssInterop(Animated.View, { className: 'style' });
