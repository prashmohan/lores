import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, User, Sparkles, Pencil, Eye, X } from 'lucide-react';
import type { PersonRead, PersonSummary, TreeEdge } from '../../types/api';

export type MapPerson = PersonRead | PersonSummary;

const EMPTY_EDGES: TreeEdge[] = [];

interface BirdseyeMapCanvasProps {
  people: MapPerson[];
  edges?: TreeEdge[];
  focusPersonId?: string | null;
  onSelectPerson?: (personId: string) => void;
  onEditPerson?: (person: MapPerson) => void;
}

interface PositionedNode {
  person: MapPerson;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: number;
}

interface RenderedEdge {
  id: string;
  type: 'partner' | 'parent_child';
  pathData: string;
  sourceNode: PositionedNode;
  targetNode: PositionedNode;
  midX?: number;
  midY?: number;
}

export const BirdseyeMapCanvas: React.FC<BirdseyeMapCanvasProps> = ({
  people,
  edges = EMPTY_EDGES,
  focusPersonId,
  onSelectPerson,
  onEditPerson,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const centeredPersonIdRef = useRef<string | null>(null);

  // Parse approximate birth year from string (e.g. "1942", "circa 1940", "12 Apr 1968")
  const parseYear = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(1[6-9][0-9]{2}|20[0-2][0-9])\b/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Node dimensions
  const NODE_WIDTH = 210;
  const NODE_HEIGHT = 90;
  const HORIZONTAL_GAP = 55;
  const VERTICAL_GAP = 140;

  // Calculate layout: topological generational tiers + partner alignment
  const { nodes, connections, bounds } = useMemo(() => {
    if (people.length === 0) {
      return {
        nodes: [] as PositionedNode[],
        connections: [] as RenderedEdge[],
        bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 },
      };
    }

    // 1. Build adjacency maps
    const childToParents = new Map<string, string[]>();
    const parentToChildren = new Map<string, string[]>();
    const partnerMap = new Map<string, Set<string>>();

    people.forEach((p) => {
      childToParents.set(p.id, []);
      parentToChildren.set(p.id, []);
      partnerMap.set(p.id, new Set());
    });

    edges.forEach((e) => {
      if (e.edge_type === 'partner') {
        partnerMap.get(e.source_id)?.add(e.target_id);
        partnerMap.get(e.target_id)?.add(e.source_id);
      } else if (e.edge_type === 'parent_child') {
        childToParents.get(e.target_id)?.push(e.source_id);
        parentToChildren.get(e.source_id)?.push(e.target_id);
      }
    });

    // 2. Compute generational depths using DAG relaxation
    const depths = new Map<string, number>();
    people.forEach((p) => depths.set(p.id, 0));

    // Multiple passes to settle depths across parent-child links and partner pairs
    for (let pass = 0; pass < people.length + 5; pass++) {
      let changed = false;

      // Rule A: Parent-child pushes child to at least parent.depth + 1
      edges.forEach((e) => {
        if (e.edge_type === 'parent_child') {
          const parentDepth = depths.get(e.source_id) ?? 0;
          const currentChildDepth = depths.get(e.target_id) ?? 0;
          if (currentChildDepth < parentDepth + 1) {
            depths.set(e.target_id, parentDepth + 1);
            changed = true;
          }
        }
      });

      // Rule B: Partners share the same generational depth (max of both)
      edges.forEach((e) => {
        if (e.edge_type === 'partner') {
          const depth1 = depths.get(e.source_id) ?? 0;
          const depth2 = depths.get(e.target_id) ?? 0;
          const maxDepth = Math.max(depth1, depth2);
          if (depth1 !== maxDepth) {
            depths.set(e.source_id, maxDepth);
            changed = true;
          }
          if (depth2 !== maxDepth) {
            depths.set(e.target_id, maxDepth);
            changed = true;
          }
        }
      });

      if (!changed) break;
    }

    // 3. Fallback for disconnected nodes without parents/children: group by birth years
    const hasEdges = edges.length > 0;
    if (!hasEdges) {
      const sorted = [...people].sort((a, b) => {
        const yA = parseYear(a.birth_date);
        const yB = parseYear(b.birth_date);
        if (yA !== null && yB !== null) return yA - yB;
        if (yA !== null) return -1;
        if (yB !== null) return 1;
        return a.first_name.localeCompare(b.first_name);
      });
      const years = sorted.map((p) => parseYear(p.birth_date)).filter((y): y is number => y !== null);
      if (years.length >= 2) {
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        const span = Math.max(1, maxYear - minYear);
        const tierStep = span / 3;
        sorted.forEach((p) => {
          const y = parseYear(p.birth_date);
          const tierIdx = y === null ? 1 : Math.min(2, Math.floor((y - minYear) / Math.max(1, tierStep)));
          depths.set(p.id, tierIdx);
        });
      }
    }

    // 4. Group people into tiers by depth
    const tierMap = new Map<number, MapPerson[]>();
    people.forEach((p) => {
      const d = depths.get(p.id) ?? 0;
      if (!tierMap.has(d)) tierMap.set(d, []);
      tierMap.get(d)!.push(p);
    });

    const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);

    // 5. Within each tier, cluster partners together
    const calculatedNodes: PositionedNode[] = [];
    const nodeMap = new Map<string, PositionedNode>();

    const maxNodesInAnyTier = Math.max(...Array.from(tierMap.values()).map((list) => list.length), 1);
    const canvasCenterX = (maxNodesInAnyTier * (NODE_WIDTH + HORIZONTAL_GAP)) / 2 + 100;

    sortedTiers.forEach((tierLevel, visualRowIdx) => {
      const tierPeople = tierMap.get(tierLevel) || [];

      // Sort tierPeople so partners sit side-by-side
      const visitedInTier = new Set<string>();
      const orderedTierPeople: MapPerson[] = [];

      tierPeople.forEach((p) => {
        if (visitedInTier.has(p.id)) return;
        visitedInTier.add(p.id);
        orderedTierPeople.push(p);

        // Append partner immediately after
        const pPartners = partnerMap.get(p.id);
        if (pPartners) {
          pPartners.forEach((partnerId) => {
            if (!visitedInTier.has(partnerId)) {
              const partnerObj = tierPeople.find((tp) => tp.id === partnerId);
              if (partnerObj) {
                visitedInTier.add(partnerId);
                orderedTierPeople.push(partnerObj);
              }
            }
          });
        }
      });

      const rowWidth = orderedTierPeople.length * NODE_WIDTH + (orderedTierPeople.length - 1) * HORIZONTAL_GAP;
      const startX = canvasCenterX - rowWidth / 2;
      const y = 90 + visualRowIdx * (NODE_HEIGHT + VERTICAL_GAP);

      orderedTierPeople.forEach((p, colIdx) => {
        const x = startX + colIdx * (NODE_WIDTH + HORIZONTAL_GAP);
        const node: PositionedNode = {
          person: p,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          tier: tierLevel,
        };
        calculatedNodes.push(node);
        nodeMap.set(p.id, node);
      });
    });

    // 6. Generate EXACT rendered edges (No dummy / proximity edges!)
    const renderedConns: RenderedEdge[] = [];

    edges.forEach((e) => {
      const sourceNode = nodeMap.get(e.source_id);
      const targetNode = nodeMap.get(e.target_id);

      if (!sourceNode || !targetNode) return;

      if (e.edge_type === 'partner') {
        const isSourceLeft = sourceNode.x < targetNode.x;
        const leftNode = isSourceLeft ? sourceNode : targetNode;
        const rightNode = isSourceLeft ? targetNode : sourceNode;

        const startX = leftNode.x + leftNode.width;
        const startY = leftNode.y + leftNode.height / 2;
        const endX = rightNode.x;
        const endY = rightNode.y + rightNode.height / 2;

        if (Math.abs(leftNode.y - rightNode.y) < 10) {
          const midX = (startX + endX) / 2;
          const midY = startY;
          renderedConns.push({
            id: e.id,
            type: 'partner',
            pathData: `M ${startX} ${startY} L ${endX} ${endY}`,
            sourceNode,
            targetNode,
            midX,
            midY,
          });
        } else {
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          renderedConns.push({
            id: e.id,
            type: 'partner',
            pathData: `M ${startX} ${startY} C ${startX + 30} ${startY}, ${endX - 30} ${endY}, ${endX} ${endY}`,
            sourceNode,
            targetNode,
            midX,
            midY,
          });
        }
      } else if (e.edge_type === 'parent_child') {
        const startX = sourceNode.x + sourceNode.width / 2;
        const startY = sourceNode.y + sourceNode.height;
        const endX = targetNode.x + targetNode.width / 2;
        const endY = targetNode.y;
        const midY = (startY + endY) / 2;

        renderedConns.push({
          id: e.id,
          type: 'parent_child',
          pathData: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`,
          sourceNode,
          targetNode,
        });
      }
    });

    // 7. Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    calculatedNodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    });

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }

    return {
      nodes: calculatedNodes,
      connections: renderedConns,
      bounds: {
        minX: minX - 100,
        minY: minY - 50,
        maxX: maxX + 100,
        maxY: maxY + 100,
        width: Math.max(800, maxX - minX + 200),
        height: Math.max(600, maxY - minY + 150),
      },
    };
  }, [people, edges]);

  // Center on focus person if specified
  useEffect(() => {
    if (focusPersonId && focusPersonId !== centeredPersonIdRef.current && nodes.length > 0) {
      const target = nodes.find((n) => n.person.id === focusPersonId);
      if (target) {
        centeredPersonIdRef.current = focusPersonId;
        setPan({
          x: 400 - (target.x + target.width / 2),
          y: 250 - (target.y + target.height / 2),
        });
        setZoom(1);
      }
    }
  }, [focusPersonId, nodes]);

  // Zoom controls
  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.25, 3.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.25, 0.4));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      role="region"
      aria-label="Family Tree Overview Map"
      className="relative w-full h-[650px] bg-slate-100 rounded-3xl border-2 border-slate-300 overflow-hidden select-none flex flex-col shadow-inner"
    >
      {/* Top Controls & Legend Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <span className="font-bold text-slate-800 text-sm">
              Overview Map ({people.length} {people.length === 1 ? 'member' : 'members'})
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-bold pl-2 border-l border-slate-200">
            <span className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
              <span className="w-3 h-0.5 bg-rose-500 rounded inline-block" />
              <span>Partner</span>
            </span>
            <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              <span className="w-3 h-0.5 bg-blue-500 rounded inline-block" />
              <span>Parent → Child</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom In"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom Out"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="w-[1px] h-6 bg-slate-200 mx-0.5" />
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset View"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {people.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 mb-3">
            <User className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">No Family Records Yet</h3>
          <p className="text-sm text-slate-600 max-w-sm">
            Add family members in the Focus View to see your complete multi-generation overview map here.
          </p>
        </div>
      ) : (
        /* SVG Interactive Canvas */
        <svg
          ref={svgRef}
          aria-label="Family tree pedigree chart"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="dot-grid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" className="fill-slate-300" />
              </pattern>
            </defs>
            <rect
              x={bounds.minX - 500}
              y={bounds.minY - 500}
              width={bounds.width + 1000}
              height={bounds.height + 1000}
              fill="url(#dot-grid)"
            />

            {/* Connecting Lines with Distinct Styles and Colors */}
            {connections.map((conn) => {
              const isPartner = conn.type === 'partner';
              const strokeColor = isPartner ? '#f43f5e' : '#3b82f6';
              const strokeWidth = isPartner ? 3.5 : 2.5;

              return (
                <g key={conn.id}>
                  {/* Outer glow line for high visibility */}
                  <path
                    d={conn.pathData}
                    fill="none"
                    stroke={isPartner ? '#fecdd3' : '#dbeafe'}
                    strokeWidth={strokeWidth + 4}
                    strokeLinecap="round"
                  />
                  {/* Main solid line */}
                  <path
                    d={conn.pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                  />
                  {/* Partner Heart Indicator at midpoint */}
                  {isPartner && conn.midX !== undefined && conn.midY !== undefined && (
                    <g transform={`translate(${conn.midX - 10}, ${conn.midY - 10})`}>
                      <circle cx="10" cy="10" r="10" fill="#fff" stroke="#f43f5e" strokeWidth="2" />
                      <path
                        d="M10 14.5l-1.1-1C5 10 2.5 7.8 2.5 5.2 2.5 3 4.2 1.5 6.5 1.5c1.3 0 2.5.6 3.5 1.6 1-1 2.2-1.6 3.5-1.6 2.3 0 4 1.5 4 3.7 0 2.6-2.5 4.8-6.4 8.3l-1.1 1z"
                        fill="#f43f5e"
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Person Nodes */}
            {nodes.map((node) => {
              const isFocus = node.person.id === (selectedPersonId || focusPersonId);
              const fullName = `${node.person.first_name} ${node.person.last_name}`.trim();

              let datesLabel = '';
              if (node.person.birth_date && node.person.death_date) {
                datesLabel = `${node.person.birth_date} – ${node.person.death_date}`;
              } else if (node.person.birth_date) {
                datesLabel = `b. ${node.person.birth_date}`;
              } else if (node.person.death_date) {
                datesLabel = `d. ${node.person.death_date}`;
              } else {
                datesLabel = node.person.is_living ? 'Living' : '';
              }

              return (
                <g
                  key={node.person.id}
                  data-testid={`map-node-${node.person.id}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPersonId(node.person.id);
                    onSelectPerson?.(node.person.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPersonId(node.person.id);
                      onSelectPerson?.(node.person.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${fullName}${datesLabel ? `, ${datesLabel}` : ''}`}
                  className="cursor-pointer group focus:outline-none"
                >
                  {/* Node Background Rectangle */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="16"
                    ry="16"
                    className={`transition-all duration-200 ${
                      isFocus
                        ? 'fill-amber-50 stroke-amber-500 stroke-[3]'
                        : 'fill-white stroke-slate-300 stroke-2 group-hover:stroke-amber-400 group-hover:shadow-md'
                    }`}
                  />

                  {/* Focus Ring Indicator */}
                  {isFocus && (
                    <rect
                      x="-4"
                      y="-4"
                      width={node.width + 8}
                      height={node.height + 8}
                      rx="20"
                      ry="20"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      className="animate-pulse"
                    />
                  )}

                  {/* Avatar Circle */}
                  <circle
                    cx="32"
                    cy="45"
                    r="18"
                    className={isFocus ? 'fill-amber-200' : 'fill-slate-100 group-hover:fill-amber-100'}
                  />
                  <text
                    x="32"
                    y="51"
                    textAnchor="middle"
                    className={`text-xs font-black select-none ${
                      isFocus ? 'fill-amber-900' : 'fill-slate-600'
                    }`}
                  >
                    {(node.person.first_name?.[0] || '').toUpperCase()}
                    {(node.person.last_name?.[0] || '').toUpperCase()}
                  </text>

                  {/* Name Text */}
                  <text
                    x="60"
                    y="38"
                    className={`text-sm font-extrabold select-none ${
                      isFocus ? 'fill-slate-950 font-black' : 'fill-slate-900'
                    }`}
                  >
                    {fullName.length > 15 ? `${fullName.slice(0, 14)}…` : fullName}
                  </text>

                  {/* Life Dates Text */}
                  <text
                    x="60"
                    y="58"
                    className={`text-xs select-none font-bold ${
                      isFocus ? 'fill-amber-800' : 'fill-slate-500'
                    }`}
                  >
                    {datesLabel || 'Family Member'}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Floating Selected Person Action Bar */}
      {selectedPersonId && (
        (() => {
          const selected = people.find((p) => p.id === selectedPersonId);
          if (!selected) return null;
          return (
            <div
              data-testid="map-selected-toolbar"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-400 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
                  {(selected.first_name?.[0] || '').toUpperCase()}
                  {(selected.last_name?.[0] || '').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-extrabold leading-tight">
                    {selected.first_name} {selected.last_name}
                  </p>
                  <p className="text-[11px] text-slate-300 font-medium">
                    {selected.birth_date ? `b. ${selected.birth_date}` : 'Family Member'}
                  </p>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-700" />

              <div className="flex items-center gap-2">
                {onEditPerson && (
                  <button
                    type="button"
                    onClick={() => onEditPerson(selected)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Details</span>
                  </button>
                )}

                {onSelectPerson && (
                  <button
                    type="button"
                    onClick={() => onSelectPerson(selected.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>Focus View</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  aria-label="Close selection bar"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};
