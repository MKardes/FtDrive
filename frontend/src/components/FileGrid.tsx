import type { Node } from '../api/types';
import { Thumbnail } from './Thumbnail';

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const str = n.toFixed(n < 10 && i > 0 ? 1 : 0);
  return `${parseFloat(str)} ${units[i]}`;
}

export interface FileGridProps {
  nodes: Node[];
  onOpen: (node: Node) => void;
  renderActions?: (node: Node) => React.ReactNode;
}

export function FileGrid({ nodes, onOpen, renderActions }: FileGridProps) {
  return (
    <div className="file-grid">
      {nodes.map((node) => (
        <div key={node.id} className="file-card-wrapper">
          <button
            type="button"
            className="file-card"
            onClick={() => onOpen(node)}
            title={node.name}
          >
            <Thumbnail node={node} />
            <div className="file-card__name">{node.name}</div>
            <div className="file-card__meta">
              {node.type === 'folder' ? 'Folder' : formatSize(node.size)}
            </div>
          </button>
          {renderActions && <div className="row-actions">{renderActions(node)}</div>}
        </div>
      ))}
    </div>
  );
}
