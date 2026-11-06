// Stands in for expo-file-system in Jest, as far as nativePorts.ts uses it, and no further. It follows
// the native handles in node_modules/expo-file-system/{android,ios}: a handle opened for reading
// cannot write and the reverse, opening for writing does not empty the file, a read returns what is
// there up to the length asked and nothing at or past the end, the offset is the handle's own, and a
// closed handle throws. `control` bends one thing real devices are free to do: return less than asked.
// Never imported by app code.

export const FileMode = {
  ReadWrite: 'rw',
  ReadOnly: 'r',
  WriteOnly: 'w',
  Append: 'wa',
  Truncate: 'wt',
} as const;

type Mode = (typeof FileMode)[keyof typeof FileMode];

const files = new Map<string, Uint8Array>();
const folders = new Set<string>();

export const control = {
  /** The most a single readBytes returns, however much was asked for. */
  maxRead: Infinity,
  /** Handles opened and not closed. */
  open: 0,
  /** Every mode a handle was opened with, in order. */
  modes: [] as string[],
  /** Every offset assigned to a handle, in order. */
  offsets: [] as number[],
  reset() {
    files.clear();
    folders.clear();
    control.maxRead = Infinity;
    control.open = 0;
    control.modes.length = 0;
    control.offsets.length = 0;
  },
  put(uri: string, bytes: Uint8Array) {
    files.set(uri, bytes.slice());
  },
  get: (uri: string): Uint8Array | undefined => files.get(uri)?.slice(),
  has: (uri: string) => files.has(uri),
  folders,
};

class Handle {
  private closed = false;
  private position = 0;

  constructor(
    private readonly uri: string,
    private readonly mode: Mode,
  ) {
    control.open += 1;
    control.modes.push(mode);
  }

  private live(): Uint8Array {
    if (this.closed) throw new Error('file handle is closed');
    const data = files.get(this.uri);
    if (!data) throw new Error('no such file');
    return data;
  }

  get offset(): number | null {
    return this.closed ? null : this.position;
  }

  set offset(value: number | null) {
    if (value === null) return;
    control.offsets.push(value);
    this.position = value;
  }

  get size(): number | null {
    return this.closed ? null : (files.get(this.uri)?.length ?? null);
  }

  async readBytes(length: number): Promise<Uint8Array> {
    const data = this.live();
    if (this.mode === FileMode.WriteOnly) throw new Error('Cannot read. File opened write-only.');
    const available = Math.max(0, data.length - this.position);
    const count = Math.min(length, available, control.maxRead);
    const out = data.slice(this.position, this.position + count);
    this.position += count;
    return out;
  }

  async writeBytes(bytes: Uint8Array): Promise<void> {
    const data = this.live();
    if (this.mode === FileMode.ReadOnly) throw new Error('Cannot write. File opened read-only.');
    const grown = new Uint8Array(Math.max(data.length, this.position + bytes.length));
    grown.set(data);
    grown.set(bytes, this.position);
    files.set(this.uri, grown);
    this.position += bytes.length;
  }

  close(): void {
    if (!this.closed) control.open -= 1;
    this.closed = true;
  }
}

const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));

export class Directory {
  readonly uri: string;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }

  get exists(): boolean {
    return folders.has(this.uri);
  }

  create(options: { idempotent?: boolean; intermediates?: boolean } = {}): void {
    if (this.exists && !options.idempotent) throw new Error('directory already exists');
    if (
      !options.intermediates &&
      !folders.has(parentOf(this.uri)) &&
      parentOf(this.uri) !== 'file://'
    ) {
      throw new Error('parent directory does not exist');
    }
    folders.add(this.uri);
  }

  delete(): void {
    folders.delete(this.uri);
    for (const uri of [...files.keys()]) if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
  }

  list(): File[] {
    return [...files.keys()]
      .filter((uri) => parentOf(uri) === this.uri)
      .map((uri) => new File(uri));
  }
}

export class File {
  readonly uri: string;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  get size(): number {
    return files.get(this.uri)?.length ?? 0;
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }

  get parentDirectory(): Directory {
    return new Directory(parentOf(this.uri));
  }

  create(options: { overwrite?: boolean; intermediates?: boolean } = {}): void {
    if (this.exists && !options.overwrite) throw new Error('file already exists');
    if (!options.intermediates && !this.parentDirectory.exists) {
      throw new Error('parent directory does not exist');
    }
    files.set(this.uri, new Uint8Array(0));
  }

  open(mode: Mode = FileMode.ReadWrite): Handle {
    if (!this.exists) throw new Error('no such file');
    return new Handle(this.uri, mode);
  }

  async bytes(): Promise<Uint8Array> {
    const data = files.get(this.uri);
    if (!data) throw new Error('no such file');
    return data.slice();
  }

  async move(destination: File, options: { overwrite?: boolean } = {}): Promise<void> {
    const data = files.get(this.uri);
    if (!data) throw new Error('no such file');
    if (files.has(destination.uri) && !options.overwrite) throw new Error('destination exists');
    if (!destination.parentDirectory.exists) throw new Error('parent directory does not exist');
    files.set(destination.uri, data);
    files.delete(this.uri);
  }

  delete(): void {
    if (!files.delete(this.uri)) throw new Error('no such file');
  }
}

export const Paths = { document: { uri: 'file:///documents' }, cache: { uri: 'file:///cache' } };
