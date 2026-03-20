#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Finds the first matching pnpm virtual store directory for a given package name.
// This avoids hardcoding version numbers, which break when Dependabot updates packages.
function findPnpmPackageDir(packageName) {
  const pnpmDir = path.join(__dirname, '../node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return null;
  const entries = fs.readdirSync(pnpmDir);
  const match = entries.find(e => e === packageName || e.startsWith(packageName + '@'));
  return match ? path.join(pnpmDir, match) : null;
}

// Fix 1: React 19 missing CJS dev build for jsx-runtime
const reactDir = findPnpmPackageDir('react');
if (reactDir) {
  const reactJsxRuntimePath = path.join(reactDir, 'node_modules/react/cjs/react-jsx-runtime.development.js');
  if (!fs.existsSync(reactJsxRuntimePath)) {
    fs.writeFileSync(reactJsxRuntimePath, "'use strict';module.exports=require('./react-jsx-runtime.production.js');");
    console.log('Created react-jsx-runtime.development.js stub');
  }
}

// Fix 2: aria-query missing regionRole.js
const ariaQueryDir = findPnpmPackageDir('aria-query');
const regionRolePath = ariaQueryDir
  ? path.join(ariaQueryDir, 'node_modules/aria-query/lib/etc/roles/literal/regionRole.js')
  : null;
if (regionRolePath && !fs.existsSync(regionRolePath)) {
  const regionRoleContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = void 0;
var regionRole = {
  abstract: false,
  accessibleNameRequired: false,
  baseConcepts: [],
  childrenPresentational: false,
  nameFrom: ['author'],
  prohibitedProps: [],
  props: {},
  relatedConcepts: [
    { concept: { attributes: [{ name: 'aria-label', constraints: ['set'] }], name: 'section' }, module: 'HTML' },
    { concept: { attributes: [{ name: 'aria-labelledby', constraints: ['set'] }], name: 'section' }, module: 'HTML' }
  ],
  requireContextRole: [],
  requiredContextRole: [],
  requiredOwnedElements: [],
  requiredProps: {},
  superClass: [['roletype', 'structure', 'section', 'landmark']]
};
var _default = regionRole;
exports.default = _default;
`;
  fs.writeFileSync(regionRolePath, regionRoleContent);
  console.log('Created aria-query regionRole.js stub');
}

// Fix 3: zod missing ESM iso.js
const zodDir = findPnpmPackageDir('zod');
const zodIsoPath = zodDir
  ? path.join(zodDir, 'node_modules/zod/v4/classic/iso.js')
  : null;
if (zodIsoPath && !fs.existsSync(zodIsoPath)) {
  const zodIsoContent = `import * as core from "../core/index.js";
import * as schemas from "./schemas.js";
export const ZodISODateTime = /*@__PURE__*/ core.$constructor("ZodISODateTime", (inst, def) => {
    core.$ZodISODateTime.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
});
export function datetime(params) {
    return core._isoDateTime(ZodISODateTime, params);
}
export const ZodISODate = /*@__PURE__*/ core.$constructor("ZodISODate", (inst, def) => {
    core.$ZodISODate.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
});
export function date(params) {
    return core._isoDate(ZodISODate, params);
}
export const ZodISOTime = /*@__PURE__*/ core.$constructor("ZodISOTime", (inst, def) => {
    core.$ZodISOTime.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
});
export function time(params) {
    return core._isoTime(ZodISOTime, params);
}
export const ZodISODuration = /*@__PURE__*/ core.$constructor("ZodISODuration", (inst, def) => {
    core.$ZodISODuration.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
});
export function duration(params) {
    return core._isoDuration(ZodISODuration, params);
}
`;
  fs.writeFileSync(zodIsoPath, zodIsoContent);
  console.log('Created zod iso.js stub');
}
