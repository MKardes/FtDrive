import type { Node } from '../src/api/types';

let counter = 0;

export function makeNode(overrides: Partial<Node> = {}): Node {
  counter += 1;
  return {
    id: `node-${counter}`,
    parentId: 'root',
    type: 'file',
    name: `file-${counter}.txt`,
    size: 1024,
    mimeType: 'text/plain',
    thumbStatus: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
