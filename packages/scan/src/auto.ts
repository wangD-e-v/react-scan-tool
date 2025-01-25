import { Options, scan } from './index';
import { init } from './install-hook';

init();

if (typeof window !== 'undefined') {
  let options: Partial<Options> = {};
  const isPastingInConsole = !document.currentScript;
  if (isPastingInConsole) {
    options.dangerouslyForceRunInProduction = true;
  }

  scan(options);
  window.reactScan = scan;

  if (isPastingInConsole) {
    console.warn(
      '[React Scan]: Detected script was pasted through devtools console',
    );
  }
}

export * from './core';
