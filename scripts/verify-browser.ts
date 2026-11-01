// The browser check: does the bake pipeline actually run?
//
// Every other harness runs in Node, where there is no WebGL, so the renderer,
// the post-processing chain and the readback have never executed. This one
// bundles the real engine, runs it in a real browser against a real GPU
// context, and writes the sprites out as PNGs so they can be looked at.
//
// It answers the questions that matter and that nothing else can: did the
// render happen at all, are the pixels non-empty, is anything actually drawn
// where the manifest says it is, and did the outline pass darken anything.

import { bundle } from './browser/harness';

const OUT = 'scripts/browser/out';
void bundle(OUT);
