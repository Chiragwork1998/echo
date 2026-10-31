/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/components/ThemeToggle.tsx'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

function createToggle(initialTheme = 'day') {
  const changes = [];
  let name = initialTheme;
  let time = 0;
  let ref;
  const mod = { exports: {} };
  const req = (id) => {
    if (id === 'react') return { useRef: (value) => (ref ??= { current: value }) };
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (id === 'react-native') return { Pressable: 'Pressable' };
    if (id === '@/design/ThemeProvider') {
      return {
        useEchoTheme: () => ({
          name,
          setSetting: (value) => {
            changes.push(value);
            name = value;
          },
        }),
      };
    }
    throw new Error(`Unexpected import: ${id}`);
  };
  new Function('require', 'module', 'exports', 'Date', source)(req, mod, mod.exports, {
    now: () => time,
  });
  const render = () => mod.exports.ThemeToggle({ children: 'ECHO' }).props;
  return {
    changes,
    render,
    press(at, nativeEvent = {}) {
      time = at;
      render().onPress({ nativeEvent });
    },
  };
}

const single = createToggle();
single.press(0);
assert.deepEqual(single.changes, [], 'A single tap must not change the theme');
single.press(351);
assert.deepEqual(single.changes, [], 'Separate slow taps must not change the theme');
single.press(600);
assert.deepEqual(single.changes, ['night'], 'Two quick taps must switch to Night');
single.press(650);
assert.deepEqual(single.changes, ['night'], 'A third tap must not toggle again');
single.press(800);
assert.deepEqual(single.changes, ['night', 'day'], 'The next pair must switch back to Day');

const boundary = createToggle();
boundary.press(0);
boundary.press(350);
assert.deepEqual(boundary.changes, ['night'], 'Accept the double-tap timing boundary');

const first = createToggle();
const second = createToggle('night');
first.press(1000);
second.press(1100);
assert.deepEqual(second.changes, [], 'Different wordmarks must not share pending taps');
second.press(1200);
assert.deepEqual(second.changes, ['day']);

const keyboard = createToggle();
keyboard.press(1000, { detail: 0 });
assert.deepEqual(keyboard.changes, ['night'], 'Preserve keyboard activation on web');
keyboard.press(1100);
assert.deepEqual(keyboard.changes, ['night'], 'Keyboard activation must reset pending taps');

const accessible = createToggle();
assert.match(accessible.render().accessibilityHint, /Double-tap/);
assert.ok(accessible.render().accessibilityActions.some(action => action.name === 'activate'));
accessible.press(1000);
accessible.render().onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
assert.deepEqual(accessible.changes, ['night'], 'Preserve screen-reader activation');
accessible.press(1100);
accessible.render().onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } });
assert.deepEqual(accessible.changes, ['night'], 'Ignore unrelated accessibility actions');

console.log('PASS single/slow taps ignored; double taps toggle both ways once per pair; timing boundary; isolated wordmarks; keyboard and accessibility activation');
