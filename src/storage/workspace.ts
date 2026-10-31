export type WorkspaceScope = 'account' | 'guest';
let scope: WorkspaceScope = 'account';
export function getWorkspaceScope(): WorkspaceScope { return scope; }
export function setWorkspaceScope(next: WorkspaceScope): void { scope = next; }
