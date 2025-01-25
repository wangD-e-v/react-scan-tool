import type {
  Fiber,
  FiberRoot,
  ReactDevToolsGlobalHook,
  ReactRenderer,
} from 'bippy';

type ReactScanInternals = typeof import('./core/index')['ReactScanInternals'];
type Scan = typeof import('./index')['scan'];

export interface ExtendedReactRenderer extends ReactRenderer {
  overrideHookState?: (
    fiber: Fiber,
    id: string,
    path: Array<unknown>,
    value: unknown,
  ) => void;
  overrideProps?: (fiber: Fiber, path: Array<string>, value: unknown) => void;
}

declare global {
  var __REACT_SCAN__: {
    ReactScanInternals: ReactScanInternals;
  };
  var reactScan: Scan;
  var scheduler: {
    postTask: (cb: unknown, options: { priority: string }) => void;
  };

  type TTimer = NodeJS.Timeout;

  interface Window {
    isReactScanExtension?: boolean;
    reactScan: Scan;
    __REACT_SCAN_TOOLBAR_CONTAINER__?: HTMLDivElement;
  }
}
