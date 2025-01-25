import { signal } from '@preact/signals';
import type {
  Corner,
  WidgetConfig,
  WidgetSettings,
} from './components/widget/types';
import { LOCALSTORAGE_KEY, MIN_SIZE, SAFE_AREA } from './constants';
import { readLocalStorage, saveLocalStorage } from './utils/helpers';

export const signalIsSettingsOpen = signal(false);
export const signalRefWidget = signal<HTMLDivElement | null>(null);

export const defaultWidgetConfig = {
  corner: 'top-left' as Corner,
  dimensions: {
    isFullWidth: false,
    isFullHeight: false,
    width: MIN_SIZE.width,
    height: MIN_SIZE.height,
    position: { x: SAFE_AREA, y: SAFE_AREA },
  },
  lastDimensions: {
    isFullWidth: false,
    isFullHeight: false,
    width: MIN_SIZE.width,
    height: MIN_SIZE.height,
    position: { x: SAFE_AREA, y: SAFE_AREA },
  },
} as WidgetConfig;

export const getInitialWidgetConfig = (): WidgetConfig => {
  const stored = readLocalStorage<WidgetSettings>(LOCALSTORAGE_KEY);
  if (!stored) {
    saveLocalStorage(LOCALSTORAGE_KEY, {
      corner: defaultWidgetConfig.corner,
      dimensions: defaultWidgetConfig.dimensions,
      lastDimensions: defaultWidgetConfig.lastDimensions,
    });

    return defaultWidgetConfig;
  }

  return {
    corner: stored.corner,
    dimensions: {
      isFullWidth: false,
      isFullHeight: false,
      width: MIN_SIZE.width,
      height: MIN_SIZE.height,
      position: stored.dimensions.position,
    },
    lastDimensions: stored.dimensions,
  };
};

export const signalWidget = signal<WidgetConfig>(getInitialWidgetConfig());

export const updateDimensions = (): void => {
  if (typeof window === 'undefined') return;

  const { dimensions } = signalWidget.value;
  const { width, height, position } = dimensions;

  signalWidget.value = {
    ...signalWidget.value,
    dimensions: {
      isFullWidth: width >= window.innerWidth - SAFE_AREA * 2,
      isFullHeight: height >= window.innerHeight - SAFE_AREA * 2,
      width,
      height,
      position,
    },
  };
};
