// A worklet runs on the UI thread, in a second JavaScript runtime that has only the worklets it is
// given. The only things it may call are: worklets, Reanimated's own functions, what the language
// itself provides (Math, Number, the methods of an array or a string), and, by way of runOnJS, a
// function on the JS thread. Anything else is a "Remote Function", and calling it from the UI thread
// ends the app. The walk (v9) found every bottom sheet doing it: the sheet's style worklet called
// qaKeyboardHeight(), an ordinary function from another file.
//
// The Reanimated stand-in (src/testing/reanimatedMock.ts) runs worklets as the UI runtime would, and
// throws the app's own error: but only for the code a test happens to draw. This reads every worklet
// in the app instead, whether or not a test reaches it, and lists each call in one that is not one of
// the above. It works from the syntax alone, so it is a little blunter than the stand-in: a method
// is allowed by its name (`.get()`, `.map()`), a function by where it is declared.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');

// Hooks whose function arguments Reanimated's Babel plugin makes worklets, by position (all of them
// when no position is given), and the animations whose last argument is a callback.
const HOOKS: Record<string, number[] | undefined> = {
  useAnimatedStyle: [0],
  useAnimatedProps: [0],
  useDerivedValue: [0],
  useAnimatedReaction: [0, 1],
  useFrameCallback: [0],
  useAnimatedScrollHandler: undefined,
  runOnUI: [0],
  scheduleOnUI: [0],
  usePanGesture: undefined,
  useTapGesture: undefined,
  useLongPressGesture: undefined,
  useFlingGesture: undefined,
  usePinchGesture: undefined,
  useRotationGesture: undefined,
  withTiming: [2],
  withSpring: [2],
  withDecay: [1],
  withRepeat: [3],
};
const GESTURE_CALLBACKS = new Set([
  'onBegin',
  'onStart',
  'onUpdate',
  'onChange',
  'onEnd',
  'onFinalize',
  'onTouchesDown',
  'onTouchesMove',
  'onTouchesUp',
  'onTouchesCancelled',
]);

// What the language provides, on every runtime.
const GLOBALS = new Set(['Math', 'Number', 'Object', 'Array', 'JSON', 'String', 'Boolean']);
const GLOBAL_FUNCTIONS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'Number',
  'String',
]);
// The methods of arrays, strings, numbers and shared values, which are called on values that are
// those, and are never the app's own functions.
const METHODS = new Set([
  // shared values
  'get',
  'set',
  'modify',
  // arrays, strings, numbers, objects
  'at',
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'flat',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'map',
  'padStart',
  'padEnd',
  'pop',
  'push',
  'reduce',
  'replace',
  'reverse',
  'shift',
  'slice',
  'some',
  'sort',
  'splice',
  'split',
  'startsWith',
  'toFixed',
  'toString',
  'trim',
  'unshift',
  'values',
]);
// Things that are not there on the UI runtime at all.
const NOT_THERE = new Set(['window', 'document', 'localStorage', 'navigator']);

type Found = { file: string; line: number; text: string; why: string };

const sources = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile | undefined {
  const known = sources.get(file);
  if (known) return known;
  if (!fs.existsSync(file)) return undefined;
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  sources.set(file, parsed);
  return parsed;
}

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

/** A function whose body opens with the 'worklet' directive. */
function hasDirective(node: ts.Node): boolean {
  if (!isFunctionLike(node) || !node.body || !ts.isBlock(node.body)) return false;
  for (const statement of node.body.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === 'worklet') return true;
  }
  return false;
}

/** The worklets a module declares at its top level, by name. */
const declared = new Map<string, Set<string>>();
function workletsOf(file: string): Set<string> {
  const known = declared.get(file);
  if (known) return known;
  const names = new Set<string>();
  declared.set(file, names);
  const source = parse(file);
  if (!source) return names;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && hasDirective(node))
      names.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (hasDirective(init)) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function resolveModule(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith('@/')
    ? path.join(ROOT, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  return ['.ts', '.tsx', '/index.ts', '/index.tsx']
    .map((extension) => base + extension)
    .find((candidate) => fs.existsSync(candidate));
}

type Imports = { module: string; imported: string };
function importsOf(source: ts.SourceFile): Map<string, Imports> {
  const found = new Map<string, Imports>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) found.set(clause.name.text, { module, imported: 'default' });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings))
      found.set(bindings.name.text, { module, imported: '*' });
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        found.set(element.name.text, {
          module,
          imported: (element.propertyName ?? element.name).text,
        });
      }
    }
  }
  return found;
}

const REANIMATED = /^react-native-(reanimated|worklets)$/;

/** Every worklet body in a file: the functions that are worklets, and where each starts. */
function workletBodies(source: ts.SourceFile): ts.Node[] {
  const bodies = new Set<ts.Node>();
  const take = (node: ts.Node | undefined) => {
    if (node && isFunctionLike(node)) bodies.add(node);
  };
  const visit = (node: ts.Node) => {
    if (hasDirective(node)) bodies.add(node);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : undefined;
      if (name && name in HOOKS) {
        const positions = HOOKS[name];
        node.arguments.forEach((argument, index) => {
          if (positions && !positions.includes(index)) return;
          take(argument);
          // A hook that takes an object of callbacks (a gesture, a scroll handler).
          if (!positions && ts.isObjectLiteralExpression(argument)) {
            for (const property of argument.properties) {
              if (ts.isPropertyAssignment(property)) take(property.initializer);
              if (ts.isMethodDeclaration(property)) take(property);
            }
          }
        });
      }
      // Gesture.Pan().onUpdate(() => ...)
      if (ts.isPropertyAccessExpression(callee) && GESTURE_CALLBACKS.has(callee.name.text)) {
        let root: ts.Expression = callee.expression;
        while (ts.isCallExpression(root) || ts.isPropertyAccessExpression(root))
          root = root.expression;
        if (ts.isIdentifier(root) && root.text === 'Gesture') node.arguments.forEach(take);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...bodies];
}

/** The names a worklet declares for itself: its parameters, its variables, the functions inside it. */
function localNames(body: ts.Node): Set<string> {
  const names = new Set<string>();
  const addBinding = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else
      name.elements.forEach((element) => ts.isBindingElement(element) && addBinding(element.name));
  };
  const visit = (node: ts.Node) => {
    if (ts.isParameter(node)) addBinding(node.name);
    if (ts.isVariableDeclaration(node)) addBinding(node.name);
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return names;
}

function check(file: string, source: ts.SourceFile): Found[] {
  const problems: Found[] = [];
  const imports = importsOf(source);
  const here = workletsOf(file);
  const report = (node: ts.Node, why: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    problems.push({
      file: path.relative(ROOT, file),
      line: line + 1,
      text: node.getText().slice(0, 70),
      why,
    });
  };

  /** Is this name, called, a worklet or a function Reanimated provides? */
  const callable = (name: string, locals: Set<string>): boolean => {
    if (locals.has(name) || here.has(name) || GLOBAL_FUNCTIONS.has(name)) return true;
    const imported = imports.get(name);
    if (!imported) return false;
    if (REANIMATED.test(imported.module)) return true;
    const target = resolveModule(file, imported.module);
    return target ? workletsOf(target).has(imported.imported) : false;
  };

  for (const body of workletBodies(source)) {
    const locals = localNames(body);
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && NOT_THERE.has(node.text) && !locals.has(node.text)) {
        report(node, `${node.text} is not there on the UI runtime`);
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) {
          if (!callable(callee.text, locals)) {
            report(
              node,
              `${callee.text}() is not a worklet: it cannot be called from the UI thread`,
            );
          }
        } else if (ts.isCallExpression(callee) && ts.isIdentifier(callee.expression)) {
          // runOnJS(fn)(...): the way back to the JS thread.
          if (!['runOnJS', 'runOnUI'].includes(callee.expression.text)) {
            report(node, `${callee.expression.text}(...)(...) is not runOnJS`);
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          let root: ts.Expression = callee.expression;
          while (
            ts.isPropertyAccessExpression(root) ||
            ts.isCallExpression(root) ||
            ts.isNonNullExpression(root)
          ) {
            root = ts.isCallExpression(root) ? root.expression : root.expression;
          }
          const rootName = ts.isIdentifier(root) ? root.text : undefined;
          const method = callee.name.text;
          const imported = rootName ? imports.get(rootName) : undefined;
          const fromWorklets =
            imported?.imported === '*' &&
            (resolveModule(file, imported.module)
              ? workletsOf(resolveModule(file, imported.module)!).has(method)
              : false);
          const reanimated = imported ? REANIMATED.test(imported.module) : false;
          const ok =
            (rootName !== undefined && GLOBALS.has(rootName)) ||
            METHODS.has(method) ||
            reanimated ||
            fromWorklets;
          if (!ok) report(node, `.${method}() is not a worklet, and not a method of a value`);
        } else if (!ts.isFunctionExpression(callee) && !ts.isArrowFunction(callee)) {
          report(node, 'a call this cannot see the callee of');
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
  }
  return problems;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name) ? [full] : [];
  });
}

describe('every worklet in the app', () => {
  const files = [
    ...sourceFiles(path.join(ROOT, 'src')),
    ...sourceFiles(path.join(ROOT, 'app')),
  ].filter((file) => !file.includes(`${path.sep}testing${path.sep}`));

  it('reads some, or this checks nothing', () => {
    const found = files.flatMap((file) => {
      const source = parse(file);
      return source ? workletBodies(source) : [];
    });
    // Sheet, Resolve, the dial, the book: well over a hundred.
    expect(found.length).toBeGreaterThan(100);
  });

  it('calls only worklets, Reanimated’s own functions, the language, and (through runOnJS) JS', () => {
    const problems = files.flatMap((file) => {
      const source = parse(file);
      return source ? check(file, source) : [];
    });
    expect(problems.map(({ file, line, why }) => `${file}:${line} ${why}`)).toEqual([]);
  });
});

// The check must see what it was written for. These are the walk's crash, and its neighbours.
describe('the check', () => {
  const scratch = path.join(ROOT, 'src/__worklet_check__.tsx');
  const run = (code: string) => {
    const source = ts.createSourceFile(
      scratch,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    sources.set(scratch, source);
    declared.delete(scratch);
    return check(scratch, source).map(({ why }) => why);
  };

  it('finds a style worklet that calls a function from another file: the sheet that killed the app', () => {
    const found = run(`
      import { useAnimatedStyle } from 'react-native-reanimated';
      import { qaKeyboardHeight } from '@/features/journal-session/sky';
      export function Stage({ room }) {
        return useAnimatedStyle(() => ({ height: Math.max(room.get(), qaKeyboardHeight()) }));
      }
    `);
    expect(found).toEqual([
      'qaKeyboardHeight() is not a worklet: it cannot be called from the UI thread',
    ]);
  });

  it('finds a plain function called through an object, and a browser global', () => {
    const found = run(`
      import { useAnimatedStyle } from 'react-native-reanimated';
      import { qa } from '@/testing/qa';
      export function Stage() {
        return useAnimatedStyle(() => ({ top: qa.reserve(), left: window.innerWidth }));
      }
    `);
    expect(found).toEqual([
      '.reserve() is not a worklet, and not a method of a value',
      'window is not there on the UI runtime',
    ]);
  });

  it('finds a plain function in an animation’s callback, and in a reaction', () => {
    const found = run(`
      import { useAnimatedReaction, withTiming } from 'react-native-reanimated';
      function later() {}
      export function Dial({ angle, value }) {
        useAnimatedReaction(() => angle.get(), (now) => { later(); });
        value.set(withTiming(1, {}, (done) => { later(); }));
      }
    `);
    expect(found).toHaveLength(2);
  });

  it('lets a worklet use worklets, Math, shared values, and runOnJS for the rest', () => {
    const found = run(`
      import { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
      import { snapMinutes } from '@/features/onboarding/rhythm/time';
      function clamp(v) { 'worklet'; return Math.min(1, v); }
      export function Dial({ angle, report }) {
        const style = useAnimatedStyle(() => ({ opacity: clamp(angle.get()) }));
        useAnimatedReaction(() => snapMinutes(angle.get()), (now, was) => {
          if (now !== was) runOnJS(report)(now);
        });
        return style;
      }
    `);
    expect(found).toEqual([]);
  });
});
