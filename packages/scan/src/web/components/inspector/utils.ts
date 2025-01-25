import {
  type Fiber,
  ReactDevToolsGlobalHook,
  getDisplayName,
  isCompositeFiber,
  isHostFiber,
  traverseFiber,
} from 'bippy';
import { PropsChange, ReactScanInternals, Store } from '~core/index';
import { ChangeReason } from '~core/instrumentation';
import { isEqual } from '~core/utils';
import { batchGetBoundingRects } from '~web/utils/outline';
import { globalInspectorState } from '.';
import type { ExtendedReactRenderer } from '../../../types';
import { safeStringify } from './logging';
import { ensureRecord, isPromise } from './overlay/utils';

interface StateItem {
  name: string;
  value: unknown;
}

// todo, change this to currently focused fiber
export type States =
  | {
      kind: 'inspecting';
      hoveredDomElement: Element | null;
    }
  | {
      kind: 'inspect-off';
    }
  | {
      kind: 'focused';
      focusedDomElement: Element;
    }
  | {
      kind: 'uninitialized';
    };

interface ReactRootContainer {
  _reactRootContainer?: {
    _internalRoot?: {
      current?: {
        child: Fiber;
      };
    };
  };
}

interface ReactInternalProps {
  [key: string]: Fiber;
}

export const getFiberFromElement = (element: Element): Fiber | null => {
  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers) {
      return null;
    }
    for (const [, renderer] of Array.from(hook.renderers)) {
      try {
        const fiber = renderer.findFiberByHostInstance?.(element);
        if (fiber) return fiber;
      } catch {
        // If React is mid-render, references to previous nodes may disappear
      }
    }
  }

  if ('_reactRootContainer' in element) {
    const elementWithRoot = element as unknown as ReactRootContainer;
    const rootContainer = elementWithRoot._reactRootContainer;
    return rootContainer?._internalRoot?.current?.child ?? null;
  }

  for (const key in element) {
    if (
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactFiber')
    ) {
      const elementWithFiber = element as unknown as ReactInternalProps;
      return elementWithFiber[key];
    }
  }
  return null;
};

export const getFirstStateNode = (fiber: Fiber): Element | null => {
  let current: Fiber | null = fiber;
  while (current) {
    if (current.stateNode instanceof Element) {
      return current.stateNode;
    }

    if (!current.child) {
      break;
    }
    current = current.child;
  }

  while (current) {
    if (current.stateNode instanceof Element) {
      return current.stateNode;
    }

    if (!current.return) {
      break;
    }
    current = current.return;
  }
  return null;
};

export const getNearestFiberFromElement = (
  element: Element | null,
): Fiber | null => {
  if (!element) return null;

  try {
    const fiber = getFiberFromElement(element);
    if (!fiber) return null;

    const res = getParentCompositeFiber(fiber);
    return res ? res[0] : null;
  } catch {
    return null;
  }
};

export const getParentCompositeFiber = (fiber: Fiber) => {
  let curr: Fiber | null = fiber;
  let prevHost = null;

  while (curr) {
    if (isCompositeFiber(curr)) {
      return [curr, prevHost] as const;
    }
    if (isHostFiber(curr)) {
      prevHost = curr;
    }
    curr = curr.return;
  }
};

const isFiberInTree = (fiber: Fiber, root: Fiber): boolean => {
  {
    // const root= fiberRootCache.get(fiber) || (fiber.alternate && fiberRootCache.get(fiber.alternate) )
    // if (root){
    //   return root
    // }
    const res = !!traverseFiber(root, (searchFiber) => searchFiber === fiber);

    return res;
  }
};

export const isCurrentTree = (fiber: Fiber) => {
  let curr: Fiber | null = fiber;
  let rootFiber: Fiber | null = null;

  while (curr) {
    // todo: make sure removing null check doesn't break
    // todo: document that fiber stores root in stateNode
    if (!curr.stateNode) {
      curr = curr.return;
      continue;
    }
    // if the app never rendered then fiber roots will always return false, but thats fine since we don't care which
    // fiber we read from when there never has been a re-render
    // todo: document that better
    if (ReactScanInternals.instrumentation?.fiberRoots.has(curr.stateNode)) {
      rootFiber = curr;

      break;
    }

    curr = curr.return;
  }

  if (!rootFiber) {
    return false;
  }

  const fiberRoot = rootFiber.stateNode;
  const currentRootFiber = fiberRoot.current;

  return isFiberInTree(fiber, currentRootFiber);
};

export const getAssociatedFiberRect = async (element: Element) => {
  const associatedFiber = getNearestFiberFromElement(element);

  if (!associatedFiber) return null;
  const stateNode = getFirstStateNode(associatedFiber);
  if (!stateNode) return null;

  const rect = (await batchGetBoundingRects([stateNode])).get(stateNode);
  return rect!;
};

// todo-before-stable(rob): refactor these
export const getCompositeComponentFromElement = (element: Element) => {
  const associatedFiber = getNearestFiberFromElement(element);

  if (!associatedFiber) return {};

  const stateNode = getFirstStateNode(associatedFiber);
  if (!stateNode) return {};
  const parentCompositeFiberInfo = getParentCompositeFiber(associatedFiber);
  if (!parentCompositeFiberInfo) {
    return {};
  }
  const [parentCompositeFiber] = parentCompositeFiberInfo;

  return {
    parentCompositeFiber,
  };
};

export const getCompositeFiberFromElement = (element: Element) => {
  const associatedFiber = getNearestFiberFromElement(element);

  if (!associatedFiber) return {};
  const currentAssociatedFiber = isCurrentTree(associatedFiber)
    ? associatedFiber
    : (associatedFiber.alternate ?? associatedFiber);
  const stateNode = getFirstStateNode(currentAssociatedFiber);
  if (!stateNode) return {};

  const anotherRes = getParentCompositeFiber(currentAssociatedFiber);
  if (!anotherRes) {
    return {};
  }
  let [parentCompositeFiber] = anotherRes;
  parentCompositeFiber =
    (isCurrentTree(parentCompositeFiber)
      ? parentCompositeFiber
      : parentCompositeFiber.alternate) ?? parentCompositeFiber;

  return {
    parentCompositeFiber,
  };
};
export const getChangedPropsDetailed = (fiber: Fiber): Array<PropsChange> => {
  const currentProps = fiber.memoizedProps ?? {};
  const previousProps = fiber.alternate?.memoizedProps ?? {};
  const changes: Array<PropsChange> = [];

  for (const key in currentProps) {
    if (key === 'children') continue;

    const currentValue = currentProps[key];
    const prevValue = previousProps[key];

    if (!isEqual(currentValue, prevValue)) {
      changes.push({
        name: key,
        value: currentValue,
        prevValue,
        type: ChangeReason.Props,
      });
    }
  }

  return changes;
};

type OverrideHookState = (
  fiber: Fiber,
  id: string,
  path: Array<unknown>,
  value: unknown,
) => void;

type OverrideProps = (
  fiber: Fiber,
  path: Array<string>,
  value: unknown,
) => void;

interface OverrideMethods {
  overrideProps: OverrideProps | null;
  overrideHookState: OverrideHookState | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object';
};

export const getOverrideMethods = (): OverrideMethods => {
  let overrideProps = null;
  let overrideHookState = null;

  if ('__REACT_DEVTOOLS_GLOBAL_HOOK__' in window) {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers) {
      return { overrideProps: null, overrideHookState: null };
    }

    for (const [_, renderer] of Array.from(hook.renderers)) {
      try {
        const devToolsRenderer = renderer as ExtendedReactRenderer;

        if (overrideHookState) {
          const prevOverrideHookState = overrideHookState;
          overrideHookState = (
            fiber: Fiber,
            id: string,
            path: Array<unknown>,
            value: unknown,
          ) => {
            // Find the hook
            let current = fiber.memoizedState;
            for (let i = 0; i < Number(id); i++) {
              if (!current?.next) break;
              current = current.next;
            }

            if (current?.queue) {
              // Update through React's queue mechanism
              const queue = current.queue;
              if (isRecord(queue) && 'dispatch' in queue) {
                const dispatch = queue.dispatch as (value: unknown) => void;
                dispatch(value);
                return;
              }
            }

            prevOverrideHookState(fiber, id, path, value);
            devToolsRenderer.overrideHookState?.(fiber, id, path, value);
          };
        } else if (devToolsRenderer.overrideHookState) {
          overrideHookState = devToolsRenderer.overrideHookState;
        }

        if (overrideProps) {
          const prevOverrideProps = overrideProps;
          overrideProps = (
            fiber: Fiber,
            path: Array<string>,
            value: unknown,
          ) => {
            prevOverrideProps(fiber, path, value);
            devToolsRenderer.overrideProps?.(fiber, path, value);
          };
        } else if (devToolsRenderer.overrideProps) {
          overrideProps = devToolsRenderer.overrideProps;
        }
      } catch {
        /**/
      }
    }
  }

  return { overrideProps, overrideHookState };
};

export const nonVisualTags = new Set([
  'HTML',
  'HEAD',
  'META',
  'TITLE',
  'BASE',
  'SCRIPT',
  'SCRIPT',
  'STYLE',
  'LINK',
  'NOSCRIPT',
  'SOURCE',
  'TRACK',
  'EMBED',
  'OBJECT',
  'PARAM',
  'TEMPLATE',
  'PORTAL',
  'SLOT',
  'AREA',
  'XML',
  'DOCTYPE',
  'COMMENT',
]);

export const findComponentDOMNode = (
  fiber: Fiber,
  excludeNonVisualTags = true,
): HTMLElement | null => {
  if (fiber.stateNode && 'nodeType' in fiber.stateNode) {
    const element = fiber.stateNode as HTMLElement;
    if (
      excludeNonVisualTags &&
      nonVisualTags.has(element.tagName.toLowerCase())
    ) {
      return null;
    }
    return element;
  }

  let child = fiber.child;
  while (child) {
    const result = findComponentDOMNode(child, excludeNonVisualTags);
    if (result) return result;
    child = child.sibling;
  }

  return null;
};

export interface InspectableElement {
  element: HTMLElement;
  depth: number;
  name: string;
}

export const getInspectableElements = (
  root: HTMLElement = document.body,
): Array<InspectableElement> => {
  const result: Array<InspectableElement> = [];

  const findInspectableFiber = (
    element: HTMLElement | null,
  ): HTMLElement | null => {
    if (!element) return null;
    const { parentCompositeFiber } = getCompositeComponentFromElement(element);
    if (!parentCompositeFiber) return null;

    const componentRoot = findComponentDOMNode(parentCompositeFiber);
    return componentRoot === element ? element : null;
  };

  const traverse = (element: HTMLElement, depth = 0) => {
    const inspectable = findInspectableFiber(element);
    if (inspectable) {
      const { parentCompositeFiber } =
        getCompositeComponentFromElement(inspectable);

      if (!parentCompositeFiber) return;

      result.push({
        element: inspectable,
        depth,
        name: getDisplayName(parentCompositeFiber.type) ?? 'Unknown',
      });
    }

    // Traverse children first (depth-first)
    for (const child of Array.from(element.children)) {
      traverse(child as HTMLElement, inspectable ? depth + 1 : depth);
    }
  };

  traverse(root);
  return result;
};
type DiffResult = {
  type: 'primitive' | 'reference' | 'object';
  changes: Array<{
    path: string[];
    prevValue: unknown;
    currentValue: unknown;
    sameFunction?: boolean;
  }>;
  hasDeepChanges: boolean;
};

type DiffChange = {
  path: string[];
  prevValue: unknown;
  currentValue: unknown;
  sameFunction?: boolean;
};

type InspectableValue =
  | Record<string, unknown>
  | Array<unknown>
  | Map<unknown, unknown>
  | Set<unknown>
  | ArrayBuffer
  | DataView
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export type AggregatedChanges = {
  count: number;
  // unstable: boolean;
  currentValue: unknown;
  previousValue: unknown;
  // displayName?:string
  name: string;
};

export const isExpandable = (value: unknown): value is InspectableValue => {
  if (value === null || typeof value !== 'object' || isPromise(value)) {
    return false;
  }

  if (value instanceof ArrayBuffer) {
    return true;
  }

  if (value instanceof DataView) {
    return true;
  }

  if (ArrayBuffer.isView(value)) {
    return true;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Object.keys(value).length > 0;
};

export const isEditableValue = (
  value: unknown,
  parentPath?: string,
): boolean => {
  if (value == null) return true;

  if (isPromise(value)) return false;

  if (typeof value === 'function') {
    return false;
  }

  if (parentPath) {
    const parts = parentPath.split('.');
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part;
      const obj = globalInspectorState.lastRendered.get(currentPath);
      if (
        obj instanceof DataView ||
        obj instanceof ArrayBuffer ||
        ArrayBuffer.isView(obj)
      ) {
        return false;
      }
    }
  }

  switch (value.constructor) {
    case Date:
    case RegExp:
    case Error:
      return true;
    default:
      switch (typeof value) {
        case 'string':
        case 'number':
        case 'boolean':
        case 'bigint':
          return true;
        default:
          return false;
      }
  }
};

export const getPath = (
  componentName: string,
  section: string,
  parentPath: string,
  key: string,
): string => {
  if (parentPath) {
    return `${componentName}.${parentPath}.${key}`;
  }

  if (section === 'context' && !key.startsWith('context.')) {
    return `${componentName}.${section}.context.${key}`;
  }

  return `${componentName}.${section}.${key}`;
};

export const sanitizeString = (value: string): string => {
  return value
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/on\w+=/gi, '')
    .slice(0, 50000);
};

export const sanitizeErrorMessage = (error: string): string => {
  return error
    .replace(/[<>]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const formatValue = (value: unknown): string => {
  const metadata = ensureRecord(value);
  return metadata.displayValue as string;
};

export const formatForClipboard = (value: unknown): string => {
  try {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isPromise(value)) return 'Promise';

    if (typeof value === 'function') {
      const fnStr = value.toString();
      try {
        const formatted = fnStr
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/{\s+/g, '{\n  ') // Add newline after {
          .replace(/;\s+/g, ';\n  ') // Add newline after ;
          .replace(/}\s*$/g, '\n}') // Add newline before final }
          .replace(/\(\s+/g, '(') // Remove space after (
          .replace(/\s+\)/g, ')') // Remove space before )
          .replace(/,\s+/g, ', '); // Normalize comma spacing

        return formatted;
      } catch {
        return fnStr;
      }
    }

    switch (true) {
      case value instanceof Date:
        return value.toISOString();
      case value instanceof RegExp:
        return value.toString();
      case value instanceof Error:
        return `${value.name}: ${value.message}`;
      case value instanceof Map:
        return JSON.stringify(Array.from(value.entries()), null, 2);
      case value instanceof Set:
        return JSON.stringify(Array.from(value), null, 2);
      case value instanceof DataView:
        return JSON.stringify(
          Array.from(new Uint8Array(value.buffer)),
          null,
          2,
        );
      case value instanceof ArrayBuffer:
        return JSON.stringify(Array.from(new Uint8Array(value)), null, 2);
      case ArrayBuffer.isView(value) && 'length' in value:
        return JSON.stringify(
          Array.from(value as unknown as ArrayLike<number>),
          null,
          2,
        );
      case Array.isArray(value):
        return JSON.stringify(value, null, 2);
      case typeof value === 'object':
        return JSON.stringify(value, null, 2);
      default:
        return String(value);
    }
  } catch {
    return String(value);
  }
};

export const parseArrayValue = (value: string): Array<unknown> => {
  if (value.trim() === '[]') return [];

  const result: Array<unknown> = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
    }

    if (char === '"') {
      inString = !inString;
      current += char;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    if (char === '[' || char === '{') {
      depth++;
      current += char;
      continue;
    }

    if (char === ']' || char === '}') {
      depth--;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      if (current.trim()) {
        result.push(parseValue(current.trim(), ''));
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(parseValue(current.trim(), ''));
  }

  return result;
};

export const parseValue = (value: string, currentType: unknown): unknown => {
  try {
    switch (typeof currentType) {
      case 'number':
        return Number(value);
      case 'string':
        return value;
      case 'boolean':
        return value === 'true';
      case 'bigint':
        return BigInt(value);
      case 'undefined':
        return undefined;
      case 'object': {
        if (!currentType) {
          return null;
        }

        if (Array.isArray(currentType)) {
          return parseArrayValue(value.slice(1, -1));
        }

        if (currentType instanceof RegExp) {
          try {
            const match = /^\/(?<pattern>.*)\/(?<flags>[gimuy]*)$/.exec(value);
            if (match?.groups) {
              return new RegExp(match.groups.pattern, match.groups.flags);
            }
            return new RegExp(value);
          } catch {
            return currentType;
          }
        }

        if (currentType instanceof Map) {
          const entries = value
            .slice(1, -1)
            .split(', ')
            .map((entry) => {
              const [key, val] = entry.split(' => ');
              return [parseValue(key, ''), parseValue(val, '')] as [
                unknown,
                unknown,
              ];
            });
          return new Map(entries);
        }

        if (currentType instanceof Set) {
          const values = value
            .slice(1, -1)
            .split(', ')
            .map((v) => parseValue(v, ''));
          return new Set(values);
        }
        const entries = value
          .slice(1, -1)
          .split(', ')
          .map((entry) => {
            const [key, val] = entry.split(': ');
            return [key, parseValue(val, '')];
          });
        return Object.fromEntries(entries);
      }
    }

    return value;
  } catch {
    return currentType;
  }
};

export const detectValueType = (
  value: string,
): {
  type: 'string' | 'number' | 'undefined' | 'null' | 'boolean';
  value: unknown;
} => {
  const trimmed = value.trim();

  switch (trimmed) {
    case 'undefined':
      return { type: 'undefined', value: undefined };
    case 'null':
      return { type: 'null', value: null };
    case 'true':
      return { type: 'boolean', value: true };
    case 'false':
      return { type: 'boolean', value: false };
  }

  if (/^".*"$/.test(trimmed)) {
    return { type: 'string', value: trimmed.slice(1, -1) };
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return { type: 'number', value: Number(trimmed) };
  }

  return { type: 'string', value: `"${trimmed}"` };
};

export const formatInitialValue = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
};

export const updateNestedValue = (
  obj: unknown,
  path: Array<string>,
  value: unknown,
): unknown => {
  try {
    if (path.length === 0) return value;

    const [key, ...rest] = path;

    // Handle our special array of {name, value} pairs
    if (
      Array.isArray(obj) &&
      obj.every((item): item is StateItem => 'name' in item && 'value' in item)
    ) {
      const index = obj.findIndex((item) => item.name === key);
      if (index === -1) return obj;

      const newArray = [...obj];
      if (rest.length === 0) {
        newArray[index] = { ...newArray[index], value };
      } else {
        newArray[index] = {
          ...newArray[index],
          value: updateNestedValue(newArray[index].value, rest, value),
        };
      }
      return newArray;
    }

    if (obj instanceof Map) {
      const newMap = new Map(obj);
      if (rest.length === 0) {
        newMap.set(key, value);
      } else {
        const currentValue = newMap.get(key);
        newMap.set(key, updateNestedValue(currentValue, rest, value));
      }
      return newMap;
    }

    if (Array.isArray(obj)) {
      const index = Number.parseInt(key, 10);
      const newArray = [...obj];
      if (rest.length === 0) {
        newArray[index] = value;
      } else {
        newArray[index] = updateNestedValue(obj[index], rest, value);
      }
      return newArray;
    }

    if (obj && typeof obj === 'object') {
      if (rest.length === 0) {
        return { ...obj, [key]: value };
      }
      return {
        ...obj,
        [key]: updateNestedValue(
          (obj as Record<string, unknown>)[key],
          rest,
          value,
        ),
      };
    }

    return value;
  } catch {
    return obj;
  }
};

export const areFunctionsEqual = (prev: unknown, current: unknown): boolean => {
  try {
    // Check if both values are actually functions
    if (typeof prev !== 'function' || typeof current !== 'function') {
      return false;
    }

    // Now we know both are functions, we can safely call toString()
    return prev.toString() === current.toString();
  } catch {
    return false;
  }
};

export const getObjectDiff = (
  prev: unknown,
  current: unknown,
  path: string[] = [],
  seen = new WeakSet(),
): DiffResult => {
  if (prev === current) {
    return { type: 'primitive', changes: [], hasDeepChanges: false };
  }

  if (typeof prev === 'function' && typeof current === 'function') {
    const isSameFunction = areFunctionsEqual(prev, current);
    return {
      type: 'primitive',
      changes: [
        {
          path,
          prevValue: prev,
          currentValue: current,
          sameFunction: isSameFunction,
        },
      ],
      hasDeepChanges: !isSameFunction,
    };
  }

  if (
    prev === null ||
    current === null ||
    prev === undefined ||
    current === undefined ||
    typeof prev !== 'object' ||
    typeof current !== 'object'
  ) {
    return {
      type: 'primitive',
      changes: [{ path, prevValue: prev, currentValue: current }],
      hasDeepChanges: true,
    };
  }

  if (seen.has(prev) || seen.has(current)) {
    return {
      type: 'object',
      changes: [{ path, prevValue: '[Circular]', currentValue: '[Circular]' }],
      hasDeepChanges: false,
    };
  }

  seen.add(prev);
  seen.add(current);

  const prevObj = prev as Record<string, unknown>;
  const currentObj = current as Record<string, unknown>;
  const allKeys = new Set([
    ...Object.keys(prevObj),
    ...Object.keys(currentObj),
  ]);
  const changes: Array<DiffChange> = [];
  let hasDeepChanges = false;

  for (const key of allKeys) {
    const prevValue = prevObj[key];
    const currentValue = currentObj[key];

    if (prevValue !== currentValue) {
      if (
        typeof prevValue === 'object' &&
        typeof currentValue === 'object' &&
        prevValue !== null &&
        currentValue !== null
      ) {
        const nestedDiff = getObjectDiff(
          prevValue,
          currentValue,
          [...path, key],
          seen,
        );
        changes.push(...nestedDiff.changes);
        if (nestedDiff.hasDeepChanges) {
          hasDeepChanges = true;
        }
      } else {
        changes.push({
          path: [...path, key],
          prevValue,
          currentValue,
        });
        hasDeepChanges = true;
      }
    }
  }

  return {
    type: 'object',
    changes,
    hasDeepChanges,
  };
};

export const formatPath = (path: string[]): string => {
  if (path.length === 0) return '';

  return path.reduce((acc, segment, i) => {
    // Check if segment is a number (array index)
    if (/^\d+$/.test(segment)) {
      return `${acc}[${segment}]`;
    }
    // Add dot separator only if not first segment and previous segment wasn't an array index
    return i === 0 ? segment : `${acc}.${segment}`;
  }, '');
};

export const formatFunctionBody = (body: string): string => {
  // Remove newlines and extra spaces
  let formatted = body.replace(/\s+/g, ' ').trim();

  // Add newlines after {, ; and before }
  formatted = formatted
    .replace(/{/g, '{\n  ')
    .replace(/;/g, ';\n  ')
    .replace(/}/g, '\n}')
    .replace(/{\s+}/g, '{ }'); // Clean up empty blocks

  // Clean up arrow functions
  formatted = formatted.replace(/=> {\n/g, '=> {').replace(/\n\s*}\s*$/g, ' }');

  return formatted;
};

export function hackyJsFormatter(code: string) {
  //
  // 1) Collapse runs of whitespace to single spaces
  //
  code = code.replace(/\s+/g, ' ').trim();

  //
  // 2) Tokenize
  //    We'll separate out:
  //    - parentheses: ( )
  //    - braces: { }
  //    - brackets: [ ]
  //    - angle brackets: < >
  //    - semicolon: ;
  //    - comma: ,
  //    - arrow =>
  //    - colon :
  //    - question mark ?
  //    - exclamation mark ! (for TS non-null etc.)
  //
  //    We'll also try to combine () or [] or {} or <> if they appear empty.
  //
  const rawTokens = [];
  let current = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];

    // Detect arrow =>
    if (c === '=' && code[i + 1] === '>') {
      if (current.trim()) rawTokens.push(current.trim());
      rawTokens.push('=>');
      current = '';
      i++;
      continue;
    }

    // Single/double char punctuation
    if (/[(){}[\];,<>:\?!]/.test(c)) {
      // If we had something in current, push it
      if (current.trim()) {
        rawTokens.push(current.trim());
      }
      rawTokens.push(c);
      current = '';
    } else if (/\s/.test(c)) {
      // whitespace ends the current token
      if (current.trim()) {
        rawTokens.push(current.trim());
      }
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) {
    rawTokens.push(current.trim());
  }

  //
  // 3) Combine immediate pairs of empty brackets, e.g. '(' + ')' => '()'
  //    This helps keep arrow param empty parens on one line, etc.
  //
  const merged: Array<string> = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    const n = rawTokens[i + 1];
    if (
      (t === '(' && n === ')') ||
      (t === '[' && n === ']') ||
      (t === '{' && n === '}') ||
      (t === '<' && n === '>')
    ) {
      merged.push(t + n); // '()', '[]', '{}', '<>'
      i++;
    } else {
      merged.push(t);
    }
  }

  //
  // 4) We want to detect arrow param lists:
  //    i.e. "(" ... ")" immediately followed by "=>"
  //    so we can keep them on one line.
  //
  //    Also, detect generic param lists:
  //    i.e. identifier "<" ... ">" (then maybe "(" ) for function calls or type declarations
  //
  //    We'll store indexes in sets: arrowParamSet, genericSet
  //
  const arrowParamSet = new Set(); // indexes inside arrow param lists
  const genericSet = new Set(); // indexes inside generics <...>

  function findMatchingPair(
    openTok: string,
    closeTok: string,
    startIndex: number,
  ) {
    // e.g. openTok = '(', closeTok = ')'
    let depth = 0;
    for (let j = startIndex; j < merged.length; j++) {
      const token = merged[j];
      if (token === openTok) depth++;
      else if (token === closeTok) {
        depth--;
        if (depth === 0) return j;
      }
    }
    return -1;
  }

  // Detect arrow param sets
  for (let i = 0; i < merged.length; i++) {
    const t = merged[i];
    if (t === '(') {
      const closeIndex = findMatchingPair('(', ')', i);
      if (closeIndex !== -1 && merged[closeIndex + 1] === '=>') {
        // Mark all tokens from i..closeIndex as arrow param
        for (let k = i; k <= closeIndex; k++) {
          arrowParamSet.add(k);
        }
      }
    }
  }

  // Detect generics, e.g. foo<...> or MyType<...>
  // We do a naive approach: if we see something that looks like an identifier
  // followed immediately by '<', we assume it's a generic.
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1];
    const t = merged[i];
    // If prev is an identifier and t is '<', find matching '>'
    if (/^[a-zA-Z0-9_$]+$/.test(prev) && t === '<') {
      const closeIndex = findMatchingPair('<', '>', i);
      if (closeIndex !== -1) {
        // Mark i..closeIndex as generic
        for (let k = i; k <= closeIndex; k++) {
          genericSet.add(k);
        }
      }
    }
  }

  //
  // 5) Build lines with indentation. We maintain a stack for open brackets.
  //
  let indentLevel = 0;
  const indentStr = '  '; // 2 spaces
  const lines: Array<string> = [];
  let line = '';

  function pushLine() {
    if (line.trim()) {
      lines.push(line.replace(/\s+$/, ''));
    }
    line = '';
  }
  function newLine() {
    pushLine();
    line = indentStr.repeat(indentLevel);
  }

  const stack: Array<string> = [];
  function stackTop() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  function placeToken(tok: string, noSpaceBefore = false) {
    if (!line.trim()) {
      // line is empty aside from indentation
      line += tok;
    } else {
      if (noSpaceBefore || /^[),;:\].}>]$/.test(tok)) {
        line += tok;
      } else {
        line += ' ' + tok;
      }
    }
  }

  for (let i = 0; i < merged.length; i++) {
    const tok = merged[i];
    const next = merged[i + 1] || '';

    // Open brackets
    if (['(', '{', '[', '<'].includes(tok)) {
      placeToken(tok);
      stack.push(tok);

      // If '{', definitely newline + indent
      if (tok === '{') {
        indentLevel++;
        newLine();
      } else if (tok === '(' || tok === '[' || tok === '<') {
        // If we are in arrowParamSet or genericSet, keep it on one line
        if (
          (arrowParamSet.has(i) && tok === '(') ||
          (genericSet.has(i) && tok === '<')
        ) {
          // Don't break lines after commas etc.
          // We won't do multiline logic for these.
        } else {
          // If next is not a direct close, go multiline
          const directClose = {
            '(': ')',
            '[': ']',
            '<': '>',
          }[tok];
          if (
            next !== directClose &&
            next !== '()' &&
            next !== '[]' &&
            next !== '<>'
          ) {
            indentLevel++;
            newLine();
          }
        }
      }
    }

    // Close brackets
    else if ([')', '}', ']', '>'].includes(tok)) {
      // pop stack
      const opening = stackTop();
      if (
        (tok === ')' && opening === '(') ||
        (tok === ']' && opening === '[') ||
        (tok === '>' && opening === '<')
      ) {
        // if not arrowParamSet or genericSet, multiline
        if (
          !(arrowParamSet.has(i) && tok === ')') &&
          !(genericSet.has(i) && tok === '>')
        ) {
          indentLevel = Math.max(indentLevel - 1, 0);
          newLine();
        }
      } else if (tok === '}' && opening === '{') {
        indentLevel = Math.max(indentLevel - 1, 0);
        newLine();
      }
      stack.pop();
      placeToken(tok);
      if (tok === '}') {
        // break line after }
        newLine();
      }
    }

    // Combined empty pairs like '()', '[]', '{}', '<>'
    else if (/^\(\)|\[\]|\{\}|\<\>$/.test(tok)) {
      placeToken(tok);

      // Arrow =>
    } else if (tok === '=>') {
      placeToken(tok);
      // We'll let the next token (maybe '{') handle line breaks.

      // Semicolon
    } else if (tok === ';') {
      placeToken(tok, true);
      newLine();

      // Comma
    } else if (tok === ',') {
      placeToken(tok, true);
      // If inside an arrow param set or generic set, don't break
      // Otherwise, if top is {, (, [ or <, break line
      const top = stackTop();
      if (
        !(arrowParamSet.has(i) && top === '(') &&
        !(genericSet.has(i) && top === '<')
      ) {
        if (['{', '[', '(', '<'].includes(top!)) {
          newLine();
        }
      }

      // Everything else (identifiers, operators, colons, question marks, etc.)
    } else {
      placeToken(tok);
    }
  }

  pushLine();

  // Remove extra blank lines
  return lines
    .join('\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Update the formatFunctionPreview to use the new formatter
export const formatFunctionPreview = (
  fn: Function,
  expanded = false,
): string => {
  try {
    const fnStr = fn.toString();
    const match = fnStr.match(
      /(?:function\s*)?(?:\(([^)]*)\)|([^=>\s]+))\s*=>?/,
    );
    if (!match) return 'ƒ';

    const params = match[1] || match[2] || '';
    const cleanParams = params.replace(/\s+/g, '');

    if (!expanded) {
      return `ƒ (${cleanParams}) => ...`;
    }

    // For expanded view, use the new formatter
    return hackyJsFormatter(fnStr);
  } catch {
    return 'ƒ';
  }
};

export const formatValuePreview = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string')
    return `"${value.length > 150 ? value.slice(0, 20) + '...' : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value === 'function') return formatFunctionPreview(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return `{${keys.length > 2 ? `${keys.slice(0, 2).join(', ')}, ...` : keys.join(', ')}}`;
  }
  return String(value);
};

export const safeGetValue = (
  value: unknown,
): { value: unknown; error?: string } => {
  if (value === null || value === undefined) return { value };
  if (typeof value === 'function') return { value };
  if (typeof value !== 'object') return { value };

  // Handle promises without accessing them
  if (value instanceof Promise) {
    return { value: 'Promise' };
  }

  try {
    // Handle potential proxy traps or getter errors
    const proto = Object.getPrototypeOf(value);
    if (proto === Promise.prototype || proto?.constructor?.name === 'Promise') {
      return { value: 'Promise' };
    }

    return { value };
  } catch (e) {
    return { value: null, error: 'Error accessing value' };
  }
};
